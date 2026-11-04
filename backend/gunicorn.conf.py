"""Configuração de produção (gunicorn).

    gunicorn -c gunicorn.conf.py wsgi:application

Notas:
- SQLite é lido com `mode=ro`; múltiplos workers funcionam bem para leitura.
- O rate limiter e o cache são em memória por processo. Com N workers, o
  limite efetivo é N × requests_per_minute. Se precisar de limite global,
  use Redis (ver backend/metricshub/cache.py).
"""

import multiprocessing
import os

bind = f"{os.environ.get('METRICHUB_HOST', '127.0.0.1')}:{os.environ.get('METRICHUB_PORT', '7050')}"
workers = int(os.environ.get("WEB_CONCURRENCY", min(4, (multiprocessing.cpu_count() or 2))))
threads = int(os.environ.get("GUNICORN_THREADS", "4"))
worker_class = "gthread"
timeout = 60
graceful_timeout = 30
keepalive = 5
max_requests = 2_000          # recicla workers e limita vazamentos de memória
max_requests_jitter = 200
accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info")
forwarded_allow_ips = os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1")
