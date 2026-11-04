"""Editor SQL somente-leitura (recurso opt-in, desabilitado por padrão)."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from ..errors import BadRequest, Forbidden
from ..sql_guard import validate_readonly_sql
from .dependencies import open_database, settings

bp = Blueprint("sql", __name__, url_prefix="/api/sql")
_MAX_ROWS = 500


@bp.post("/<db_id>/query")
def run_query(db_id: str):
    if not current_app.config.get("RAW_SQL_ENABLED", False):
        raise Forbidden(
            "Editor SQL desabilitado. Habilite com server.allow_raw_sql=true "
            "apenas em ambientes confiáveis."
        )
    if settings().security.auth_mode == "none":
        raise Forbidden("Editor SQL exige auth_mode 'loopback' ou 'token'.")

    payload = request.get_json(silent=True) or {}
    sql = payload.get("sql", "")
    try:
        limit = int(payload.get("limit", 200))
    except (TypeError, ValueError) as exc:
        raise BadRequest("'limit' deve ser inteiro.") from exc
    limit = max(1, min(limit, _MAX_ROWS))

    statement = validate_readonly_sql(sql)
    with open_database(db_id) as (db, _cfg):
        result = db.execute(statement, max_rows=limit)

    return jsonify(
        {
            "columns": result.columns,
            "rows": result.rows,
            "row_count": len(result.rows),
            "truncated": result.truncated,
            "duration_ms": result.duration_ms,
        }
    )
