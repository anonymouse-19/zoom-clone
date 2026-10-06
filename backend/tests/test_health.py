"""
Behaviors proven in this file:
1. The health endpoint answers 200 with {"status": "ok"}.
2. A browser preflight from the configured frontend origin is approved (CORS works).
3. A preflight from an unknown origin gets no CORS approval header, so the browser blocks it.
4. CORS does not protect the server: a plain GET from an unknown origin is still answered.
   Only the missing header tells the *browser* to hide the response from the page.
"""

from fastapi.testclient import TestClient

ALLOWED_FRONTEND_ORIGIN = "http://localhost:3000"
UNKNOWN_ORIGIN = "https://evil.example.com"


def test_health_check_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_preflight_from_frontend_origin_is_allowed(client: TestClient) -> None:
    # A preflight is the OPTIONS request a browser sends before a "non-simple" request
    # to ask "may this origin call this method?".
    response = client.options(
        "/api/health",
        headers={
            "Origin": ALLOWED_FRONTEND_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_FRONTEND_ORIGIN


def test_preflight_from_unknown_origin_is_not_approved(client: TestClient) -> None:
    response = client.options(
        "/api/health",
        headers={
            "Origin": UNKNOWN_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )

    # Starlette answers 400 and omits the allow-origin header; the browser then refuses
    # to let the page's JavaScript see any response from this API.
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_cors_does_not_stop_the_server_from_answering_unknown_origins(client: TestClient) -> None:
    response = client.get("/api/health", headers={"Origin": UNKNOWN_ORIGIN})

    # The server still runs the handler and returns data. That's why CORS is not a
    # security boundary for the server: curl, Postman, or another backend can call it.
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
