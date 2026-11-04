"""Exportação CSV/JSON com streaming e limite de linhas."""

from __future__ import annotations

import csv
import io
import json
from collections.abc import Iterator
from typing import Any

from flask import Response, stream_with_context

from . import schema
from .db import Database, quote_identifier, serialize_value
from .errors import PayloadTooLarge
from .settings import AppSettings


class ExportService:
    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings

    def export(
        self, db: Database, table: str, fmt: str = "csv"
    ) -> Response:
        if not self._settings.security.allow_downloads:
            raise PayloadTooLarge("Exportações estão desabilitadas nesta instalação.")

        table = schema.resolve_table_name(db, table)
        columns = [c["name"] for c in schema.list_columns(db, table)]
        limit = self._settings.security.max_export_rows
        total = int(db.scalar(f"SELECT COUNT(*) FROM {quote_identifier(table)}") or 0)
        if total > limit:
            raise PayloadTooLarge(
                f"A tabela tem {total:,} linhas e excede o limite de exportação "
                f"de {limit:,}. Ajuste security.max_export_rows se necessário."
            )

        select_cols = ", ".join(quote_identifier(c) for c in columns)
        sql = f"SELECT {select_cols} FROM {quote_identifier(table)}"
        filename = f"{table}.{fmt}"

        # A conexão precisa sobreviver ao streaming da resposta: quem abre pela
        # rota NÃO deve fechá-la antes do gerador terminar. O fechamento ocorre
        # no finally de cada gerador.
        def generate_json() -> Iterator[str]:
            try:
                yield (
                    '{"table":' + json.dumps(table) + ',"columns":' + json.dumps(columns)
                    + ',"rows":['
                )
                first = True
                for row in db.iterate(sql):
                    payload = {c: serialize_value(v) for c, v in zip(columns, row)}
                    yield ("" if first else ",") + json.dumps(payload, ensure_ascii=False)
                    first = False
                yield "]}"
            finally:
                db.close()

        if fmt == "json":
            return Response(
                stream_with_context(generate_json()),
                mimetype="application/json",
                headers=_download_headers(filename),
            )

        if fmt != "csv":
            from .errors import BadRequest

            raise BadRequest("Formato de exportação suportado: csv ou json.")

        def generate_csv() -> Iterator[str]:
            buffer = io.StringIO()
            writer = csv.writer(buffer, lineterminator="\n")
            try:
                writer.writerow(columns)
                yield buffer.getvalue()
                buffer.seek(0)
                buffer.truncate(0)
                for row in db.iterate(sql):
                    writer.writerow([_csv_cell(v) for v in row])
                    yield buffer.getvalue()
                    buffer.seek(0)
                    buffer.truncate(0)
            finally:
                db.close()

        return Response(
            stream_with_context(generate_csv()),
            mimetype="text/csv",
            headers=_download_headers(filename),
        )


def _csv_cell(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.hex()
    return value


def _download_headers(filename: str) -> dict[str, str]:
    safe = filename.replace('"', "")[:120]
    return {
        "Content-Disposition": f'attachment; filename="{safe}"',
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
    }
