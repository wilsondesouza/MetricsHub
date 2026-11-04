"""Acesso a SQLite com defesa em profundidade.

Camadas de proteção:
1. **Somente-leitura por padrão** (`mode=ro` + `PRAGMA query_only`).
2. **Autorizador SQLite** que nega qualquer operação de escrita/DDL/ATTACH.
3. **Timeout por consulta** via `set_progress_handler` (aborta e devolve 504).
4. **Identificadores sempre citados** e validados contra o schema real.
5. **Serialização segura** de tipos (BLOB, NaN, datas) para JSON.
"""

from __future__ import annotations

import math
import sqlite3
import time
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .errors import DatabaseNotFound, QueryFailed, QueryTimeout
from .settings import AppSettings, DatabaseConfig

# Códigos de autorização permitidos em modo leitura.
_SQLITE_OK = sqlite3.SQLITE_OK
_ALLOWED_ACTIONS = {
    sqlite3.SQLITE_SELECT,
    sqlite3.SQLITE_READ,
    sqlite3.SQLITE_FUNCTION,
    getattr(sqlite3, "SQLITE_RECURSIVE", 33),
}

# PRAGMAs de introspecção (somente leitura). Qualquer outro pragma é negado.
_SQLITE_PRAGMA = getattr(sqlite3, "SQLITE_PRAGMA", 19)
_ALLOWED_PRAGMAS = {
    "table_info",
    "table_xinfo",
    "index_list",
    "index_info",
    "index_xinfo",
    "foreign_key_list",
    "database_list",
    "collation_list",
    "compile_options",
    "encoding",
    "page_count",
    "page_size",
    "schema_version",
    "user_version",
}


def quote_identifier(identifier: str) -> str:
    """Cita um identificador SQLite. Única via de interpolação de nomes."""
    if not isinstance(identifier, str) or "\x00" in identifier:
        raise QueryFailed("Identificador inválido.")
    return '"' + identifier.replace('"', '""') + '"'


def serialize_value(value: Any) -> Any:
    """Converte valores SQLite em JSON-safe, sem perder informação relevante."""
    if value is None:
        return None
    if isinstance(value, bytes):
        return {
            "__type": "blob",
            "size": len(value),
            "preview": value[:32].hex(),
        }
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


@dataclass(slots=True)
class QueryResult:
    columns: list[str]
    rows: list[list[Any]]
    duration_ms: float
    truncated: bool = False

    def as_dicts(self) -> list[dict[str, Any]]:
        return [dict(zip(self.columns, row)) for row in self.rows]


class Database:
    """Wrapper de uma conexão SQLite com prazo e autorizador de leitura."""

    def __init__(self, config: DatabaseConfig, *, readonly: bool, timeout_ms: int) -> None:
        self.config = config
        self.readonly = readonly
        self.timeout_ms = timeout_ms
        self._deadline: float | None = None
        self._interrupted = False
        self.conn = self._connect()

    # -- construção --------------------------------------------------------- #
    def _connect(self) -> sqlite3.Connection:
        path: Path = self.config.path
        if self.readonly:
            uri = f"file:{path.as_posix()}?mode=ro"
            conn = sqlite3.connect(uri, uri=True, timeout=self.timeout_ms / 1000)
        else:  # pragma: no cover - explícito para documentar o risco
            conn = sqlite3.connect(path, timeout=self.timeout_ms / 1000)

        conn.row_factory = None
        conn.execute("PRAGMA query_only = ON" if self.readonly else "PRAGMA query_only = OFF")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 3000")
        conn.set_progress_handler(self._progress, 5_000)
        if self.readonly:
            conn.set_authorizer(self._authorizer)
        return conn

    def _progress(self, *_args: Any) -> int:
        if self._deadline is not None and time.monotonic() > self._deadline:
            self._interrupted = True
            return 1  # aborta a instrução
        return 0

    def _authorizer(self, action: int, arg1: Any, arg2: Any, *_rest: Any) -> int:
        if action in _ALLOWED_ACTIONS:
            return _SQLITE_OK
        if action == _SQLITE_PRAGMA:
            pragma = str(arg1 or "").lower()
            return _SQLITE_OK if pragma in _ALLOWED_PRAGMAS else sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_DENY

    # -- execução ----------------------------------------------------------- #
    def execute(
        self,
        sql: str,
        params: Sequence[Any] = (),
        *,
        max_rows: int | None = None,
    ) -> QueryResult:
        started = time.perf_counter()
        self._interrupted = False
        self._deadline = started + self.timeout_ms / 1000
        cursor = self.conn.cursor()
        try:
            cursor.execute(sql, tuple(params))
            columns = [d[0] for d in (cursor.description or [])]
            if max_rows is None:
                raw_rows = cursor.fetchall()
            else:
                raw_rows = cursor.fetchmany(max_rows + 1)
                if len(raw_rows) > max_rows:
                    raw_rows = raw_rows[:max_rows]
                    truncated = True
                else:
                    truncated = False
            rows = [[serialize_value(v) for v in row] for row in raw_rows]
            return QueryResult(
                columns=columns,
                rows=rows,
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
                truncated=max_rows is not None and truncated,
            )
        except sqlite3.DatabaseError as exc:
            if self._interrupted:
                raise QueryTimeout(
                    f"A consulta excedeu o limite de {self.timeout_ms} ms."
                ) from exc
            message = str(exc)
            if "authorization denied" in message.lower():
                raise QueryFailed("Operação bloqueada: a aplicação opera em modo somente-leitura.") from exc
            if "no such table" in message.lower():
                raise QueryFailed(f"Tabela inexistente: {message}") from exc
            raise QueryFailed(message) from exc
        finally:
            self._deadline = None
            cursor.close()

    def iterate(self, sql: str, params: Sequence[Any] = ()) -> Iterator[tuple]:
        """Itera sem carregar tudo na memória (usado em exportações)."""
        started = time.perf_counter()
        self._interrupted = False
        self._deadline = started + self.timeout_ms * 6 / 1000  # export tem folga
        cursor = self.conn.cursor()
        try:
            cursor.execute(sql, tuple(params))
            yield from cursor
        except sqlite3.DatabaseError as exc:  # pragma: no cover - caminho raro
            if self._interrupted:
                raise QueryTimeout("Exportação excedeu o tempo limite.") from exc
            raise QueryFailed(str(exc)) from exc
        finally:
            self._deadline = None
            cursor.close()

    def scalar(self, sql: str, params: Sequence[Any] = ()) -> Any:
        result = self.execute(sql, params, max_rows=1)
        return result.rows[0][0] if result.rows else None

    def close(self) -> None:
        try:
            self.conn.close()
        except sqlite3.Error:  # pragma: no cover
            pass

    def __enter__(self) -> Database:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()


class DatabaseRegistry:
    """Resolve `db_id` -> arquivo, impedindo path traversal por construção."""

    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings
        self._by_id = {db.id: db for db in settings.databases}

    @property
    def settings(self) -> AppSettings:
        return self._settings

    def config(self, db_id: str) -> DatabaseConfig:
        config = self._by_id.get(db_id)
        if config is None:
            raise DatabaseNotFound(f"Banco de dados '{db_id}' não está registrado.")
        return config

    def open(self, db_id: str) -> Database:
        config = self.config(db_id)
        if not config.path.exists():
            raise DatabaseNotFound(
                f"Arquivo do banco '{config.name}' não encontrado em {config.path}."
            )
        if not config.path.is_file():
            raise DatabaseNotFound(f"Caminho inválido para o banco '{config.name}'.")
        return Database(
            config,
            readonly=config.is_readonly and self._settings.database.read_only,
            timeout_ms=self._settings.database.query_timeout_ms,
        )

    def status(self) -> list[dict[str, Any]]:
        out = []
        for config in self._by_id.values():
            exists = config.path.is_file()
            out.append(
                {
                    "id": config.id,
                    "name": config.name,
                    "description": config.description,
                    "path": str(config.path),
                    "exists": exists,
                    "readonly": config.is_readonly,
                    "size_bytes": config.path.stat().st_size if exists else 0,
                }
            )
        return out


def rows_to_dicts(columns: Iterable[str], rows: Iterable[Sequence[Any]]) -> list[dict[str, Any]]:
    cols = list(columns)
    return [dict(zip(cols, row)) for row in rows]
