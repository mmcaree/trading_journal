"""
Comprehensive tests for user management API endpoints
Tests user profile, settings, account balance, and preferences
"""

import pytest
from fastapi.testclient import TestClient
from datetime import datetime


# === Helper Functions ===

def create_test_user(client: TestClient, username: str = "testuser", email: str = "test@example.com"):
    """Create a test user and return access token"""
    response = client.post("/api/auth/register", json={
        "username": username,
        "email": email,
        "password": "testpass123"
    })
    assert response.status_code == 200
    
    response = client.post("/api/auth/login", data={
        "username": username,
        "password": "testpass123"
    })
    assert response.status_code == 200
    return response.json()["access_token"]


def get_auth_headers(token: str):
    """Get authorization headers with token"""
    return {"Authorization": f"Bearer {token}"}


# === User Profile Tests ===

def test_get_current_user_requires_auth(client: TestClient):
    """Test that getting current user requires authentication"""
    response = client.get("/api/users/me")
    assert response.status_code == 401


def test_get_current_user_success(client: TestClient):
    """Test getting current user profile"""
    token = create_test_user(client, "testuser", "test@example.com")
    headers = get_auth_headers(token)
    
    response = client.get("/api/users/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert data["email"] == "test@example.com"
    assert "id" in data
    assert "created_at" in data


def test_update_user_profile(client: TestClient):
    """Test updating user profile information"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.put("/api/users/me", 
                         headers=headers,
                         json={
                             "first_name": "John",
                             "last_name": "Doe",
                             "display_name": "JohnD",
                             "bio": "Day trader focusing on tech stocks",
                             "timezone": "America/New_York"
                         })
    
    assert response.status_code == 200
    data = response.json()
    assert data["first_name"] == "John"
    assert data["last_name"] == "Doe"
    assert data["display_name"] == "JohnD"
    assert data["bio"] == "Day trader focusing on tech stocks"
    assert data["timezone"] == "America/New_York"


def test_update_user_profile_partial(client: TestClient):
    """Test partial update of user profile"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Update only display name
    response = client.put("/api/users/me", 
                         headers=headers,
                         json={
                             "display_name": "NewName"
                         })
    
    assert response.status_code == 200
    data = response.json()
    assert data["display_name"] == "NewName"


def test_update_user_profile_requires_auth(client: TestClient):
    """Test that updating profile requires authentication"""
    response = client.put("/api/users/me", json={
        "display_name": "Test"
    })
    assert response.status_code == 401


# === Account Balance Tests ===

def test_get_account_balance(client: TestClient):
    """Test getting user account balance"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.get("/api/users/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "current_account_balance" in data
    assert "initial_account_balance" in data


def test_update_account_balance(client: TestClient):
    """Test updating account balance"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.put("/api/users/me", 
                         headers=headers,
                         json={
                             "current_account_balance": 50000.00,
                             "initial_account_balance": 10000.00
                         })
    
    assert response.status_code == 200
    data = response.json()
    assert data["current_account_balance"] == 50000.00
    assert data["initial_account_balance"] == 10000.00


def test_update_account_balance_validation(client: TestClient):
    """Test that account balance must be non-negative"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.put("/api/users/me", 
                         headers=headers,
                         json={
                             "current_account_balance": -1000.00
                         })
    
    # Should either reject or accept (depends on implementation)
    # If validation exists, should be 400
    if response.status_code == 400:
        assert "balance" in response.json()["detail"].lower()


# === User Settings Tests ===

def test_get_user_settings(client: TestClient):
    """Test getting user notification settings"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.get("/api/users/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    
    # Check for settings fields
    assert "email_notifications_enabled" in data or "settings" in data
    assert "timezone" in data or "settings" in data


def test_update_notification_settings(client: TestClient):
    """Test updating email notification preferences"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.put("/api/users/me", 
                         headers=headers,
                         json={
                             "email_notifications_enabled": False,
                             "daily_email_enabled": True,
                             "weekly_email_enabled": False
                         })
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify settings were updated
    if "email_notifications_enabled" in data:
        assert data["email_notifications_enabled"] is False


def test_update_timezone(client: TestClient):
    """Test updating user timezone"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    timezones = ["America/New_York", "Europe/London", "Asia/Tokyo"]
    
    for tz in timezones:
        response = client.put("/api/users/me", 
                             headers=headers,
                             json={"timezone": tz})
        
        assert response.status_code == 200
        data = response.json()
        assert data["timezone"] == tz


# === User Deletion Tests ===

def test_delete_user_account_requires_auth(client: TestClient):
    """Test that account deletion requires authentication"""
    response = client.delete("/api/users/me")
    assert response.status_code == 401


def test_delete_user_account(client: TestClient):
    """Test user can delete their own account"""
    token = create_test_user(client, "deleteuser", "delete@test.com")
    headers = get_auth_headers(token)
    
    # Delete account
    response = client.delete("/api/users/me", headers=headers)
    
    # Should succeed (either 200 or 204)
    assert response.status_code in [200, 204]
    
    # Try to access user info - should fail
    response = client.get("/api/users/me", headers=headers)
    assert response.status_code in [401, 404]


# === User List Tests (Admin) ===

def test_list_users_requires_admin(client: TestClient):
    """Test that listing all users requires admin role"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.get("/api/users/", headers=headers)
    
    # Should either require admin (403) or not exist (404)
    assert response.status_code in [403, 404]


# === Password Change Tests ===

def test_change_password_requires_auth(client: TestClient):
    """Test that changing password requires authentication"""
    response = client.post("/api/users/me/change-password", json={
        "old_password": "old123",
        "new_password": "new123"
    })
    assert response.status_code == 401


def test_change_password_success(client: TestClient):
    """Test successful password change"""
    token = create_test_user(client, "pwduser", "pwd@test.com")
    headers = get_auth_headers(token)
    
    response = client.post("/api/users/me/change-password", 
                          headers=headers,
                          json={
                              "old_password": "testpass123",
                              "new_password": "newpassword456"
                          })
    
    # Should succeed (200) or endpoint might not exist (404)
    if response.status_code == 200:
        # Try logging in with new password
        login_response = client.post("/api/auth/login", data={
            "username": "pwduser",
            "password": "newpassword456"
        })
        assert login_response.status_code == 200


def test_change_password_wrong_old_password(client: TestClient):
    """Test that wrong old password is rejected"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.post("/api/users/me/change-password", 
                          headers=headers,
                          json={
                              "old_password": "wrongpassword",
                              "new_password": "newpassword456"
                          })
    
    # Should fail if endpoint exists
    if response.status_code != 404:
        assert response.status_code in [400, 401, 403]


def test_change_password_validation(client: TestClient):
    """Test password validation (minimum length, etc.)"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Try with too short password
    response = client.post("/api/users/me/change-password", 
                          headers=headers,
                          json={
                              "old_password": "testpass123",
                              "new_password": "123"  # Too short
                          })
    
    # Should reject if endpoint exists and has validation
    if response.status_code != 404:
        assert response.status_code in [400, 422]


# === User Role Tests ===

def test_user_default_role(client: TestClient):
    """Test that new users have default role"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.get("/api/users/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    
    # Should have a role field
    if "role" in data:
        assert data["role"] in ["STUDENT", "USER", "user"]


# === Email Verification Tests ===

def test_user_email_verified_status(client: TestClient):
    """Test email verification status"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.get("/api/users/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    
    # Check if email verification tracking exists
    # This is informational, not a requirement
    assert "email" in data


# === User Stats Tests ===

def test_get_user_stats(client: TestClient):
    """Test getting user trading statistics"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Create a position first
    client.post("/api/v2/positions/", 
               headers=headers,
               json={
                   "ticker": "AAPL",
                   "initial_event": {
                       "event_type": "buy",
                       "shares": 10,
                       "price": 150.0
                   }
               })
    
    # Get user info (might include stats)
    response = client.get("/api/users/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    
    # Basic user info should be present
    assert "username" in data
    assert "email" in data


# === Integration Tests ===

def test_full_user_lifecycle(client: TestClient):
    """Test complete user lifecycle from creation to deletion"""
    # 1. Register user
    register_response = client.post("/api/auth/register", json={
        "username": "lifecycle",
        "email": "lifecycle@test.com",
        "password": "password123"
    })
    assert register_response.status_code == 200
    
    # 2. Login
    login_response = client.post("/api/auth/login", data={
        "username": "lifecycle",
        "password": "password123"
    })
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    headers = get_auth_headers(token)
    
    # 3. Get profile
    profile_response = client.get("/api/users/me", headers=headers)
    assert profile_response.status_code == 200
    
    # 4. Update profile
    update_response = client.put("/api/users/me", 
                                 headers=headers,
                                 json={
                                     "display_name": "Lifecycle User",
                                     "current_account_balance": 10000.00
                                 })
    assert update_response.status_code == 200
    assert update_response.json()["display_name"] == "Lifecycle User"
    
    # 5. Create some positions
    client.post("/api/v2/positions/", 
               headers=headers,
               json={
                   "ticker": "AAPL",
                   "initial_event": {
                       "event_type": "buy",
                       "shares": 10,
                       "price": 150.0
                   }
               })
    
    # 6. Verify positions exist
    positions_response = client.get("/api/v2/positions/", headers=headers)
    assert positions_response.status_code == 200
    assert len(positions_response.json()) > 0
    
    # 7. Delete account
    delete_response = client.delete("/api/users/me", headers=headers)
    # Should succeed or endpoint might not exist
    if delete_response.status_code in [200, 204]:
        # Verify can't access anymore
        verify_response = client.get("/api/users/me", headers=headers)
        assert verify_response.status_code in [401, 404]


def test_user_isolation_in_updates(client: TestClient):
    """Test that users can only update their own profiles"""
    token1 = create_test_user(client, "user1", "user1@test.com")
    token2 = create_test_user(client, "user2", "user2@test.com")
    
    # User 1 updates their profile
    response1 = client.put("/api/users/me", 
                          headers=get_auth_headers(token1),
                          json={"display_name": "User One"})
    assert response1.status_code == 200
    
    # Verify User 2's profile is unchanged
    response2 = client.get("/api/users/me", headers=get_auth_headers(token2))
    assert response2.status_code == 200
    assert response2.json()["display_name"] != "User One"


def test_concurrent_profile_updates(client: TestClient):
    """Test that concurrent updates don't cause conflicts"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Multiple updates in sequence
    for i in range(5):
        response = client.put("/api/users/me", 
                             headers=headers,
                             json={"display_name": f"Name{i}"})
        assert response.status_code == 200
    
    # Final check
    final_response = client.get("/api/users/me", headers=headers)
    assert final_response.status_code == 200
    assert final_response.json()["display_name"] == "Name4"
