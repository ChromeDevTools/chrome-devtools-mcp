import pytest


@pytest.mark.asyncio
async def test_job_lifecycle(client):
    register_payload = {"email": "ops@zacino.io", "password": "SecurePass123"}
    register_resp = await client.post("/api/v1/auth/register", json=register_payload)
    token = register_resp.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    job_payload = {"name": "Optimize supply chain", "description": "Reduce latency."}
    create_resp = await client.post("/api/v1/jobs", json=job_payload, headers=headers)
    assert create_resp.status_code == 201
    job_id = create_resp.json()["id"]

    list_resp = await client.get("/api/v1/jobs", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    update_payload = {"status": "running", "score": 72.5}
    update_resp = await client.patch(f"/api/v1/jobs/{job_id}", json=update_payload, headers=headers)
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "running"

    delete_resp = await client.delete(f"/api/v1/jobs/{job_id}", headers=headers)
    assert delete_resp.status_code == 204
