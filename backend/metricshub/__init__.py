"""Factory da aplicação Flask (application factory pattern).

Uso:
    from metricshub import create_app
    app = create_app()
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from flask import Flask, jsonify, send_from_directory

from .api import register_api
from .cache import TTLCache
from .db import DatabaseRegistry
from .errors import register_error_handlers
from .export import ExportService
from .metrics import MetricsService
from .profile import ProfileService
from .queries import TableQueryService
from .security import setup_security
from .settings import load_settings

__version__ = "2.0.0"

logger = logging.getLogger("metricshub")


def create_app(config_path: str | os.PathLike[str] | None = None) -> Flask:
    settings = load_settings(config_path)

    # static_folder=None: o build do React é servido pelo catch-all do SPA,
    # que também cobre as rotas do client-side router.
    app = Flask(__name__, static_folder=None)
    app.config.update(
        METRICHUB_VERSION=__version__,
        RAW_SQL_ENABLED=_env_flag("METRICHUB_ALLOW_RAW_SQL", False),
        JSON_SORT_KEYS=False,
        MAX_CONTENT_LENGTH=256 * 1024,
    )

    logging.basicConfig(
        level=logging.DEBUG if settings.server.debug else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s :: %(message)s",
    )
    if settings.security.auth_mode == "none":
        logger.warning(
            "auth_mode='none': a API está sem autenticação. NÃO use em rede compartilhada."
        )

    cache = TTLCache()
    registry = DatabaseRegistry(settings)
    app.extensions["metricshub.registry"] = registry
    app.extensions["metricshub.cache"] = cache
    app.extensions["metricshub.query_service"] = TableQueryService(settings, cache)
    app.extensions["metricshub.profile_service"] = ProfileService(settings, cache)
    app.extensions["metricshub.metrics_service"] = MetricsService(settings)
    app.extensions["metricshub.export_service"] = ExportService(settings)
    app.extensions["metricshub.settings"] = settings

    setup_security(app, settings)
    register_error_handlers(app)
    register_api(app)
    _register_spa(app, settings)

    return app


def _register_spa(app: Flask, settings) -> None:
    """Serve o build do React e faz fallback de rotas do SPA."""

    @app.get("/")
    def index():
        if settings.frontend_dir and (settings.frontend_dir / "index.html").exists():
            return send_from_directory(settings.frontend_dir, "index.html")
        return jsonify(
            {
                "app": "MetricsHub API",
                "version": __version__,
                "message": "Frontend não compilado. Rode 'npm install && npm run build' em frontend/.",
                "docs": "/api/health",
            }
        )

    @app.get("/<path:path>")
    def spa_fallback(path: str):
        if path.startswith("api/"):
            return jsonify({"error": {"code": "not_found", "message": "Rota inexistente."}}), 404
        base = settings.frontend_dir
        if base is not None:
            # Resolve e confina ao diretório do build (anti path traversal).
            candidate = (base / path).resolve()
            if candidate.is_file() and candidate.is_relative_to(base.resolve()):
                return send_from_directory(base, path)
            # Arquivos inexistentes (com extensão) não devem devolver o index:
            # isso mascararia 404 de assets e confundiria o cache do navegador.
            if "." in Path(path).name:
                return jsonify({"error": {"code": "not_found", "message": "Arquivo não encontrado."}}), 404
            if (base / "index.html").exists():
                return send_from_directory(base, "index.html")
        return jsonify({"error": {"code": "not_found", "message": "Recurso não encontrado."}}), 404


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def main() -> None:  # pragma: no cover - entrypoint de desenvolvimento
    settings = load_settings()
    app = create_app()
    app.run(
        host=settings.server.host,
        port=settings.server.port,
        debug=settings.server.debug,
    )


if __name__ == "__main__":  # pragma: no cover
    main()
