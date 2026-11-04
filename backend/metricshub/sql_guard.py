"""Guardas para SQL livre informado pelo usuário (recurso opt-in).

Estratégia em profundidade:
- apenas UMA instrução, obrigatoriamente leitura (SELECT/WITH/EXPLAIN/VALUES);
- sem palavras-chave de escrita/DDL/ATTACH/PRAGMA na instrução;
- execução em conexão `mode=ro` **e** com autorizador SQLite que nega escrita;
- timeout próprio e limite de linhas.
"""

from __future__ import annotations

import re

from .errors import BadRequest

_FORBIDDEN = re.compile(
    r"\b("
    r"attach|detach|pragma|vacuum|reindex|analyze|create|drop|alter|insert|"
    r"update|delete|replace|trigger|begin|commit|rollback|savepoint|release|"
    r"load_extension|writefile|readfile|fts3_tokenizer"
    r")\b",
    re.IGNORECASE,
)
_ALLOWED_START = re.compile(r"^\s*(select|with|explain|values)\b", re.IGNORECASE)
_COMMENT = re.compile(r"(--[^\n]*\n)|(/\*.*?\*/)", re.DOTALL)
_MAX_SQL_LENGTH = 10_000


def validate_readonly_sql(sql: str) -> str:
    """Valida e normaliza uma consulta somente-leitura. Levanta BadRequest."""
    if not sql or not sql.strip():
        raise BadRequest("Consulta vazia.")
    if len(sql) > _MAX_SQL_LENGTH:
        raise BadRequest(f"Consulta excede {_MAX_SQL_LENGTH} caracteres.")

    # Remove comentários para evitar bypass do tipo /*x*/DELETE
    cleaned = _COMMENT.sub(" ", sql).strip().rstrip(";").strip()
    if not cleaned:
        raise BadRequest("Consulta vazia após remoção de comentários.")

    if ";" in cleaned:
        raise BadRequest("Apenas uma instrução por consulta é permitida.")
    if not _ALLOWED_START.match(cleaned):
        raise BadRequest("Apenas consultas de leitura (SELECT/WITH/EXPLAIN) são permitidas.")

    match = _FORBIDDEN.search(cleaned)
    if match:
        raise BadRequest(
            f"Palavra-chave não permitida em consultas: {match.group(0).upper()}."
        )
    return cleaned
