"""Introspecção de schema: tabelas, colunas, índices, chaves estrangeiras."""

from __future__ import annotations

from typing import Any

from .db import Database, quote_identifier
from .errors import TableNotFound

MAX_TABLES = 2_000
MAX_COLUMNS = 500


def list_tables(db: Database) -> list[dict[str, Any]]:
    sql = """
        SELECT name, type
        FROM sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name COLLATE NOCASE
    """
    result = db.execute(sql, max_rows=MAX_TABLES)
    return [{"name": row[0], "type": row[1]} for row in result.rows]


def table_exists(db: Database, table: str) -> bool:
    result = db.execute(
        """
        SELECT 1 FROM sqlite_master
        WHERE type IN ('table','view') AND name = ? COLLATE NOCASE
        LIMIT 1
        """,
        (table,),
        max_rows=1,
    )
    return bool(result.rows)


def resolve_table_name(db: Database, table: str) -> str:
    """Casa o nome da tabela com o schema real, preservando a caixa original."""
    result = db.execute(
        """
        SELECT name FROM sqlite_master
        WHERE type IN ('table','view') AND name = ? COLLATE NOCASE
        LIMIT 1
        """,
        (table,),
        max_rows=1,
    )
    if not result.rows:
        raise TableNotFound(f"Tabela '{table}' não encontrada.")
    return str(result.rows[0][0])


def list_columns(db: Database, table: str) -> list[dict[str, Any]]:
    result = db.execute(f"PRAGMA table_info({quote_identifier(table)})", max_rows=MAX_COLUMNS)
    columns = []
    for cid, name, decl_type, notnull, default, pk in result.rows:
        columns.append(
            {
                "cid": cid,
                "name": name,
                "type": decl_type or "",
                "not_null": bool(notnull),
                "default": default,
                "primary_key": bool(pk),
                "kind": classify_type(decl_type or ""),
            }
        )
    return columns


def list_indexes(db: Database, table: str) -> list[dict[str, Any]]:
    result = db.execute(f"PRAGMA index_list({quote_identifier(table)})", max_rows=64)
    indexes = []
    for row in result.rows:
        # seq, name, unique, origin, partial
        name = row[1]
        cols = db.execute(
            f"PRAGMA index_info({quote_identifier(name)})", max_rows=64
        ).rows
        indexes.append(
            {
                "name": name,
                "unique": bool(row[2]),
                "origin": row[3],
                "partial": bool(row[4]) if len(row) > 4 else False,
                "columns": [c[2] for c in cols if c[2] is not None],
            }
        )
    return indexes


def list_foreign_keys(db: Database, table: str) -> list[dict[str, Any]]:
    result = db.execute(f"PRAGMA foreign_key_list({quote_identifier(table)})", max_rows=64)
    return [
        {
            "id": row[0],
            "table": row[2],
            "from": row[3],
            "to": row[4],
            "on_update": row[5],
            "on_delete": row[6],
        }
        for row in result.rows
    ]


def describe_table(db: Database, table: str) -> dict[str, Any]:
    table = resolve_table_name(db, table)
    columns = list_columns(db, table)
    kind = db.execute(
        "SELECT type FROM sqlite_master WHERE name = ? COLLATE NOCASE LIMIT 1",
        (table,),
        max_rows=1,
    )
    return {
        "name": table,
        "type": kind.rows[0][0] if kind.rows else "table",
        "columns": columns,
        "indexes": list_indexes(db, table),
        "foreign_keys": list_foreign_keys(db, table),
        "column_count": len(columns),
    }


def classify_type(decl_type: str) -> str:
    """Mapeia afinidade declarada do SQLite para categoria semântica."""
    t = (decl_type or "").upper()
    if not t:
        return "unknown"
    if any(token in t for token in ("INT", "BOOL")):
        return "integer"
    if any(token in t for token in ("CHAR", "CLOB", "TEXT", "STRING")):
        return "text"
    if "BLOB" in t or t == "":
        return "blob"
    if any(token in t for token in ("REAL", "FLOA", "DOUB", "NUMERIC", "DECIMAL")):
        return "real"
    if "DATE" in t or "TIME" in t:
        return "datetime"
    return "other"


def primary_key_columns(columns: list[dict[str, Any]]) -> list[str]:
    return [c["name"] for c in columns if c["primary_key"]]
