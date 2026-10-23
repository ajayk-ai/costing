"""Login: every route needs valid Basic credentials once APP_PASSWORD is set."""
import base64

import pytest

from app import config


def _basic(user: str, password: str) -> dict:
    return {"Authorization": "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()}


@pytest.fixture
def login(monkeypatch):
    monkeypatch.setattr(config, "APP_USER", "11234")
    monkeypatch.setattr(config, "APP_PASSWORD", "secret-pw")


def test_disabled_without_password(client):
    assert client.get("/openapi.json").status_code == 200


def test_missing_credentials_rejected(client, login):
    r = client.get("/openapi.json")
    assert r.status_code == 401
    assert r.headers["www-authenticate"].startswith("Basic")


@pytest.mark.parametrize("user,password", [("11234", "wrong"), ("other", "secret-pw"), ("", "")])
def test_wrong_credentials_rejected(client, login, user, password):
    assert client.get("/openapi.json", headers=_basic(user, password)).status_code == 401


def test_malformed_header_rejected(client, login):
    assert client.get("/openapi.json", headers={"Authorization": "Basic !!!"}).status_code == 401


def test_valid_credentials_accepted(client, login):
    assert client.get("/openapi.json", headers=_basic("11234", "secret-pw")).status_code == 200
