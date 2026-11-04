"""Perfil de colunas e séries temporais genéricas.

Tudo é derivado do schema real — nada de nomes de tabela/coluna hardcoded.
Amostragem limitada para manter a resposta rápida em bases grandes.
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import UTC, datetime
from typing import Any

from . import schema
from .cache import TTLCache
from .db import Database, quote_identifier
from .errors import BadRequest
from .settings import AppSettings

DATETIME_HINTS = re.compile(r"(date|time|timestamp|created|updated|at$|dia|data|hora)", re.I)
NUMERIC_KINDS = {"integer", "real"}
_MAX_TOP_VALUES = 8
_MAX_HISTOGRAM_BINS = 12


def detect_datetime_column(columns: list[dict[str, Any]], sample: list[list[Any]]) -> str | None:
    """Heurística: nome sugestivo + amostra de valores convertíveis em data."""
    candidates = [c for c in columns if DATETIME_HINTS.search(c["name"]) and c["kind"] in {"text", "integer", "real", "datetime"}]
    for col in sorted(candidates, key=lambda c: c["kind"] != "datetime"):
        index = next((i for i, c in enumerate(columns) if c["name"] == col["name"]), None)
        if index is None:
            continue
        values = [row[index] for row in sample if row[index] is not None][:20]
        if values and sum(1 for v in values if parse_datetime(v)) >= max(1, len(values) // 2):
            return col["name"]
    return None


def parse_datetime(value: Any) -> datetime | None:
    """Aceita ISO-8601, epoch (s/ms) e formatos comuns."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        if number > 1e12:  # milissegundos
            number /= 1000
        if 0 < number < 4_102_444_800:  # 1970..2100
            return datetime.fromtimestamp(number, tz=UTC)
        return None
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    if re.fullmatch(r"\d{10}(\.\d+)?", text):
        return datetime.fromtimestamp(float(text), tz=UTC)
    if re.fullmatch(r"\d{13}", text):
        return datetime.fromtimestamp(float(text) / 1000, tz=UTC)
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d/%m/%Y %H:%M"):
            try:
                parsed = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
        else:
            return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _numeric(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", "."))
        except ValueError:
            return None
    return None


class ProfileService:
    def __init__(self, settings: AppSettings, cache: TTLCache) -> None:
        self._settings = settings
        self._cache = cache

    # ------------------------------------------------------------------ #
    def profile(self, db_id: str, db: Database, table: str) -> dict[str, Any]:
        table = schema.resolve_table_name(db, table)
        key = f"profile:{db_id}:{table}"
        cached = self._cache.get(key)
        if cached is not None:
            return cached

        columns = schema.list_columns(db, table)
        limit = self._settings.database.stats_row_limit
        col_names = [c["name"] for c in columns]
        select_cols = ", ".join(quote_identifier(c) for c in col_names)
        sample_result = db.execute(
            f"SELECT {select_cols} FROM {quote_identifier(table)} LIMIT ?",
            (limit,),
            max_rows=limit,
        )
        sample = sample_result.rows
        total_rows = int(db.scalar(f"SELECT COUNT(*) FROM {quote_identifier(table)}") or 0)
        datetime_column = detect_datetime_column(columns, sample)

        profiles: list[dict[str, Any]] = []
        for index, column in enumerate(columns):
            values = [row[index] for row in sample]
            profiles.append(
                self._profile_column(column, values, datetime_column == column["name"])
            )

        payload = {
            "table": table,
            "row_total": total_rows,
            "sampled_rows": len(sample),
            "sampled": len(sample) < total_rows,
            "datetime_column": datetime_column,
            "numeric_columns": [p["name"] for p in profiles if p["kind"] in NUMERIC_KINDS],
            "columns": profiles,
        }
        self._cache.set(key, payload, self._settings.database.stats_cache_ttl_seconds)
        return payload

    def _profile_column(
        self, column: dict[str, Any], values: list[Any], is_datetime: bool
    ) -> dict[str, Any]:
        non_null = [v for v in values if v is not None]
        null_count = len(values) - len(non_null)
        distinct = len({_hashable(v) for v in non_null})
        profile: dict[str, Any] = {
            "name": column["name"],
            "type": column["type"],
            "kind": column["kind"],
            "primary_key": column["primary_key"],
            "not_null": column["not_null"],
            "null_ratio": round(null_count / len(values), 4) if values else 0.0,
            "distinct_sampled": distinct,
            "is_datetime": is_datetime,
        }

        numeric_values = [n for n in (_numeric(v) for v in non_null) if n is not None]
        numeric_ratio = len(numeric_values) / len(non_null) if non_null else 0
        if numeric_values and numeric_ratio >= 0.9 and not is_datetime:
            numeric_values_sorted = sorted(numeric_values)
            count = len(numeric_values_sorted)
            profile.update(
                {
                    "kind": "number",
                    "min": numeric_values_sorted[0],
                    "max": numeric_values_sorted[-1],
                    "mean": round(sum(numeric_values_sorted) / count, 4),
                    "median": numeric_values_sorted[count // 2],
                    "sum": round(sum(numeric_values_sorted), 4),
                    "histogram": _histogram(numeric_values_sorted),
                }
            )
        else:
            counter = Counter(str(v) for v in non_null)
            # Em colunas temporais os "top values" são ruído (timestamps únicos);
            # o intervalo min/max é a informação útil.
            if not is_datetime:
                profile["top_values"] = [
                    {"value": value[:120], "count": count}
                    for value, count in counter.most_common(_MAX_TOP_VALUES)
                ]
            if is_datetime:
                parsed = sorted(
                    d for d in (parse_datetime(v) for v in non_null) if d is not None
                )
                if parsed:
                    profile["range"] = {
                        "min": parsed[0].isoformat(),
                        "max": parsed[-1].isoformat(),
                    }
        return profile

    # ------------------------------------------------------------------ #
    def timeline(
        self,
        db: Database,
        table: str,
        *,
        value_column: str,
        time_column: str | None = None,
        agg: str = "avg",
        limit: int = 120,
    ) -> dict[str, Any]:
        """Série temporal genérica: agrega `value_column` por dia/hora."""
        table = schema.resolve_table_name(db, table)
        columns = schema.list_columns(db, table)
        names = [c["name"] for c in columns]
        if value_column not in names:
            raise BadRequest(f"Coluna de valor '{value_column}' não existe em '{table}'.")

        sample = db.execute(
            f"SELECT {', '.join(quote_identifier(n) for n in names)} FROM {quote_identifier(table)} LIMIT 50",
            max_rows=50,
        ).rows
        time_column = time_column or detect_datetime_column(columns, sample)

        agg_fn = {"avg": "AVG", "sum": "SUM", "max": "MAX", "min": "MIN", "count": "COUNT"}.get(agg)
        if agg_fn is None:
            raise BadRequest(f"Agregação inválida: {agg}")

        value_col = quote_identifier(value_column)
        if not time_column:
            # Sem eixo temporal: devolve distribuição em faixas por rowid
            result = db.execute(
                f"SELECT {agg_fn}({value_col}) FROM {quote_identifier(table)}",
                max_rows=1,
            )
            return {
                "table": table,
                "time_column": None,
                "value_column": value_column,
                "aggregation": agg,
                "points": [{"label": table, "value": result.rows[0][0] if result.rows else None}],
            }

        time_col = quote_identifier(time_column)
        # Normaliza epoch (s/ms) e ISO para dia; agrupa em buckets diários.
        bucket = (
            f"CASE WHEN typeof({time_col}) IN ('integer','real') "
            f"THEN date({time_col}, 'unixepoch') "
            f"ELSE date({time_col}) END"
        )
        sql = (
            f"SELECT {bucket} AS bucket, {agg_fn}({value_col}) AS value, COUNT(*) AS n "
            f"FROM {quote_identifier(table)} "
            f"WHERE {time_col} IS NOT NULL AND {bucket} IS NOT NULL "
            f"GROUP BY bucket ORDER BY bucket DESC LIMIT ?"
        )
        result = db.execute(sql, (limit,), max_rows=limit)
        points = [
            {"label": row[0], "value": round(row[1], 4) if isinstance(row[1], float) else row[1], "count": row[2]}
            for row in reversed(result.rows)
        ]
        return {
            "table": table,
            "time_column": time_column,
            "value_column": value_column,
            "aggregation": agg,
            "points": points,
        }


def _hashable(value: Any) -> Any:
    if isinstance(value, dict):  # BLOBs serializados
        return (value.get("__type"), value.get("size"), value.get("preview"))
    return value


def _histogram(values: list[float]) -> list[dict[str, float]]:
    if not values:
        return []
    low, high = values[0], values[-1]
    if low == high:
        return [{"from": low, "to": high, "count": len(values)}]
    span = (high - low) / _MAX_HISTOGRAM_BINS
    bins = [0] * _MAX_HISTOGRAM_BINS
    for value in values:
        index = min(int((value - low) / span), _MAX_HISTOGRAM_BINS - 1)
        bins[index] += 1
    return [
        {
            "from": round(low + i * span, 4),
            "to": round(low + (i + 1) * span, 4),
            "count": bins[i],
        }
        for i in range(_MAX_HISTOGRAM_BINS)
    ]
