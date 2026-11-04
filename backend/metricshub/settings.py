"""Carregamento e validação de configuração do MetricsHub.

Prioridade: variáveis de ambiente > arquivo TOML > defaults do código.
Nenhum caminho de banco aceito do cliente: apenas IDs declarados aqui.
"""

from __future__ import annotations

import os
import re
import tomllib
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

AuthMode = Literal["none", "loopback", "local", "token"]
TimestampFormat = Literal["auto", "iso8601", "unixepoch", "unixepoch_ms"]

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")

REPO_ROOT = Path(__file__).resolve().parents[2]


# --------------------------------------------------------------------------- #
# Modelos de configuração
# --------------------------------------------------------------------------- #
class ServerSettings(BaseModel):
    host: str = "127.0.0.1"
    port: int = Field(default=7050, ge=1, le=65535)
    debug: bool = False
    workers: int = Field(default=1, ge=1, le=32)


class RateLimitSettings(BaseModel):
    enabled: bool = True
    requests_per_minute: int = Field(default=240, ge=1)
    burst: int = Field(default=60, ge=1)


class SecuritySettings(BaseModel):
    # loopback -> somente 127.0.0.1/::1
    # local    -> loopback + redes privadas (RFC1918/link-local); adequado a LAN e preview
    # token    -> exige token em todas as chamadas
    auth_mode: AuthMode = "local"
    api_token: str = ""
    # Permite embutir a UI em iframe (ex.: preview de sandbox/IDE). Em produção
    # exposta, desligue para habilitar frame-ancestors 'none'.
    allow_embedding: bool = True
    cors_origins: list[str] = Field(default_factory=list)
    rate_limit: RateLimitSettings = Field(default_factory=RateLimitSettings)
    allow_downloads: bool = True
    max_export_rows: int = Field(default=200_000, ge=1)

    @model_validator(mode="after")
    def _token_required(self) -> SecuritySettings:
        if self.auth_mode == "token" and len(self.api_token) < 16:
            raise ValueError(
                "security.auth_mode='token' exige api_token com pelo menos 16 caracteres "
                "(defina METRICHUB_API_TOKEN)."
            )
        return self


class DatabaseSettings(BaseModel):
    read_only: bool = True
    query_timeout_ms: int = Field(default=5_000, ge=100, le=120_000)
    stats_row_limit: int = Field(default=20_000, ge=100)
    count_cache_ttl_seconds: int = Field(default=30, ge=0)
    stats_cache_ttl_seconds: int = Field(default=120, ge=0)


class PaginationSettings(BaseModel):
    default_page_size: int = Field(default=50, ge=1, le=1_000)
    max_page_size: int = Field(default=500, ge=1, le=5_000)

    @model_validator(mode="after")
    def _check_bounds(self) -> PaginationSettings:
        if self.default_page_size > self.max_page_size:
            raise ValueError("default_page_size não pode ser maior que max_page_size")
        return self


class DashboardSettings(BaseModel):
    refresh_interval_ms: int = Field(default=30_000, ge=1_000, le=3_600_000)


class DatabaseConfig(BaseModel):
    """Um banco SQLite exposto pela aplicação."""

    id: str
    name: str
    description: str = ""
    path: Path
    readonly: bool | None = None  # None = herda de DatabaseSettings.read_only

    @field_validator("id")
    @classmethod
    def _valid_id(cls, value: str) -> str:
        if not _ID_RE.match(value):
            raise ValueError(
                "id deve casar com [a-z0-9][a-z0-9_-]{0,63} "
                f"(recebido: {value!r})"
            )
        return value

    @property
    def is_readonly(self) -> bool:
        return True if self.readonly is None else self.readonly


class MetricSeriesConfig(BaseModel):
    key: str
    column: str
    label: str
    unit: str = ""
    max: float | None = None
    warn_at: float | None = None
    crit_at: float | None = None


class MetricSourceConfig(BaseModel):
    id: str
    database: str
    table: str
    timestamp_column: str
    timestamp_format: TimestampFormat = "auto"
    title: str = ""
    series: list[MetricSeriesConfig] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def _valid_id(cls, value: str) -> str:
        if not _ID_RE.match(value):
            raise ValueError(f"id de fonte de métricas inválido: {value!r}")
        return value

    @model_validator(mode="after")
    def _at_least_one_series(self) -> MetricSourceConfig:
        if not self.series:
            raise ValueError(f"fonte de métricas {self.id!r} não define séries")
        return self


class MetricsSettings(BaseModel):
    sources: list[MetricSourceConfig] = Field(default_factory=list)


class AppSettings(BaseModel):
    server: ServerSettings = Field(default_factory=ServerSettings)
    security: SecuritySettings = Field(default_factory=SecuritySettings)
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    pagination: PaginationSettings = Field(default_factory=PaginationSettings)
    dashboard: DashboardSettings = Field(default_factory=DashboardSettings)
    metrics: MetricsSettings = Field(default_factory=MetricsSettings)
    databases: list[DatabaseConfig] = Field(default_factory=list)

    # Contexto (não vem do arquivo)
    root_dir: Path = REPO_ROOT
    frontend_dir: Path | None = None

    @model_validator(mode="after")
    def _check_registry(self) -> AppSettings:
        ids = [db.id for db in self.databases]
        duplicates = {i for i in ids if ids.count(i) > 1}
        if duplicates:
            raise ValueError(f"IDs de banco duplicados: {sorted(duplicates)}")

        known = set(ids)
        for source in self.metrics.sources:
            if source.database not in known:
                raise ValueError(
                    f"fonte de métricas {source.id!r} aponta para banco "
                    f"desconhecido {source.database!r}"
                )
        return self

    def metric_source(self, source_id: str) -> MetricSourceConfig | None:
        return next((s for s in self.metrics.sources if s.id == source_id), None)


# --------------------------------------------------------------------------- #
# Carregamento
# --------------------------------------------------------------------------- #
def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _env_overrides() -> dict[str, Any]:
    """Somente chaves sensíveis/operacionais — evita adivinhação de variáveis."""
    out: dict[str, Any] = {}

    def set_value(path: str, raw: str | None, cast=lambda v: v):
        if raw is None or raw == "":
            return
        node: dict[str, Any] = out
        *parents, leaf = path.split(".")
        for parent in parents:
            node = node.setdefault(parent, {})
        node[leaf] = cast(raw)

    set_value("server.host", os.environ.get("METRICHUB_HOST"))
    set_value("server.port", os.environ.get("METRICHUB_PORT"), int)
    set_value("server.debug", os.environ.get("METRICHUB_DEBUG"), _as_bool)
    set_value("security.auth_mode", os.environ.get("METRICHUB_AUTH_MODE"))
    set_value("security.api_token", os.environ.get("METRICHUB_API_TOKEN"))
    origins = os.environ.get("METRICHUB_CORS_ORIGINS")
    if origins:
        set_value(
            "security.cors_origins",
            [o.strip() for o in origins.split(",") if o.strip()],
        )
    return out


def _as_bool(raw: str) -> bool:
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _resolve_databases(raw: list[dict[str, Any]], root: Path) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    for entry in raw:
        entry = dict(entry)
        path = Path(entry["path"]).expanduser()
        if not path.is_absolute():
            path = (root / path).resolve()
        entry["path"] = path
        resolved.append(entry)
    return resolved


def load_settings(config_path: str | os.PathLike[str] | None = None) -> AppSettings:
    """Carrega config/config.toml (ou METRICHUB_CONFIG) e aplica overrides de env."""
    explicit = config_path or os.environ.get("METRICHUB_CONFIG")
    path = Path(explicit) if explicit else REPO_ROOT / "config" / "config.toml"
    path = path.expanduser().resolve()

    if not path.exists():
        raise FileNotFoundError(f"Arquivo de configuração não encontrado: {path}")

    with path.open("rb") as handle:
        data = tomllib.load(handle)

    root = Path(os.environ.get("METRICHUB_ROOT", path.parent.parent)).resolve()
    data = _deep_merge(data, _env_overrides())
    if "databases" in data:
        data["databases"] = _resolve_databases(data["databases"], root)

    settings = AppSettings.model_validate(data)
    settings.root_dir = root

    frontend_env = os.environ.get("METRICHUB_FRONTEND_DIR")
    if frontend_env:
        candidate = Path(frontend_env).expanduser().resolve()
        settings.frontend_dir = candidate if candidate.exists() else None
    else:
        # webapp/ é o output padrão do Vite; frontend/dist como fallback legado.
        settings.frontend_dir = next(
            (path for path in (root / "webapp", root / "frontend" / "dist") if path.exists()),
            None,
        )
    return settings
