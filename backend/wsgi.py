"""Railway/Heroku entrypoint: expõe `application` para gunicorn."""

from __future__ import annotations

from metricshub import create_app

application = create_app()
app = application

if __name__ == "__main__":  # pragma: no cover
    from metricshub import main

    main()
