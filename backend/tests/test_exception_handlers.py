import pytest
from fastapi import Request
from fastapi.responses import JSONResponse

from app.utils.exceptions import (
    AppException,
    UnauthorizedException,
    NotFoundException,
    ValidationException,
    InternalServerException
)


class TestExceptionHandlers:
    
    def test_unauthorized_endpoint(self, client):
        response = client.get("/api/users/me")
        
        assert response.status_code == 401
        data = response.json()
        assert "error" in data
        assert "detail" in data
        assert "status_code" in data
        assert data["error"] == "unauthorized"
        assert data["status_code"] == 401
    
    def test_unauthorized_has_www_authenticate_header(self, client):
        response = client.get("/api/users/me")
        
        assert response.status_code == 401
        assert "www-authenticate" in [h.lower() for h in response.headers.keys()]
    
    def test_not_found_endpoint(self, client, auth_headers):
        response = client.get("/api/v2/positions/999999", headers=auth_headers)
        
        assert response.status_code == 404
        data = response.json()
        assert data["error"] == "not_found"
        assert data["status_code"] == 404
        assert "Position not found" in data["detail"]
    
    def test_validation_error_format(self, client, auth_headers):
        invalid_position = {
            "ticker": "",
            "initial_event": {
                "event_type": "buy",
                "shares": -1,
                "price": 100
            }
        }
        
        response = client.post(
            "/api/v2/positions/",
            json=invalid_position,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert "error" in data
        assert "detail" in data
        assert "status_code" in data
    
    def test_forbidden_error_format(self, client, auth_headers):
        response = client.get("/api/admin/students", headers=auth_headers)
        
        assert response.status_code == 403
        data = response.json()
        assert data["error"] == "forbidden"
        assert data["status_code"] == 403
    
    def test_error_response_includes_extra(self, client):
        pass
    
    def test_generic_exception_handler(self, client):
        pass


class TestAuthenticationFlow:
    
    def test_login_with_invalid_credentials(self, client, test_user):
        response = client.post(
            "/api/auth/login",
            data={
                "username": test_user.username,
                "password": "WrongPassword123!"
            }
        )
        
        assert response.status_code == 401
        data = response.json()
        assert data["error"] == "invalid_credentials"
        assert "password" in data["detail"].lower()
    
    def test_login_with_nonexistent_user(self, client):
        response = client.post(
            "/api/auth/login",
            data={
                "username": "nonexistent",
                "password": "Password123!"
            }
        )
        
        assert response.status_code == 401
        data = response.json()
        assert data["error"] == "invalid_credentials"
    
    def test_register_duplicate_username(self, client, test_user):
        response = client.post(
            "/api/auth/register",
            json={
                "username": test_user.username,
                "email": "different@example.com",
                "password": "Password123!",
                "first_name": "Test",
                "last_name": "User"
            }
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["error"] == "bad_request"
        assert "username" in data["detail"].lower()
    
    def test_register_duplicate_email(self, client, test_user):
        response = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": test_user.email,
                "password": "Password123!",
                "first_name": "Test",
                "last_name": "User"
            }
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["error"] == "bad_request"
        assert "email" in data["detail"].lower()
    
    def test_expired_token(self, client):
        expired_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlciIsImV4cCI6MTYwMDAwMDAwMH0.invalid"
        
        response = client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {expired_token}"}
        )
        
        assert response.status_code == 401
        data = response.json()
        assert data["error"] == "unauthorized"
    
    def test_malformed_token(self, client):
        response = client.get(
            "/api/users/me",
            headers={"Authorization": "Bearer invalid_token"}
        )
        
        assert response.status_code == 401
        data = response.json()
        assert data["error"] == "unauthorized"


class TestPositionValidation:
    
    def test_create_position_zero_shares(self, client, auth_headers):
        position_data = {
            "ticker": "AAPL",
            "initial_event": {
                "event_type": "buy",
                "shares": 0,
                "price": 100
            }
        }
        
        response = client.post(
            "/api/v2/positions/",
            json=position_data,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["error"] == "validation_error"
        assert "shares" in data["detail"].lower()
    
    def test_create_position_negative_price(self, client, auth_headers):
        position_data = {
            "ticker": "AAPL",
            "initial_event": {
                "event_type": "buy",
                "shares": 100,
                "price": -50
            }
        }
        
        response = client.post(
            "/api/v2/positions/",
            json=position_data,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["error"] == "validation_error"
        assert "price" in data["detail"].lower()
    
    def test_create_position_empty_ticker(self, client, auth_headers):
        position_data = {
            "ticker": "",
            "initial_event": {
                "event_type": "buy",
                "shares": 100,
                "price": 50
            }
        }
        
        response = client.post(
            "/api/v2/positions/",
            json=position_data,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["error"] == "validation_error"
        assert "ticker" in data["detail"].lower()
    
    def test_add_event_to_nonexistent_position(self, client, auth_headers):
        event_data = {
            "event_type": "buy",
            "shares": 100,
            "price": 50
        }
        
        response = client.post(
            "/api/v2/positions/999999/events",
            json=event_data,
            headers=auth_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["error"] == "not_found"
    
    def test_update_another_users_position(self, client, auth_headers, db_session):
        pass


class TestAdminAuthorization:
    
    def test_non_instructor_cannot_access_admin(self, client, auth_headers):
        response = client.get("/api/admin/students", headers=auth_headers)
        
        assert response.status_code == 403
        data = response.json()
        assert data["error"] == "forbidden"
        assert "instructor" in data["detail"].lower()
    
    def test_instructor_can_access_admin(self, client, instructor_headers):
        response = client.get("/api/admin/students", headers=instructor_headers)
        
        assert response.status_code in [200, 204]
