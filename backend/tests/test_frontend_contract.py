"""Frontend <-> backend contract: every /api path the React client calls must exist in the API."""
import re
from pathlib import Path

API_JS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "api.js"


def _norm(path: str) -> str:
    """Turn `${type}` (JS) and `{t}` (OpenAPI) path parameters into the same placeholder."""
    path = path.split("?")[0]
    return re.sub(r"\$\{[^}]*\}|\{[^}]*\}", "{}", path)


def test_every_frontend_endpoint_exists_in_openapi(client):
    calls = {_norm(p) for p in re.findall(r"""[`'"](/api/[^`'"]*)[`'"]""", API_JS.read_text(encoding="utf-8"))}
    served = {_norm(p) for p in client.get("/openapi.json").json()["paths"]}
    assert calls, "no /api calls found in frontend/src/api.js - has the file moved?"
    missing = sorted(calls - served)
    assert not missing, f"frontend calls endpoints the backend does not serve: {missing}"
