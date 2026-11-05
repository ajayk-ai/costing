# Where the React frontend comes from (docker-compose.yml passes FRONTEND_SOURCE):
#   build     (default) npm ci && npm run build inside Docker; needs registry.npmjs.org
#   prebuilt  use backend/static as built on the host with "npm run build" (networks that block npm)
ARG FRONTEND_SOURCE=build

# ---- Frontend option 1: build frontend/ -> /src/dist ----
FROM node:22-alpine AS frontend-build

# Extra CA certificates for npm behind an SSL-inspection proxy (no-op when certs/ has no *.crt)
COPY certs/ /certs/
RUN cat /certs/*.crt > /certs/extra-ca.pem 2>/dev/null || true
ENV NODE_EXTRA_CA_CERTS=/certs/extra-ca.pem

WORKDIR /src/frontend
# Dependencies first so this layer is cached until package*.json change
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build -- --outDir /src/dist

# ---- Frontend option 2: the committed / host-built backend/static ----
FROM scratch AS frontend-prebuilt
COPY backend/static /src/dist

# Only the selected option is built
FROM frontend-${FRONTEND_SOURCE} AS frontend

# ---- Python app (FastAPI serves the API and the built frontend) ----
FROM python:3.14-slim

# Extra CA certificates: any *.crt in certs/ (e.g. an office SSL-inspection proxy). Empty on the server.
COPY certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

# uv from PyPI (Docker Hub + PyPI only; ghcr.io is not needed)
RUN pip install --no-cache-dir uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

# Dependencies first so this layer is cached until pyproject.toml / uv.lock change
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend ./backend
# The frontend from the selected option replaces whatever backend/static came with the code
RUN rm -rf ./backend/static
COPY --from=frontend /src/dist ./backend/static

# Paths and server settings; real environment variables override .env, so no .env is needed in the image.
# The frontend uses relative URLs, so BASE_PATH is a runtime setting (no rebuild to change it).
ENV BASE_PATH=/costing \
    APP_HOST=0.0.0.0 \
    APP_PORT=8000 \
    APP_RELOAD=false \
    FRONTEND_DIST=/app/backend/static \
    DB_PATH=/data/costing.db \
    RUNS_DIR=/data/runs

VOLUME /data
EXPOSE 8000

# Default start command (docker-compose.yml sets the same one explicitly)
CMD ["uv", "run", "--no-sync", "backend/run.py"]
