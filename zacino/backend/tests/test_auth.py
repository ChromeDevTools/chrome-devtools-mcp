import pytest


@pytest.mark.asyncio
async def test_register_and_login(client):
    register_payload = {"email": "admin@zacino.io", "password": "SecurePass123"}
    register_resp = await client.post("/api/v1/auth/register", json=register_payload)
    assert register_resp.status_code == 201
    token = register_resp.json()["access_token"]
    assert token

    login_resp = await client.post("/api/v1/auth/login", json=register_payload)
    assert login_resp.status_code == 200
    login_token = login_resp.json()["access_token"]
    assert login_token
