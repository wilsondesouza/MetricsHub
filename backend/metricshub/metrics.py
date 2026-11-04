"""Métricas configuráveis: valores atuais e histórico agregado.

Genérico: as séries vêm de `[[metrics.sources]]` no config, não do código.
"""

from __future__ import annotations

from typing import Any

from . import schema
from .db import Database, quote_identifier
from .errors import BadRequest, NotFound
from .profile import parse_datetime
from .settings import AppSettings, MetricSourceConfig


class MetricsService:
    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings

    # ------------------------------------------------------------------ #
    def describe(self) -> list[dict[str, Any]]:
        return [
            {
                "id": source.id,
                "database": source.database,
                "table": source.table,
                "title": source.title or source.table,
                "series": [s.model_dump() for s in source.series],
            }
            for source in self._settings.metrics.sources
        ]

    def _source(self, source_id: str) -> MetricSourceConfig:
        source = self._settings.metric_source(source_id)
        if source is None:
            raise NotFound(f"Fonte de métricas '{source_id}' não configurada.")
        return source

    def _validate_columns(self, db: Database, source: MetricSourceConfig) -> list[str]:
        available = {c["name"] for c in schema.list_columns(db, source.table)}
        missing = [
            col
            for col in [source.timestamp_column, *[s.column for s in source.series]]
            if col not in available
        ]
        if missing:
            raise BadRequest(
                f"Colunas ausentes em '{source.table}': {', '.join(missing)}"
            )
        return list(available)

    # ------------------------------------------------------------------ #
    def current(self, db: Database, source_id: str) -> dict[str, Any]:
        source = self._source(source_id)
        self._validate_columns(db, source)
        columns = [source.timestamp_column, *[s.column for s in source.series]]
        select_cols = ", ".join(quote_identifier(c) for c in columns)
        result = db.execute(
            f"SELECT {select_cols} FROM {quote_identifier(source.table)} "
            f"ORDER BY {quote_identifier(source.timestamp_column)} DESC LIMIT 1",
            max_rows=1,
        )
        if not result.rows:
            raise NotFound("A fonte de métricas ainda não possui amostras.")

        row = result.rows[0]
        values = {
            series.key: _round_metric(row[index + 1])
            for index, series in enumerate(source.series)
        }
        return {
            "source": source.id,
            "timestamp": row[0],
            "values": values,
            "series": [s.model_dump() for s in source.series],
        }

    def history(
        self, db: Database, source_id: str, *, limit: int = 120, bucket: str = "auto"
    ) -> dict[str, Any]:
        source = self._source(source_id)
        self._validate_columns(db, source)

        ts_col = quote_identifier(source.timestamp_column)
        select_series = ", ".join(
            f"AVG({quote_identifier(s.column)})" for s in source.series
        )
        bucket_expr = _bucket_expression(ts_col, bucket)
        sql = (
            f"SELECT {bucket_expr} AS bucket, {select_series}, COUNT(*) "
            f"FROM {quote_identifier(source.table)} "
            f"WHERE {ts_col} IS NOT NULL "
            f"GROUP BY bucket ORDER BY bucket DESC LIMIT ?"
        )
        result = db.execute(sql, (limit,), max_rows=limit)
        rows = list(reversed(result.rows))

        points: list[dict[str, Any]] = []
        for row in rows:
            label = self._format_label(row[0], source.timestamp_format)
            point: dict[str, Any] = {"bucket": row[0], "label": label, "samples": row[-1]}
            for index, series in enumerate(source.series):
                point[series.key] = _round_metric(row[index + 1])
            points.append(point)

        stats = {
            series.key: _describe_series([p.get(series.key) for p in points if p.get(series.key) is not None])
            for series in source.series
        }
        return {
            "source": source.id,
            "table": source.table,
            "series": [s.model_dump() for s in source.series],
            "points": points,
            "stats": stats,
        }

    @staticmethod
    def _format_label(bucket: str | None, timestamp_format: str) -> str:
        if bucket is None:
            return "—"
        parsed = parse_datetime(bucket)
        if parsed is None:
            return str(bucket)
        if "T" not in str(bucket) and len(str(bucket)) <= 10:
            return parsed.strftime("%d/%m")
        return parsed.strftime("%d/%m %H:%M")


def _bucket_expression(ts_col: str, bucket: str) -> str:
    """Agrupa timestamps ISO/epoch em dia ou hora, sem depender do formato."""
    if bucket == "raw":
        return ts_col
    unit = "hour" if bucket == "hour" else "day"
    fmt = "'%Y-%m-%d %H:00'" if unit == "hour" else "'%Y-%m-%d'"
    return (
        f"CASE WHEN typeof({ts_col}) IN ('integer','real') "
        f"THEN strftime({fmt}, {ts_col}, 'unixepoch', 'localtime') "
        f"ELSE strftime({fmt}, {ts_col}) END"
    )


def _round_metric(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _describe_series(values: list[float]) -> dict[str, float]:
    if not values:
        return {}
    ordered = sorted(values)
    count = len(ordered)
    return {
        "min": ordered[0],
        "max": ordered[-1],
        "avg": round(sum(ordered) / count, 2),
        "p95": ordered[min(count - 1, int(count * 0.95))],
        "latest": values[-1],
    }
