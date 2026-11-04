"""CLI do MetricsHub (Flask CLI).

    flask --app metricshub databases list
    flask --app metricshub databases check
    flask --app metricshub health
"""

from __future__ import annotations

import json

import click
from flask import Flask, current_app
from flask.cli import AppGroup

from .db import DatabaseRegistry

databases_cli = AppGroup("databases", help="Inspeciona os bancos registrados.")


def _registry() -> DatabaseRegistry:
    return current_app.extensions["metricshub.registry"]


@databases_cli.command("list")
def list_databases() -> None:
    """Lista os bancos configurados (id, nome, caminho, disponibilidade)."""
    click.echo(json.dumps(_registry().status(), indent=2, ensure_ascii=False))


@databases_cli.command("check")
def check_databases() -> None:
    """Valida cada banco: existência do arquivo e leitura do schema."""
    registry = _registry()
    failed = False
    for status in registry.status():
        if not status["exists"]:
            failed = True
            click.secho(f"✗ {status['id']}: arquivo ausente ({status['path']})", fg="red")
            continue
        try:
            with registry.open(status["id"]) as db:
                total = db.scalar("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
            click.secho(f"✓ {status['id']}: {total} tabelas", fg="green")
        except Exception as exc:  # pragma: no cover - caminho de erro operacional
            failed = True
            click.secho(f"✗ {status['id']}: {exc}", fg="red")
    if failed:
        raise SystemExit(1)


@click.command("health")
def health_command() -> None:
    """Mostra um resumo do servidor (modo de auth, features, bancos)."""
    settings = current_app.extensions["metricshub.settings"]
    status = _registry().status()
    click.echo(f"auth_mode      : {settings.security.auth_mode}")
    click.echo(f"bancos         : {sum(s['exists'] for s in status)}/{len(status)} disponíveis")
    click.echo(f"editor SQL     : {'habilitado' if current_app.config.get('RAW_SQL_ENABLED') else 'desabilitado'}")
    click.echo(f"exportações    : {'habilitadas' if settings.security.allow_downloads else 'desabilitadas'}")
    click.echo(f"fontes métricas: {len(settings.metrics.sources)}")


def init_app(app: Flask) -> None:
    app.cli.add_command(databases_cli)
    app.cli.add_command(health_command)
