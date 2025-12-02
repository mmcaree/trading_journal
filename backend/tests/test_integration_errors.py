import pytest


class TestUserRouteErrors:
    
    def test_update_profile_with_duplicate_email(self, client, auth_headers, db_session):
        from app.models.schemas import UserCreate
        from app.services.user_service import create_user
        
        other_user = UserCreate(
            username="otheruser",
            email="other@example.com",
            password="Password123!",
            first_name="Other",
            last_name="User"
        )
        create_user(db_session, other_user)
        db_session.commit()
        
        # Try to update to that email
        response = client.put(
            "/api/users/me",
            json={"email": "other@example.com"},
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["error"] == "bad_request"
    
    def test_change_password_wrong_current(self, client, auth_headers):
        response = client.put(
            "/api/users/me/password",
            json={
                "current_password": "WrongPassword",
                "new_password": "NewPassword123!"
            },
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["error"] == "bad_request"
        assert "incorrect" in data["detail"].lower()
    
    def test_delete_nonexistent_profile_picture(self, client, auth_headers):
        response = client.delete(
            "/api/users/me/profile-picture",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["error"] == "not_found"


class TestPositionRouteErrors:
    
    def test_get_position_summary_not_found(self, client, auth_headers):
        response = client.get(
            "/api/v2/positions/999999",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["error"] == "not_found"
        assert "Position" in data["detail"]
    
    def test_update_position_not_found(self, client, auth_headers):
        response = client.put(
            "/api/v2/positions/999999",
            json={"strategy": "Swing Trading"},
            headers=auth_headers
        )
        
        assert response.status_code == 404
    
    def test_delete_position_not_found(self, client, auth_headers):
        response = client.delete(
            "/api/v2/positions/999999",
            headers=auth_headers
        )
        
        assert response.status_code == 404
    
    def test_add_event_negative_shares(self, client, auth_headers, db_session):
        from app.services.position_service import PositionService
        
        position_service = PositionService(db_session)
        position = position_service.create_position(
            user_id=1,
            ticker="AAPL"
        )
        position_service.add_shares(
            position_id=position.id,
            shares=100,
            price=150.0
        )
        db_session.commit()
        
        response = client.post(
            f"/api/v2/positions/{position.id}/events",
            json={
                "event_type": "buy",
                "shares": -50,
                "price": 155.0
            },
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["error"] == "validation_error"
        assert "shares" in data["detail"].lower()


class TestAnalyticsRouteErrors:
    
    def test_analytics_without_auth(self, client):
        response = client.get("/api/users/me")
        
        assert response.status_code == 401
        data = response.json()
        assert data["error"] == "unauthorized"
    
    def test_legacy_endpoint_gone(self, client, auth_headers):
        response = client.get(
            "/api/v2/positions/999999/nonexistent",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["error"] == "not_found"


class TestFileUploadErrors:
    
    def test_upload_invalid_file_type(self, client, auth_headers):
        files = {
            "file": ("test.txt", b"not an image", "text/plain")
        }
        
        response = client.post(
            "/api/position-images/upload",
            files=files,
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["error"] == "bad_request"
        assert "file type" in data["detail"].lower() or "allowed" in data["detail"].lower()
    
    def test_add_chart_to_nonexistent_position(self, client, auth_headers):
        response = client.get(
            "/api/v2/positions/999999/events",
            headers=auth_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["error"] == "not_found"


class TestErrorConsistency:
    
    def test_all_errors_have_required_fields(self, client, auth_headers):
        test_cases = [
            ("/api/users/me", 401, None),
            ("/api/v2/positions/999999", 404, auth_headers),
            ("/api/admin/students", 403, auth_headers),
        ]
        
        for endpoint, expected_status, headers in test_cases:
            response = client.get(endpoint, headers=headers)
            
            assert response.status_code == expected_status
            data = response.json()
            
            assert "error" in data, f"Missing 'error' field in {endpoint}"
            assert "detail" in data, f"Missing 'detail' field in {endpoint}"
            assert "status_code" in data, f"Missing 'status_code' field in {endpoint}"
            
            assert data["status_code"] == expected_status
            
            assert isinstance(data["error"], str)
            assert isinstance(data["detail"], str)
    
    def test_error_json_structure(self, client):
        response = client.get("/api/users/me")
        
        data = response.json()
        
        required_fields = {"error", "detail", "status_code"}
        optional_fields = {"extra"}
        
        data_fields = set(data.keys())
        
        assert required_fields.issubset(data_fields), \
            f"Missing required fields: {required_fields - data_fields}"
        
        allowed_fields = required_fields | optional_fields
        assert data_fields.issubset(allowed_fields), \
            f"Unexpected fields: {data_fields - allowed_fields}"
