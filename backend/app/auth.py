"""HTTP Basic login for the whole app (API and frontend). Disabled while APP_PASSWORD is empty."""
import base64
import binascii
import secrets

from fastapi import Request
from fastapi.responses import Response

from . import config


def _valid(header: str | None) -> bool:
    if not header or not header.lower().startswith("basic "):
        return False
    try:
        user, _, password = base64.b64decode(header[6:]).decode("utf-8").partition(":")
    except (binascii.Error, UnicodeDecodeError):
        return False
    # Evaluate both comparisons so timing does not reveal which one failed
    user_ok = secrets.compare_digest(user.encode(), config.APP_USER.encode())
    pass_ok = secrets.compare_digest(password.encode(), config.APP_PASSWORD.encode())
    return user_ok and pass_ok


async def basic_auth(request: Request, call_next):
    if config.APP_PASSWORD and not _valid(request.headers.get("authorization")):
        return Response("Authentication required", status_code=401,
                        headers={"WWW-Authenticate": 'Basic realm="Costing"'})
    return await call_next(request)
