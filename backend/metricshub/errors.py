"""Exceções de domínio e handlers de erro padronizados.

Toda resposta de erro segue o envelope::

    {"error": {"code": "...", "message": "...", "request_id": "...", "details": ...}}
"""

from __future__ import annotations

import logging
from typing import Any

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

logger = logging.getLogger("metricshub.errors")


class ApiError(Exception):
    """Erro esperado, seguro para expor ao cliente."""

    status_code = 400
    code = "bad_request"

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code
        self.details = details


class BadRequest(ApiError):
    status_code = 400
    code = "bad_request"


class Unauthorized(ApiError):
    status_code = 401
    code = "unauthorized"


class Forbidden(ApiError):
    status_code = 403
    code = "forbidden"


class NotFound(ApiError):
    status_code = 404
    code = "not_found"


class DatabaseNotFound(NotFound):
    code = "database_not_found"


class TableNotFound(NotFound):
    code = "table_not_found"


class ColumnNotFound(NotFound):
    code = "column_not_found"


class RateLimited(ApiError):
    status_code = 429
    code = "rate_limited"


class QueryTimeout(ApiError):
    status_code = 504
    code = "query_timeout"


class QueryFailed(ApiError):
    status_code = 422
    code = "query_failed"


class PayloadTooLarge(ApiError):
    status_code = 413
    code = "payload_too_large"


def _envelope(error: ApiError, request_id: str | None) -> dict[str, Any]:
    body: dict[str, Any] = {
        "code": error.code,
        "message": error.message,
    }
    if error.details is not None:
        body["details"] = error.details
    if request_id:
        body["request_id"] = request_id
    return {"error": body}


def register_error_handlers(app: Flask) -> None:
    from flask import g

    def request_id() -> str | None:
        return getattr(g, "request_id", None)

    @app.errorhandler(ApiError)
    def handle_api_error(error: ApiError):
        if error.status_code >= 500:
            logger.warning("%s: %s", error.code, error.message)
        return jsonify(_envelope(error, request_id())), error.status_code

    @app.errorhandler(HTTPException)
    def handle_http_exception(error: HTTPException):
        wrapped = ApiError(
            error.description or error.name,
            status_code=error.code or 500,
            code=(error.name or "http_error").lower().replace(" ", "_"),
        )
        return jsonify(_envelope(wrapped, request_id())), wrapped.status_code

    @app.errorhandler(Exception)
    def handle_unexpected(error: Exception):  # pragma: no cover - defensivo
        logger.exception("Erro inesperado: %s", error)
        wrapped = ApiError(
            "Erro interno ao processar a requisição.",
            status_code=500,
            code="internal_error",
        )
        return jsonify(_envelope(wrapped, request_id())), 500
