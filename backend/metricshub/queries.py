"""Consulta paginada de tabelas com busca, ordenação e filtros validados."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal

from . import schema
from .cache import TTLCache
from .db import Database, quote_identifier, rows_to_dicts
from .errors import BadRequest, ColumnNotFound
from .settings import AppSettings

SortOrder = Literal["asc", "desc"]
Operator = Literal["eq", "ne", "contains", "starts", "gt", "gte", "lt", "lte", "is_null", "not_null"]

_OPERATORS: dict[str, str] = {
    "eq": "{col} = ?",
    "ne": "{col} <> ?",
    "contains": "{col} LIKE ?",
    "starts": "{col} LIKE ?",
    "gt": "{col} > ?",
    "gte": "{col} >= ?",
    "lt": "{col} < ?",
    "lte": "{col} <= ?",
    "is_null": "{col} IS NULL",
    "not_null": "{col} IS NOT NULL",
}
_MAX_SEARCH_TERM = 200


@dataclass(slots=True)
class Filter:
    column: str
    operator: str
    value: str | None

    def to_sql(self, quoted: str) -> tuple[str, list[Any]]:
        template = _OPERATORS[self.operator]
        if self.operator in {"is_null", "not_null"}:
            return template.format(col=quoted), []
        value: Any = self.value
        if self.operator == "contains":
            value = f"%{_escape_like(self.value or '')}%"
        elif self.operator == "starts":
            value = f"{_escape_like(self.value or '')}%"
        elif self.operator in {"gt", "gte", "lt", "lte"}:
            value = _coerce_number(self.value)
        return template.format(col=quoted), [value]


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _coerce_number(value: str | None) -> Any:
    if value is None or value == "":
        raise BadRequest("Operador numérico exige um valor.")
    try:
        return float(value) if "." in value else int(value)
    except ValueError as exc:
        raise BadRequest(f"Valor numérico inválido: {value!r}") from exc


class TableQueryService:
    def __init__(self, settings: AppSettings, cache: TTLCache) -> None:
        self._settings = settings
        self._cache = cache

    # ------------------------------------------------------------------ #
    def count_rows(self, db_id: str, db: Database, table: str) -> int:
        key = f"count:{db_id}:{table}"
        cached = self._cache.get(key)
        if cached is not None:
            return int(cached)
        total = int(db.scalar(f"SELECT COUNT(*) FROM {quote_identifier(table)}") or 0)
        self._cache.set(key, total, self._settings.database.count_cache_ttl_seconds)
        return total

    def browse(
        self,
        db_id: str,
        db: Database,
        table: str,
        *,
        page: int = 1,
        page_size: int | None = None,
        sort: str | None = None,
        order: SortOrder = "asc",
        search: str | None = None,
        filters: list[Filter] | None = None,
    ) -> dict[str, Any]:
        table = schema.resolve_table_name(db, table)
        columns = schema.list_columns(db, table)
        column_names = [c["name"] for c in columns]

        page_size = min(
            page_size or self._settings.pagination.default_page_size,
            self._settings.pagination.max_page_size,
        )
        if page < 1:
            raise BadRequest("page deve ser >= 1")
        if page_size < 1:
            raise BadRequest("page_size deve ser >= 1")

        where_clauses: list[str] = []
        params: list[Any] = []

        search = (search or "").strip()
        if search:
            if len(search) > _MAX_SEARCH_TERM:
                raise BadRequest(f"Termo de busca excede {_MAX_SEARCH_TERM} caracteres.")
            escaped = _escape_like(search)
            like_clauses = [
                f"CAST({quote_identifier(col)} AS TEXT) LIKE ? ESCAPE '\\'" for col in column_names
            ]
            where_clauses.append("(" + " OR ".join(like_clauses) + ")")
            params.extend([f"%{escaped}%"] * len(column_names))

        for flt in filters or []:
            if flt.column not in column_names:
                raise ColumnNotFound(f"Coluna '{flt.column}' não existe em '{table}'.")
            if flt.operator not in _OPERATORS:
                raise BadRequest(f"Operador inválido: {flt.operator}")
            sql_fragment, values = flt.to_sql(quote_identifier(flt.column))
            where_clauses.append(sql_fragment)
            params.extend(values)

        where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        if sort:
            if sort not in column_names:
                raise ColumnNotFound(f"Coluna de ordenação '{sort}' não existe em '{table}'.")
            direction = "DESC" if order == "desc" else "ASC"
            order_sql = f" ORDER BY {quote_identifier(sort)} {direction}"
        else:
            order_sql = ""

        total = self.count_rows(db_id, db, table) if not where_clauses else self._filtered_count(
            db, table, where_sql, params
        )
        pages = max(1, math.ceil(total / page_size))
        offset = (page - 1) * page_size

        select_cols = ", ".join(quote_identifier(c) for c in column_names)
        sql = (
            f"SELECT {select_cols} FROM {quote_identifier(table)}"
            f"{where_sql}{order_sql} LIMIT ? OFFSET ?"
        )
        result = db.execute(sql, [*params, page_size, offset], max_rows=page_size)

        return {
            "table": table,
            "columns": columns,
            "rows": rows_to_dicts(result.columns, result.rows),
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "pages": pages,
                "has_next": page < pages,
                "has_prev": page > 1,
            },
            "query_ms": result.duration_ms,
            "order": {"column": sort, "direction": order} if sort else None,
            "search": search or None,
            "filters": [
                {"column": f.column, "operator": f.operator, "value": f.value}
                for f in filters or []
            ],
        }

    def _filtered_count(
        self, db: Database, table: str, where_sql: str, params: list[Any]
    ) -> int:
        sql = f"SELECT COUNT(*) FROM {quote_identifier(table)}{where_sql}"
        return int(db.scalar(sql, params) or 0)

    # ------------------------------------------------------------------ #
    def overview(self, db_id: str, db: Database) -> dict[str, Any]:
        """Resumo do banco: tabelas, contagens e tamanho estimado."""
        key = f"overview:{db_id}"
        cached = self._cache.get(key)
        if cached is not None:
            return cached

        tables = schema.list_tables(db)
        details: list[dict[str, Any]] = []
        for item in tables:
            name = item["name"]
            try:
                count = self.count_rows(db_id, db, name)
                col_count = len(schema.list_columns(db, name))
            except Exception:  # pragma: no cover - views quebradas não derrubam o overview
                count, col_count = 0, 0
            details.append(
                {"name": name, "type": item["type"], "rows": count, "columns": col_count}
            )

        payload = {
            "database": db_id,
            "table_count": len(details),
            "row_total": sum(d["rows"] for d in details),
            "tables": details,
            "size_bytes": db.config.path.stat().st_size if db.config.path.exists() else 0,
        }
        self._cache.set(
            key, payload, self._settings.database.stats_cache_ttl_seconds
        )
        return payload

    def invalidate(self, db_id: str | None = None) -> None:
        self._cache.invalidate(None if db_id is None else f"count:{db_id}")
        if db_id:
            self._cache.invalidate(f"overview:{db_id}")
            self._cache.invalidate(f"profile:{db_id}")
