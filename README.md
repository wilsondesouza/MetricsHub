# MetricsHub 2.0

Visualizador de bancos **SQLite** com foco em segurança, performance e leitura de
dados: catálogo de bancos, explorador de tabelas com filtros, perfil de colunas,
séries temporais configuráveis e painel de métricas com atualização ao vivo.

![Catálogo](https://i.ibb.co/ZzwDRb1L/catalogo.png)
![Explorador de dados](https://i.ibb.co/WWYZ3VwQ/registros.png)

---

## Sumário

- [Destaques](#destaques)
- [Início rápido](#início-rápido)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Configuração](#configuração)
- [API](#api)
- [Segurança](#segurança)
- [Testes e qualidade](#testes-e-qualidade)
- [Deploy](#deploy)
- [Documentação](#documentação)

---

## Destaques

| Área | O que mudou |
|---|---|
| **Segurança** | SQLite sempre em `mode=ro` + `query_only` + autorizador; identificadores validados e citados; auth por modo (`local`/`token`); rate limit; timeout por consulta; CSP e headers; erros sem stack trace |
| **Arquitetura** | application factory, 4 blueprints, serviços isolados, configuração tipada (`pydantic`), 48 testes |
| **Performance** | cache TTL para contagens/perfis, limites de página/exportação, ~1 ms por página de 50 linhas |
| **Frontend** | React 18 + TypeScript + Vite + Tailwind + React Query + Recharts; temas claro/escuro; atalhos ⌘K; deep-links |
| **UX** | estado de carregamento/vazio/erro por seção, toasts, tabela com ordenação e filtros, perfil de colunas, gauges acessíveis, exportação CSV/JSON |
| **Operação** | Docker multi-stage não-root, gunicorn, healthcheck, compose hardened, CI no GitHub Actions |

---

## Início rápido

Requisitos: Python ≥ 3.11 e Node ≥ 20.

```bash
# 1. dependências
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements-dev.txt
cd frontend && npm install && cd ..

# 2. bancos de demonstração (inventory, telemetry, analytics)
python scripts/generate_sample_data.py

# 3. desenvolvimento (duas abas)
python -m flask --app backend.metricshub:create_app run --host 127.0.0.1 --port 7050  # API em http://127.0.0.1:7050

cd frontend && npm run dev    # UI em http://127.0.0.1:5173 (proxy /api -> 7050)
```

Para servir tudo em um único endereço (produção/local):

```bash
cd frontend && npm run build      # gera webapp/
python -m flask --app backend.metricshub:create_app run --host 127.0.0.1 --port 7050     # Flask serve o SPA em http://127.0.0.1:7050
```

### Docker

```bash
docker compose up --build
# http://localhost:7050
```

---

## Estrutura do projeto

```
backend/metricshub/     API Flask (blueprints + serviços + segurança)
backend/tests/          pytest (48 casos)
frontend/src/           SPA React/TS (lib, hooks, components, pages)
config/config.toml      única fonte de configuração (bancos, métricas, limites)
scripts/                geração dos bancos de exemplo
docs/                   análise do original, arquitetura, backlog
```

Detalhes em [`docs/02-arquitetura.md`](docs/02-arquitetura.md).

---

## Configuração

Tudo em `config/config.toml`. Bancos são registrados por **id**; o cliente nunca
informa caminhos:

```toml
[[databases]]
id = "inventory"
name = "InventoryExample"
description = "Catálogo e estoque"
path = "sample_data/inventory_example.db"
```

Métricas são declarativas — qualquer tabela de série temporal pode virar um
painel, sem mexer no código:

```toml
[[metrics.sources]]
id = "host"
database = "telemetry"
table = "sistema_info_media"
timestamp_column = "timestamp"
title = "Host de telemetria"

[[metrics.sources.series]]
key = "cpu"
column = "cpu_media"
label = "CPU"
unit = "%"
max = 100
warn_at = 70
crit_at = 90
```

Variáveis de ambiente úteis: `METRICHUB_AUTH_MODE`, `METRICHUB_API_TOKEN`,
`METRICHUB_PORT`, `METRICHUB_ALLOW_RAW_SQL`, `METRICHUB_CORS_ORIGINS`.
Veja [`.env.example`](.env.example).

Inspecione o catálogo pela CLI:

```bash
cd backend && flask --app metricshub databases check
```

---

## API

Principais rotas (todas sob `/api`):

| Rota | Descrição |
|---|---|
| `GET /health` | status e features do servidor |
| `GET /databases` | bancos registrados |
| `GET /databases/:db/overview` | contagens, tamanho, KPIs |
| `GET /databases/:db/tables` | tabelas e views |
| `GET /databases/:db/tables/:table` | schema, índices, FKs |
| `GET /databases/:db/tables/:table/rows` | dados com `page`, `page_size`, `sort`, `order`, `search`, `filter` |
| `GET /databases/:db/tables/:table/profile` | estatísticas por coluna |
| `GET /databases/:db/tables/:table/timeline` | série temporal agregada |
| `GET /databases/:db/tables/:table/export` | CSV ou JSON |
| `GET /metrics`, `/metrics/:id/current`, `/metrics/:id/history` | fontes, leitura atual e histórico |
| `POST /sql/:db/query` | editor SQL (opt-in) |

Erros seguem o envelope `{"error": {"code", "message", "request_id"}}`.

---

## Segurança

- Conexões abertas em `mode=ro` **e** com autorizador que nega escrita/DDL/ATTACH.
- Identificadores do usuário são resolvidos no schema e sempre citados; valores
  são parametrizados (sem concatenação de SQL).
- `auth_mode`: `local` (padrão, rede privada), `loopback`, `token` ou `none`.
- Exportação e SQL livre têm limites e são desativados/configuráveis.
- CSP sem `unsafe-inline` para scripts; `frame-ancestors` configurável;
  `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy` padrão.
- Container não-root, `cap_drop: ALL`, rootfs somente-leitura.

Política completa, modelo de ameaça e checklist de deploy: [`SECURITY.md`](SECURITY.md).

> **Antes de expor publicamente:** use `auth_mode=token` (ou SSO), TLS no proxy
> reverso, monte bancos como `:ro` e defina `allow_embedding=false`.

---

## Testes e qualidade

```bash
make test    # pytest + typecheck
make lint    # ruff + tsc
```

- **Backend**: 48 testes — injeção por tabela/coluna/ordenação/filtro, wildcards
  de `LIKE`, read-only real (INSERT/DROP/PRAGMA negados), timeout, auth, limites
  de exportação, BLOB/NaN, perfil, timeline, envelope de erro.
- **Frontend**: TypeScript `strict` com `noUncheckedIndexedAccess`, build de
  produção e verificação visual dos fluxos principais.
- **CI**: lint + testes (Python 3.11/3.12) + build do frontend + build da imagem.

---

## Deploy

```bash
# produção direta
cd backend && gunicorn -c gunicorn.conf.py wsgi:application

# docker
docker compose up --build -d
```

Recomendações: TLS no proxy reverso, volume de bancos `:ro`,
`METRICHUB_AUTH_MODE=token`, backup do `config.toml` e do `.env` fora do Git.
Os bancos são lidos no lugar — a aplicação **não** cria nem migra schemas.

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/01-analise-do-codigo-original.md`](docs/01-analise-do-codigo-original.md) | funcionalidades, 10 falhas de segurança, bugs e problemas de UX do código original |
| [`docs/02-arquitetura.md`](docs/02-arquitetura.md) | estrutura, camadas, decisões e contrato da API |
| [`docs/03-melhorias-e-backlog.md`](docs/03-melhorias-e-backlog.md) | o que foi implementado, trade-offs e roadmap priorizado |
| [`SECURITY.md`](SECURITY.md) | política de segurança e checklist de implantação |
