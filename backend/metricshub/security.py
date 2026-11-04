"""Autenticação, rate limiting, headers e CORS."""

from __future__ import annotations

import hmac
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Any

from flask import Flask, Response, g, request

from .errors import Forbidden
from .settings import AppSettings

_LOCAL_ADDRESSES = {"127.0.0.1", "::1", "localhost"}
_PUBLIC_PREFIXES = ("/api/health",)


def _is_private_ip(address: str | None) -> bool:
    """RFC1918 + link-local + loopback (usado pelo modo 'local')."""
    if not address:
        return False
    try:
        import ipaddress

        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_private or ip.is_link_local


class RateLimiter:
    """Janela deslizante em memória (por IP)."""

    def __init__(self, per_minute: int, burst: int) -> None:
        self._per_minute = per_minute
        self._burst = burst
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, int]:
        now = time.monotonic()
        window = 60.0
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > window:
                hits.popleft()
            limit = self._per_minute + self._burst
            if len(hits) >= limit:
                retry_after = int(window - (now - hits[0])) + 1
                return False, retry_after
            hits.append(now)
        return True, 0


def client_key() -> str:
    return request.remote_addr or "unknown"


def is_loopback_request() -> bool:
    return request.remote_addr in _LOCAL_ADDRESSES


def setup_security(app: Flask, settings: AppSettings) -> None:
    limiter = RateLimiter(
        settings.security.rate_limit.requests_per_minute,
        settings.security.rate_limit.burst,
    ) if settings.security.rate_limit.enabled else None

    @app.before_request
    def guard() -> Response | None:
        g.request_id = request.headers.get("X-Request-ID", "")[:64] or _new_request_id()

        if request.path in {"/api/health"}:
            return None

        if limiter is not None:
            allowed, retry_after = limiter.check(client_key())
            if not allowed:
                response = _json_error(
                    "rate_limited",
                    "Muitas requisições. Tente novamente em instantes.",
                    429,
                )
                response.headers["Retry-After"] = str(retry_after)
                return response

        mode = settings.security.auth_mode
        if mode == "none":
            return None
        if mode == "loopback" and not is_loopback_request():
            return _json_error(
                "forbidden",
                "Acesso permitido apenas a partir do próprio host. "
                "Use security.auth_mode='token' para acesso remoto.",
                403,
            )
        if mode == "local" and not _is_private_ip(request.remote_addr):
            return _json_error(
                "forbidden",
                "Acesso permitido apenas a partir do host ou de rede privada. "
                "Use security.auth_mode='token' para acesso remoto.",
                403,
            )
        if mode == "token":
            provided = request.headers.get("X-API-Token") or ""
            header = request.headers.get("Authorization", "")
            if header.lower().startswith("bearer "):
                provided = header[7:].strip()
            # Lido a cada requisição: permite rotação de token sem reiniciar o processo.
            expected = settings.security.api_token
            if not expected or not provided or not hmac.compare_digest(provided, expected):
                return _json_error("unauthorized", "Token de API ausente ou inválido.", 401)
        return None

    @app.after_request
    def security_headers(response: Response) -> Response:
        if not request.path.startswith("/api/"):
            # Headers adequados para o SPA (sem inline scripts, fontes externas permitidas)
            embed = settings.security.allow_embedding
            frame_ancestors = "'self' https://*.e2b.app" if embed else "'none'"
            csp = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' data: https://fonts.gstatic.com; "
                "img-src 'self' data:; "
                "connect-src 'self'; "
                f"frame-ancestors {frame_ancestors}; "
                "base-uri 'self'; form-action 'self'"
            )
            response.headers.setdefault("Content-Security-Policy", csp)
            response.headers.setdefault("X-Content-Type-Options", "nosniff")
            if not embed:
                response.headers.setdefault("X-Frame-Options", "DENY")
            response.headers.setdefault("Referrer-Policy", "no-referrer")
            response.headers.setdefault(
                "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
            )
        response.headers.setdefault("X-Request-ID", getattr(g, "request_id", ""))
        return response

    if settings.security.cors_origins:
        try:
            from flask_cors import CORS

            CORS(
                app,
                resources={r"/api/*": {"origins": settings.security.cors_origins}},
                methods=["GET", "POST"],
                allow_headers=["Content-Type", "Authorization", "X-API-Token", "X-Request-ID"],
                max_age=600,
            )
        except ImportError:  # pragma: no cover
            app.logger.warning("flask-cors não instalado; CORS desabilitado.")
    else:
        app.logger.info(
            "CORS desabilitado. Em desenvolvimento, use o proxy do Vite (/api -> :7050)."
        )


def _json_error(code: str, message: str, status: int) -> Response:
    from flask import jsonify

    response = jsonify({"error": {"code": code, "message": message}})
    response.status_code = status
    return response


def _new_request_id() -> str:
    import uuid

    return uuid.uuid4().hex[:16]


def basic_auth_guard(settings: AppSettings) -> Callable[[], Any]:  # pragma: no cover
    """Hook auxiliar para deploy atrás de proxy que define X-Forwarded-For."""

    def check() -> Any:
        if not is_loopback_request():
            raise Forbidden("Acesso restrito.")
        return None

    return check
