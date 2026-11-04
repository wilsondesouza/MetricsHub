"""Registro dos blueprints da API."""

from __future__ import annotations

from flask import Flask

from . import catalog, metrics, sql, tables


def register_api(app: Flask) -> None:
    app.register_blueprint(catalog.bp)
    app.register_blueprint(tables.bp)
    app.register_blueprint(metrics.bp)
    app.register_blueprint(sql.bp)
