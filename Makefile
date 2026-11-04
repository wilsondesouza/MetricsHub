# ============================================================================
# MetricsHub — atalhos de desenvolvimento
# ============================================================================
.DEFAULT_GOAL := help
PYTHON ?= python3
VENV   ?= venv

.PHONY: help setup seed dev backend frontend build test lint clean docker docker-run

help: ## Lista os comandos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## Cria venv, instala dependências de backend e frontend
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install --upgrade pip
	$(VENV)/bin/pip install -r backend/requirements-dev.txt
	cd frontend && npm install

seed: ## Gera os bancos SQLite de demonstração em sample_data/
	$(PYTHON) scripts/generate_sample_data.py

backend: ## Sobe a API Flask em http://127.0.0.1:7050
	cd backend && ../$(VENV)/bin/python -m flask --app metricshub:create_app run --host 127.0.0.1 --port 7050

frontend: ## Sobe o Vite em http://127.0.0.1:5173 (proxy /api -> :7050)
	cd frontend && npm run dev

dev: ## Sobe backend e frontend juntos (Ctrl+C encerra ambos)
	@$(MAKE) backend & $(MAKE) frontend; kill %1 2>/dev/null || true

build: ## Compila o frontend para webapp/ (servido pelo Flask)
	cd frontend && npm run build

test: ## Roda testes do backend + typecheck do frontend
	cd backend && ../$(VENV)/bin/python -m pytest -q
	cd frontend && npm run typecheck

lint: ## Ruff (Python) + ESLint/tsc (TypeScript)
	$(VENV)/bin/ruff check backend/metricshub backend/tests
	cd frontend && npm run typecheck

clean: ## Remove artefatos de build e caches
	rm -rf webapp frontend/dist frontend/node_modules/.vite backend/.pytest_cache backend/.ruff_cache
	find . -name '__pycache__' -type d -prune -exec rm -rf {} +

docker: ## Constrói a imagem de produção
	docker build -t metricshub:latest .

docker-run: ## Executa o container em :7050
	docker run --rm -p 7050:7050 -v "$$(pwd)/sample_data:/app/sample_data:ro" metricshub:latest
