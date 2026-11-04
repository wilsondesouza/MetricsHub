"""Dependências compartilhadas pelos blueprints."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from flask import current_app

from ..cache import TTLCache
from ..db import Database, DatabaseRegistry
from ..export import ExportService
from ..metrics import MetricsService
from ..profile import ProfileService
from ..queries import TableQueryService
from ..settings import AppSettings


@contextmanager
def open_database(db_id: str) -> Iterator[tuple[Database, AppSettings]]:
    """Abre uma conexão somente-leitura e garante o fechamento."""
    registry: DatabaseRegistry = current_app.extensions["metricshub.registry"]
    db = registry.open(db_id)
    try:
        yield db, registry.settings
    finally:
        db.close()


def settings() -> AppSettings:
    return current_app.extensions["metricshub.registry"].settings


def query_service() -> TableQueryService:
    return current_app.extensions["metricshub.query_service"]


def profile_service() -> ProfileService:
    return current_app.extensions["metricshub.profile_service"]


def metrics_service() -> MetricsService:
    return current_app.extensions["metricshub.metrics_service"]


def export_service() -> ExportService:
    return current_app.extensions["metricshub.export_service"]


def cache() -> TTLCache:
    return current_app.extensions["metricshub.cache"]
