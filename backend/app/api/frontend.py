"""Serve the built React app (FRONTEND_DIST) with a fallback to index.html for client-side routes."""
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from ..config import FRONTEND_DIST


def mount_frontend(app: FastAPI) -> None:
    dist = FRONTEND_DIST
    if not (dist / "index.html").exists():
        return
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = dist / path
        return FileResponse(f if path and f.is_file() and dist in f.resolve().parents else dist / "index.html")
