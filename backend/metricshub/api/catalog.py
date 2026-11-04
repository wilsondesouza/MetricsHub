"""Endpoints de health, catálogo e metadados do servidor."""

from __future__ import annotations

import time

from flask import Blueprint, current_app, jsonify

from ..db import DatabaseRegistry
from ..errors import NotFound
from .dependencies import open_database, settings

bp = Blueprint("catalog", __name__, url_prefix="/api")
_STARTED_AT = time.monotonic()


@bp.get("/health")
def health():
    cfg = settings()
    registry: DatabaseRegistry = current_app.extensions["metricshub.registry"]
    databases = registry.status()
    return jsonify(
        {
            "status": "ok",
            "version": current_app.config.get("METRICHUB_VERSION", "2.0.0"),
            "uptime_seconds": round(time.monotonic() - _STARTED_AT, 1),
            "auth_mode": cfg.security.auth_mode,
            "databases": {"total": len(databases), "available": sum(d["exists"] for d in databases)},
            "features": {
                "raw_sql": current_app.config.get("RAW_SQL_ENABLED", False),
                "downloads": cfg.security.allow_downloads,
                "metrics": len(cfg.metrics.sources),
            },
        }
    )


@bp.get("/databases")
def list_databases():
    registry: DatabaseRegistry = current_app.extensions["metricshub.registry"]
    return jsonify({"databases": registry.status()})


@bp.get("/databases/<db_id>")
def database_detail(db_id: str):
    registry: DatabaseRegistry = current_app.extensions["metricshub.registry"]
    db_config = registry.config(db_id)
    with open_database(db_id) as (db, _cfg):
        payload = _safe_overview(db_id, db)
    return jsonify(
        {
            "id": db_config.id,
            "name": db_config.name,
            "description": db_config.description,
            "exists": db_config.path.is_file(),
            "size_bytes": db_config.path.stat().st_size if db_config.path.is_file() else 0,
            "overview": payload,
        }
    )


@bp.get("/databases/<db_id>/overview")
def database_overview(db_id: str):
    registry: DatabaseRegistry = current_app.extensions["metricshub.registry"]
    db_config = registry.config(db_id)
    with open_database(db_id) as (db, _cfg):
        payload = _safe_overview(db_id, db)
    return jsonify(
        {
            **payload,
            "id": db_config.id,
            "name": db_config.name,
            "description": db_config.description,
            "readonly": db_config.is_readonly,
        }
    )


def _safe_overview(db_id: str, db):
    from .dependencies import query_service

    try:
        return query_service().overview(db_id, db)
    except NotFound:
        raise
