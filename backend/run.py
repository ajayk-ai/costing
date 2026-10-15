"""Start the API server using APP_HOST / APP_PORT / APP_RELOAD from .env.

Usage (from the project root):  uv run backend/run.py [--open]
  --open  also opens the app in the default browser
"""
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.config import APP_HOST, APP_PORT, APP_RELOAD  # noqa: E402

if __name__ == "__main__":
    url = f"http://{'localhost' if APP_HOST in ('127.0.0.1', '0.0.0.0') else APP_HOST}:{APP_PORT}"
    if "--open" in sys.argv:
        threading.Timer(2.0, webbrowser.open, [url]).start()
    print(f"Costing app: {url}")
    uvicorn.run("app.main:app", app_dir=str(Path(__file__).resolve().parent),
                host=APP_HOST, port=APP_PORT, reload=APP_RELOAD)
