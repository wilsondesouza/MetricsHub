# ============================================================================
# MetricsHub — imagem de produção (multi-stage)
# ============================================================================

# ---------- estágio 1: build do frontend ----------
FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- estágio 2: runtime Python ----------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    METRICHUB_HOST=0.0.0.0 \
    METRICHUB_PORT=7050

# Usuário sem privilégios
RUN groupadd --gid 10001 metricshub \
 && useradd --uid 10001 --gid metricshub --create-home metricshub

WORKDIR /app

COPY backend/requirements.txt backend/gunicorn.conf.py backend/wsgi.py ./
COPY backend/metricshub ./metricshub
RUN pip install --no-cache-dir -r requirements.txt gunicorn==23.0.0

COPY config ./config
COPY --from=frontend-build /webapp ./webapp

# sample_data é opcional: monte seus bancos como volume somente-leitura
RUN mkdir -p /app/sample_data && chown -R metricshub:metricshub /app

USER metricshub
EXPOSE 7050

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:7050/api/health', timeout=2).status == 200 else 1)"

CMD ["gunicorn", "-c", "gunicorn.conf.py", "wsgi:application"]
