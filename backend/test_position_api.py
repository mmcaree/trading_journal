#!/usr/bin/env python3
"""
Test script to verify position API functionality
"""

import requests
import json

BASE_URL = "http://localhost:5173"

def test_debug_endpoint():
    """Test if the backend is responding"""
    try:
        response = requests.get(f"{BASE_URL}/api/debug")
        print(f"Debug endpoint status: {response.status_code}")
        if response.status_code == 200:
            print("Backend is running!")
            return True
    except Exception as e:
        print(f"Error connecting to backend: {e}")
        return False

def test_login():
    """Test login to get a token"""
    try:
        # OAuth2PasswordRequestForm expects form data, not JSON
        login_data = {
            "username": "demo",
            "password": "demo123"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", data=login_data)
        print(f"Login status: {response.status_code}")
        if response.status_code == 200:
            token = response.json().get("access_token")
            print("Login successful, got token")
            return token
        else:
            print(f"Login failed: {response.text}")
            return None
    except Exception as e:
        print(f"Error during login: {e}")
        return None

def test_positions_list(token):
    """Test the positions list endpoint"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/v2/positions", headers=headers)
        print(f"Positions list status: {response.status_code}")
        if response.status_code == 200:
            positions = response.json()
            print(f"Found {len(positions)} positions")
            return positions
        else:
            print(f"Positions list failed: {response.text}")
            return []
    except Exception as e:
        print(f"Error getting positions: {e}")
        return []

if __name__ == "__main__":
    print("Testing Position API...")
    
    # Test 1: Backend connectivity
    if not test_debug_endpoint():
        print("❌ Backend is not responding")
        exit(1)
    
    # Test 2: Authentication
    token = test_login()
    if not token:
        print("❌ Authentication failed")
        exit(1)
    
    # Test 3: Positions endpoint
    positions = test_positions_list(token)
    if positions is not None:
        print("✅ Positions API is working")
    else:
        print("❌ Positions API failed")