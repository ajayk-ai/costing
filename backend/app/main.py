"""Costing master data API (FastAPI): app wiring only.

Run from the project root:  uv run backend/run.py   (settings come from .env)
Layers:  api/ (HTTP) -> services/ (logic) -> db/ (SQLite), with domain/ holding the master definitions.
The built React app in FRONTEND_DIST (backend/static) is served at / as well.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import masters, sap
from .api.frontend import mount_frontend
from .auth import basic_auth
from .config import CORS_ORIGINS

app = FastAPI(title="Costing Master Data")
app.middleware("http")(basic_auth)  # added before CORS so CORS stays outermost and preflights pass
if CORS_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

app.include_router(masters.router)
app.include_router(sap.router)
mount_frontend(app)  # must stay last: its catch-all route would shadow later routes
