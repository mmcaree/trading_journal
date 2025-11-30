import pytest
from fastapi.testclient import TestClient
from app.models.position_models import User
from sqlalchemy import select


def test_register_user_success(client: TestClient, test_db):
    response = client.post("/api/auth/register", json={
        "username": "testuser",
        "email": "test@example.com",
        "password": "testpassword123"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert data["email"] == "test@example.com"

    result = test_db.execute(select(User).where(User.username == "testuser"))
    user = result.scalar_one()
    assert user.username == "testuser"


def test_register_duplicate_username(client: TestClient):
    client.post("/api/auth/register", json={
        "username": "duplicate",
        "email": "d1@example.com",
        "password": "pass"
    })
    response = client.post("/api/auth/register", json={
        "username": "duplicate",
        "email": "d2@example.com",
        "password": "pass"
    })
    assert response.status_code == 400
    assert response.json()["detail"] == "Username already registered"


def test_register_duplicate_email(client: TestClient):
    client.post("/api/auth/register", json={
        "username": "user1", "email": "dup@example.com", "password": "pass"
    })
    response = client.post("/api/auth/register", json={
        "username": "user2", "email": "dup@example.com", "password": "pass"
    })
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


def test_login_success(client: TestClient):
    client.post("/api/auth/register", json={
        "username": "loginuser",
        "email": "login@test.com",
        "password": "loginpass123"
    })
    response = client.post("/api/auth/login", data={
        "username": "loginuser",
        "password": "loginpass123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client: TestClient):
    client.post("/api/auth/register", json={
        "username": "wrongpass",
        "email": "wp@test.com",
        "password": "correct"
    })
    response = client.post("/api/auth/login", data={
        "username": "wrongpass",
        "password": "wrong"
    })
    assert response.status_code == 401


def test_protected_route_without_token(client: TestClient):
    response = client.get("/api/v2/positions/")
    assert response.status_code == 401


def test_forgot_password_email_not_leaked(client: TestClient):
    response = client.post("/api/auth/forgot-password", json={"email": "nope@none.com"})
    assert response.status_code == 200
    assert "If the email address exists" in response.json()["message"]