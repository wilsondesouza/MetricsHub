"""Endpoints de métricas configuradas (gauges + histórico)."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..errors import BadRequest
from .dependencies import metrics_service, open_database, settings

bp = Blueprint("metrics", __name__, url_prefix="/api/metrics")


@bp.get("")
def list_metric_sources():
    return jsonify({"sources": metrics_service().describe()})


@bp.get("/<source_id>/current")
def current_metrics(source_id: str):
    source = settings().metric_source(source_id)
    if source is None:
        from ..errors import NotFound

        raise NotFound(f"Fonte de métricas '{source_id}' não configurada.")
    with open_database(source.database) as (db, _cfg):
        return jsonify(metrics_service().current(db, source_id))


@bp.get("/<source_id>/history")
def metrics_history(source_id: str):
    source = settings().metric_source(source_id)
    if source is None:
        from ..errors import NotFound

        raise NotFound(f"Fonte de métricas '{source_id}' não configurada.")
    raw_limit = request.args.get("limit", "120")
    try:
        limit = max(1, min(int(raw_limit), 1000))
    except ValueError as exc:
        raise BadRequest("'limit' deve ser inteiro.") from exc
    bucket = request.args.get("bucket", "auto").lower()
    if bucket not in {"auto", "day", "hour", "raw"}:
        raise BadRequest("'bucket' aceita: auto, day, hour, raw.")
    with open_database(source.database) as (db, _cfg):
        return jsonify(metrics_service().history(db, source_id, limit=limit, bucket=bucket))
