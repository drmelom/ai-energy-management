# AI Energy Management API — FastAPI + SQLite (single container, seeds the CSVs on first start)
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app

# uv (fast, lockfile-based installs)
COPY --from=ghcr.io/astral-sh/uv:0.7.6 /uv /uvx /bin/

# dependencies first (cached layer)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# application + seed data
COPY app ./app
COPY data ./data

ENV PATH="/app/.venv/bin:$PATH" \
    DATABASE_URL="sqlite:////app/state/energy.db" \
    DATA_DIR="/app/data" \
    CORS_ORIGINS="http://localhost:5173"
RUN mkdir -p /app/state
VOLUME ["/app/state"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
