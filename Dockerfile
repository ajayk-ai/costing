FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Dependencies first so this layer is cached until pyproject.toml / uv.lock change
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# backend/static holds the built React app and is part of the image
COPY backend ./backend

# Real environment variables override .env, so no .env file is needed in the image
ENV APP_HOST=0.0.0.0 \
    APP_PORT=8000 \
    APP_RELOAD=false \
    DB_PATH=/data/costing.db \
    RUNS_DIR=/data/runs

VOLUME /data
EXPOSE 8000

CMD ["uv", "run", "--no-sync", "backend/run.py"]
