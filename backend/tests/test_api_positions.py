"""
Comprehensive tests for positions_v2 API endpoints
Tests position lifecycle, events, journal entries, and import functionality
"""

import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.position_models import TradingPosition, TradingPositionEvent, PositionStatus, EventType


# === Helper Functions ===

def create_test_user(client: TestClient, username: str = "testuser", email: str = "test@example.com"):
    """Create a test user and return access token"""
    response = client.post("/api/auth/register", json={
        "username": username,
        "email": email,
        "password": "testpass123"
    })
    assert response.status_code == 200
    
    # Login to get token
    response = client.post("/api/auth/login", data={
        "username": username,
        "password": "testpass123"
    })
    assert response.status_code == 200
    return response.json()["access_token"]


def get_auth_headers(token: str):
    """Get authorization headers with token"""
    return {"Authorization": f"Bearer {token}"}


# === Authentication Tests ===

def test_positions_endpoint_requires_auth(client: TestClient):
    """Test that positions endpoint requires authentication"""
    response = client.get("/api/v2/positions/")
    assert response.status_code == 401


def test_create_position_requires_auth(client: TestClient):
    """Test that creating a position requires authentication"""
    response = client.post("/api/v2/positions/", json={
        "ticker": "AAPL",
        "initial_event": {
            "event_type": "buy",
            "shares": 10,
            "price": 150.0
        }
    })
    assert response.status_code == 401


# === Position CRUD Tests ===

def test_create_position_success(client: TestClient, test_db: Session):
    """Test successful position creation"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "strategy": "Swing Trade",
        "setup_type": "Breakout",
        "timeframe": "Daily",
        "initial_event": {
            "event_type": "buy",
            "shares": 10,
            "price": 150.0,
            "stop_loss": 145.0,
            "take_profit": 160.0,
            "notes": "Entry on breakout"
        },
        "notes": "Strong momentum",
        "account_balance_at_entry": 10000.0
    })
    
    assert response.status_code == 201
    data = response.json()
    assert data["ticker"] == "AAPL"
    assert data["strategy"] == "Swing Trade"
    assert data["status"] == "open"
    assert data["current_shares"] == 10
    assert data["avg_entry_price"] == 150.0
    assert data["total_cost"] == 1500.0
    assert data["events_count"] == 1
    assert data["account_value_at_entry"] == 10000.0


def test_create_position_validates_ticker(client: TestClient):
    """Test that ticker is required and cannot be empty"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "",
        "initial_event": {
            "event_type": "buy",
            "shares": 10,
            "price": 150.0
        }
    })
    
    assert response.status_code == 400


def test_create_position_validates_shares(client: TestClient):
    """Test that shares must be positive"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {
            "event_type": "buy",
            "shares": 0,
            "price": 150.0
        }
    })
    
    assert response.status_code == 400


def test_create_position_validates_price(client: TestClient):
    """Test that price must be positive"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {
            "event_type": "buy",
            "shares": 10,
            "price": -150.0
        }
    })
    
    assert response.status_code == 400


def test_create_position_requires_buy_event(client: TestClient):
    """Test that initial event must be a buy"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {
            "event_type": "sell",
            "shares": 10,
            "price": 150.0
        }
    })
    
    assert response.status_code == 400


def test_get_positions_empty(client: TestClient):
    """Test getting positions when user has none"""
    token = create_test_user(client, "user2", "user2@example.com")
    headers = get_auth_headers(token)
    
    response = client.get("/api/v2/positions/", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


def test_get_positions_returns_user_positions_only(client: TestClient):
    """Test that users can only see their own positions"""
    token1 = create_test_user(client, "user1", "user1@example.com")
    token2 = create_test_user(client, "user2", "user2@example.com")
    
    # User 1 creates a position
    client.post("/api/v2/positions/", headers=get_auth_headers(token1), json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    
    # User 2 should not see User 1's position
    response = client.get("/api/v2/positions/", headers=get_auth_headers(token2))
    assert response.status_code == 200
    assert len(response.json()) == 0


def test_get_position_details(client: TestClient):
    """Test getting detailed position information"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Create position
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    # Get details
    response = client.get(f"/api/v2/positions/{position_id}", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "position" in data
    assert "events" in data
    assert "metrics" in data
    assert len(data["events"]) == 1


def test_get_position_details_not_found(client: TestClient):
    """Test getting non-existent position returns 404"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.get("/api/v2/positions/99999", headers=headers)
    assert response.status_code == 404


def test_get_position_details_forbidden_other_user(client: TestClient):
    """Test that users cannot access other users' positions"""
    token1 = create_test_user(client, "user1", "user1@example.com")
    token2 = create_test_user(client, "user2", "user2@example.com")
    
    # User 1 creates position
    create_response = client.post("/api/v2/positions/", 
                                  headers=get_auth_headers(token1), 
                                  json={
                                      "ticker": "AAPL",
                                      "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
                                  })
    position_id = create_response.json()["id"]
    
    # User 2 tries to access it
    response = client.get(f"/api/v2/positions/{position_id}", 
                         headers=get_auth_headers(token2))
    assert response.status_code == 403


def test_update_position_metadata(client: TestClient):
    """Test updating position metadata"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Create position
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    # Update metadata
    response = client.put(f"/api/v2/positions/{position_id}", headers=headers, json={
        "strategy": "Updated Strategy",
        "notes": "Updated notes",
        "lessons": "Learned patience",
        "mistakes": "Entered too early"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert data["strategy"] == "Updated Strategy"
    assert data["notes"] == "Updated notes"
    assert data["lessons"] == "Learned patience"
    assert data["mistakes"] == "Entered too early"


def test_delete_position(client: TestClient):
    """Test deleting a position"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Create position
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    # Delete position
    response = client.delete(f"/api/v2/positions/{position_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["success"] is True
    
    # Verify it's gone
    response = client.get(f"/api/v2/positions/{position_id}", headers=headers)
    assert response.status_code == 404


# === Event Management Tests ===

def test_add_buy_event(client: TestClient):
    """Test adding a buy event to an existing position"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Create position
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    # Add another buy
    response = client.post(f"/api/v2/positions/{position_id}/events", headers=headers, json={
        "event_type": "buy",
        "shares": 5,
        "price": 155.0,
        "notes": "Adding to position"
    })
    
    assert response.status_code == 201
    data = response.json()
    assert data["event_type"] == "buy"
    assert data["shares"] == 5
    assert data["price"] == 155.0


def test_add_sell_event(client: TestClient):
    """Test adding a sell event to close part of a position"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Create position
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    # Sell half
    response = client.post(f"/api/v2/positions/{position_id}/events", headers=headers, json={
        "event_type": "sell",
        "shares": 5,
        "price": 160.0,
        "notes": "Taking profit"
    })
    
    assert response.status_code == 201
    data = response.json()
    assert data["event_type"] == "sell"
    # Shares are stored as negative for sell events internally
    assert abs(data["shares"]) == 5 or data["shares"] == 5  # Accept either format
    assert data["price"] == 160.0
    assert data["realized_pnl"] is not None  # Should calculate P&L


def test_add_event_validates_shares(client: TestClient):
    """Test that event shares must be positive"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    response = client.post(f"/api/v2/positions/{position_id}/events", headers=headers, json={
        "event_type": "buy",
        "shares": 0,
        "price": 150.0
    })
    
    assert response.status_code == 400


def test_add_event_validates_event_type(client: TestClient):
    """Test that event type must be buy or sell"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    response = client.post(f"/api/v2/positions/{position_id}/events", headers=headers, json={
        "event_type": "invalid",
        "shares": 5,
        "price": 150.0
    })
    
    assert response.status_code == 400


def test_get_position_events(client: TestClient):
    """Test getting all events for a position"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Create position with initial event
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    # Add another event
    client.post(f"/api/v2/positions/{position_id}/events", headers=headers, json={
        "event_type": "buy",
        "shares": 5,
        "price": 155.0
    })
    
    # Get all events
    response = client.get(f"/api/v2/positions/{position_id}/events", headers=headers)
    assert response.status_code == 200
    events = response.json()
    assert len(events) == 2


def test_update_event(client: TestClient):
    """Test updating event stop loss and notes"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    # Get the event ID
    events_response = client.get(f"/api/v2/positions/{position_id}/events", headers=headers)
    event_id = events_response.json()[0]["id"]
    
    # Update event
    response = client.put(f"/api/v2/positions/events/{event_id}", headers=headers, json={
        "stop_loss": 145.0,
        "take_profit": 160.0,
        "notes": "Updated stop loss"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert data["stop_loss"] == 145.0
    assert data["take_profit"] == 160.0
    assert data["notes"] == "Updated stop loss"


def test_delete_event(client: TestClient):
    """Test deleting an event"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    # Add a second event
    add_response = client.post(f"/api/v2/positions/{position_id}/events", headers=headers, json={
        "event_type": "buy",
        "shares": 5,
        "price": 155.0
    })
    event_id = add_response.json()["id"]
    
    # Delete the event
    response = client.delete(f"/api/v2/positions/events/{event_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["success"] is True


# === Filter Tests ===

def test_filter_positions_by_status(client: TestClient):
    """Test filtering positions by status"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Create open position
    client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    
    # Filter for open positions
    response = client.get("/api/v2/positions/?status=open", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1
    
    # Filter for closed positions
    response = client.get("/api/v2/positions/?status=closed", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 0


def test_filter_positions_by_ticker(client: TestClient):
    """Test filtering positions by ticker"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Create positions with different tickers
    client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    
    client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "TSLA",
        "initial_event": {"event_type": "buy", "shares": 5, "price": 200.0}
    })
    
    # Filter for AAPL
    response = client.get("/api/v2/positions/?ticker=AAPL", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["ticker"] == "AAPL"


def test_pagination(client: TestClient):
    """Test paginated positions endpoint"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Create multiple positions
    for i in range(5):
        client.post("/api/v2/positions/", headers=headers, json={
            "ticker": f"TICK{i}",
            "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
        })
    
    # Get first page
    response = client.get("/api/v2/positions/paginated?page=1&limit=2", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["positions"]) == 2
    assert data["total"] == 5
    assert data["page"] == 1
    assert data["pages"] == 3


# === Journal Entry Tests ===

def test_create_journal_entry(client: TestClient):
    """Test creating a journal entry for a position"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    response = client.post(f"/api/v2/positions/{position_id}/journal", headers=headers, json={
        "entry_type": "note",
        "content": "Strong uptrend continuing, holding position"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert data["entry_type"] == "note"
    assert data["content"] == "Strong uptrend continuing, holding position"


def test_get_journal_entries(client: TestClient):
    """Test getting all journal entries for a position"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    # Create two journal entries
    client.post(f"/api/v2/positions/{position_id}/journal", headers=headers, json={
        "entry_type": "note",
        "content": "Entry 1"
    })
    
    client.post(f"/api/v2/positions/{position_id}/journal", headers=headers, json={
        "entry_type": "lesson",
        "content": "Entry 2"
    })
    
    # Get all entries
    response = client.get(f"/api/v2/positions/{position_id}/journal", headers=headers)
    assert response.status_code == 200
    entries = response.json()
    assert len(entries) == 2


def test_update_journal_entry(client: TestClient):
    """Test updating a journal entry"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    # Create entry
    create_entry_response = client.post(f"/api/v2/positions/{position_id}/journal", 
                                       headers=headers, json={
        "entry_type": "note",
        "content": "Original content"
    })
    entry_id = create_entry_response.json()["id"]
    
    # Update entry
    response = client.put(f"/api/v2/journal/{entry_id}", headers=headers, json={
        "content": "Updated content",
        "entry_type": "lesson"
    })
    
    assert response.status_code == 200
    data = response.json()
    assert data["content"] == "Updated content"
    assert data["entry_type"] == "lesson"


def test_delete_journal_entry(client: TestClient):
    """Test deleting a journal entry"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "initial_event": {"event_type": "buy", "shares": 10, "price": 150.0}
    })
    position_id = create_response.json()["id"]
    
    # Create entry
    create_entry_response = client.post(f"/api/v2/positions/{position_id}/journal", 
                                       headers=headers, json={
        "entry_type": "note",
        "content": "Test entry"
    })
    entry_id = create_entry_response.json()["id"]
    
    # Delete entry
    response = client.delete(f"/api/v2/journal/{entry_id}", headers=headers)
    assert response.status_code == 200


# === Integration Tests ===

def test_full_position_lifecycle(client: TestClient):
    """Test complete position lifecycle from creation to closure"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # 1. Create position
    create_response = client.post("/api/v2/positions/", headers=headers, json={
        "ticker": "AAPL",
        "strategy": "Swing Trade",
        "initial_event": {
            "event_type": "buy",
            "shares": 100,
            "price": 150.0,
            "stop_loss": 145.0
        },
        "notes": "Breakout trade"
    })
    assert create_response.status_code == 201
    position_id = create_response.json()["id"]
    
    # 2. Add journal entry
    journal_response = client.post(f"/api/v2/positions/{position_id}/journal", 
                                   headers=headers, json={
        "entry_type": "note",
        "content": "Entry looks good, strong volume"
    })
    assert journal_response.status_code == 200
    
    # 3. Add to position (scale in)
    scale_response = client.post(f"/api/v2/positions/{position_id}/events", 
                                 headers=headers, json={
        "event_type": "buy",
        "shares": 50,
        "price": 152.0
    })
    assert scale_response.status_code == 201
    
    # 4. Take partial profit
    profit_response = client.post(f"/api/v2/positions/{position_id}/events", 
                                  headers=headers, json={
        "event_type": "sell",
        "shares": 75,
        "price": 160.0
    })
    assert profit_response.status_code == 201
    
    # 5. Close remaining position
    close_response = client.post(f"/api/v2/positions/{position_id}/events", 
                                 headers=headers, json={
        "event_type": "sell",
        "shares": 75,
        "price": 158.0
    })
    assert close_response.status_code == 201
    
    # 6. Verify final position state
    final_response = client.get(f"/api/v2/positions/{position_id}", headers=headers)
    assert final_response.status_code == 200
    final_data = final_response.json()
    assert final_data["position"]["status"] == "closed"
    assert final_data["position"]["current_shares"] == 0
    assert len(final_data["events"]) == 4  # Initial buy + 3 more events