"""Endpoints de tabelas: listagem, schema, dados, perfil e exportação."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from .. import schema
from ..errors import BadRequest
from ..queries import Filter
from .dependencies import export_service, open_database, profile_service, query_service

bp = Blueprint("tables", __name__, url_prefix="/api/databases/<db_id>")


@bp.get("/tables")
def list_tables(db_id: str):
    with open_database(db_id) as (db, _cfg):
        return jsonify({"tables": schema.list_tables(db)})


@bp.get("/tables/<table>")
def table_schema(db_id: str, table: str):
    with open_database(db_id) as (db, _cfg):
        return jsonify(schema.describe_table(db, table))


@bp.get("/tables/<table>/rows")
def table_rows(db_id: str, table: str):
    page = _int_arg("page", 1, minimum=1)
    page_size = _int_arg("page_size", None, minimum=1)
    sort = request.args.get("sort")
    order = request.args.get("order", "asc").lower()
    if order not in {"asc", "desc"}:
        raise BadRequest("order deve ser 'asc' ou 'desc'.")
    search = request.args.get("search", "")
    filters = _parse_filters(request.args.getlist("filter"))

    with open_database(db_id) as (db, _cfg):
        payload = query_service().browse(
            db_id,
            db,
            table,
            page=page,
            page_size=page_size,
            sort=sort,
            order=order,
            search=search,
            filters=filters,
        )
    return jsonify(payload)


@bp.get("/tables/<table>/profile")
def table_profile(db_id: str, table: str):
    with open_database(db_id) as (db, _cfg):
        return jsonify(profile_service().profile(db_id, db, table))


@bp.get("/tables/<table>/timeline")
def table_timeline(db_id: str, table: str):
    value_column = request.args.get("value_column")
    if not value_column:
        raise BadRequest("Parâmetro 'value_column' é obrigatório.")
    time_column = request.args.get("time_column")
    agg = request.args.get("agg", "avg").lower()
    limit = _int_arg("limit", 90, minimum=1, maximum=365)
    with open_database(db_id) as (db, _cfg):
        return jsonify(
            profile_service().timeline(
                db,
                table,
                value_column=value_column,
                time_column=time_column,
                agg=agg,
                limit=limit,
            )
        )


@bp.get("/tables/<table>/export")
def table_export(db_id: str, table: str):
    fmt = request.args.get("format", "csv").lower()
    # Cuidado: o serviço de exportação mantém a conexão aberta durante o
    # streaming e a fecha ao final — por isso não usamos `open_database` aqui.
    registry = current_app.extensions["metricshub.registry"]
    db = registry.open(db_id)
    try:
        return export_service().export(db, table, fmt)
    except Exception:
        db.close()
        raise


def _int_arg(name: str, default: int | None, *, minimum: int, maximum: int | None = None) -> int | None:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise BadRequest(f"Parâmetro '{name}' deve ser inteiro.") from exc
    if value < minimum:
        raise BadRequest(f"Parâmetro '{name}' deve ser >= {minimum}.")
    if maximum is not None and value > maximum:
        value = maximum
    return value


def _parse_filters(raw: list[str]) -> list[Filter]:
    """Formato: filter=coluna:operador:valor (valor URL-encoded)."""
    filters: list[Filter] = []
    for item in raw[:10]:
        parts = item.split(":", 2)
        if len(parts) < 2:
            raise BadRequest("Filtro inválido. Use coluna:operador[:valor].")
        column, operator = parts[0], parts[1]
        value = parts[2] if len(parts) > 2 else None
        filters.append(Filter(column=column, operator=operator, value=value))
    return filters
