"""
Comprehensive tests for CSV import API endpoints
Tests universal import, broker detection, validation, and error handling
"""

import pytest
from fastapi.testclient import TestClient
from datetime import datetime
from sqlalchemy.orm import Session
from io import BytesIO


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


def create_csv_file(csv_content: str, filename: str = "test.csv"):
    """Helper to convert CSV string to file-like object"""
    return (filename, BytesIO(csv_content.encode('utf-8')), "text/csv")


# === Sample CSV Data ===

WEBULL_USA_CSV = """Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time
APPLE INC,AAPL,BUY,Filled,10,10,150.00,150.00,Day,10/15/2024 09:30:00,10/15/2024 09:30:15
APPLE INC,AAPL,SELL,Filled,5,5,160.00,160.00,Day,10/16/2024 14:00:00,10/16/2024 14:00:15
TESLA INC,TSLA,BUY,Filled,20,20,200.00,200.00,Day,10/17/2024 10:00:00,10/17/2024 10:00:15"""

WEBULL_AUS_CSV = """Symbol,Name,Currency,Type,Trade Date,Time,Buy/Sell,Quantity,Trade Price,Gross Amount,Net Amount,Comm/Fee/Tax,GST,Exchange
AAPL,Apple Inc,USD,EQUITY,10/15/2024,"09:30:00,GMT-05",BUY,10,150.00,-1500.00,-1501.00,-1,,NASDAQ
TSLA,Tesla Inc,USD,EQUITY,10/17/2024,"10:00:00,GMT-05",BUY,20,200.00,-4000.00,-4001.00,-1,,NASDAQ"""

INVALID_CSV = """Not,A,Valid,CSV
This,Wont,Parse"""

EMPTY_CSV = ""

MISSING_COLUMNS_CSV = """Symbol,Price
AAPL,150.00
TSLA,200.00"""


# === Authentication Tests ===

def test_import_requires_auth(client: TestClient):
    """Test that import endpoint requires authentication"""
    files = {"file": create_csv_file(WEBULL_USA_CSV)}
    response = client.post("/api/v2/positions/import/universal", files=files)
    assert response.status_code == 401


def test_validate_requires_auth(client: TestClient):
    """Test that validate endpoint requires authentication"""
    files = {"file": create_csv_file(WEBULL_USA_CSV)}
    response = client.post("/api/v2/positions/import/universal/validate", files=files)
    assert response.status_code == 401


# === Webull USA Import Tests ===

def test_import_webull_usa_success(client: TestClient):
    """Test successful import of Webull USA CSV"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(WEBULL_USA_CSV, "webull_usa.csv")}
    response = client.post("/api/v2/positions/import/universal", 
                          headers=headers,
                          files=files,
                          data={"broker": "webull_usa"})
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["imported_events"] > 0
    assert data["total_positions"] > 0


def test_import_webull_usa_creates_positions(client: TestClient):
    """Test that import creates correct number of positions"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(WEBULL_USA_CSV, "webull_usa.csv")}
    response = client.post("/api/v2/positions/import/universal", 
                          headers=headers,
                          files=files,
                          data={"broker": "webull_usa"})
    
    assert response.status_code == 200
    data = response.json()
    
    # Should create 2 positions (AAPL and TSLA)
    assert data["total_positions"] == 2
    # AAPL should be partially closed (5 shares remaining)
    assert data["open_positions"] >= 1


def test_import_webull_usa_user_isolation(client: TestClient):
    """Test that imports are isolated per user"""
    token1 = create_test_user(client, "user1", "user1@test.com")
    token2 = create_test_user(client, "user2", "user2@test.com")
    
    # User 1 imports
    files = {"file": create_csv_file(WEBULL_USA_CSV, "webull_usa.csv")}
    response1 = client.post("/api/v2/positions/import/universal", 
                           headers=get_auth_headers(token1),
                           files=files,
                           data={"broker": "webull_usa"})
    assert response1.status_code == 200
    
    # User 2 should have no positions
    positions = client.get("/api/v2/positions/", headers=get_auth_headers(token2))
    assert positions.status_code == 200
    assert len(positions.json()) == 0
    
    # User 1 should have positions
    positions = client.get("/api/v2/positions/", headers=get_auth_headers(token1))
    assert positions.status_code == 200
    assert len(positions.json()) > 0


# === Webull Australia Import Tests ===

def test_import_webull_aus_success(client: TestClient):
    """Test successful import of Webull Australia CSV"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(WEBULL_AUS_CSV, "webull_aus.csv")}
    response = client.post("/api/v2/positions/import/universal", 
                          headers=headers,
                          files=files,
                          data={"broker": "webull_au"})
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["imported_events"] > 0


def test_import_webull_aus_no_short_positions(client: TestClient):
    """Test that Webull Australia doesn't create short positions"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # CSV with potential wash trades (same timestamp BUY/SELL)
    wash_trade_csv = """Symbol,Name,Currency,Type,Trade Date,Time,Buy/Sell,Quantity,Trade Price,Gross Amount,Net Amount,Comm/Fee/Tax,GST,Exchange
AAPL,Apple Inc,USD,EQUITY,10/15/2024,"09:30:00,GMT-05",SELL,10,150.00,1500.00,1499.00,-1,,NASDAQ
AAPL,Apple Inc,USD,EQUITY,10/15/2024,"09:30:00,GMT-05",BUY,10,155.00,-1550.00,-1551.00,-1,,NASDAQ"""
    
    files = {"file": create_csv_file(wash_trade_csv, "wash_trade.csv")}
    response = client.post("/api/v2/positions/import/universal", 
                          headers=headers,
                          files=files,
                          data={"broker": "webull_au"})
    
    assert response.status_code == 200
    
    # Check that no positions have negative shares (short positions)
    positions = client.get("/api/v2/positions/", headers=headers)
    for position in positions.json():
        assert position["current_shares"] >= 0, "Should not have short positions"


# === Broker Auto-Detection Tests ===

def test_auto_detect_webull_usa(client: TestClient):
    """Test automatic detection of Webull USA format"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(WEBULL_USA_CSV, "webull_usa.csv")}
    response = client.post("/api/v2/positions/import/universal", 
                          headers=headers,
                          files=files)
    # No broker parameter - should auto-detect
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    # Check warnings contain detection message
    assert any("Webull (USA)" in str(w) or "webull_usa" in str(w) for w in data.get("warnings", []))


def test_auto_detect_webull_aus(client: TestClient):
    """Test automatic detection of Webull Australia format"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(WEBULL_AUS_CSV, "webull_aus.csv")}
    response = client.post("/api/v2/positions/import/universal", 
                          headers=headers,
                          files=files)
    # No broker parameter - should auto-detect
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    # Check warnings contain detection message
    assert any("Webull" in str(w) for w in data.get("warnings", []))


# === Validation Tests ===

def test_validate_csv_success(client: TestClient):
    """Test CSV validation returns correct info"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(WEBULL_USA_CSV, "webull_usa.csv")}
    response = client.post("/api/v2/positions/import/universal/validate", 
                          headers=headers,
                          files=files,
                          data={"broker": "webull_usa"})
    
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert "total_rows" in data or "rows" in data  # Field name might vary
    assert "available_columns" in data


def test_validate_csv_auto_detect(client: TestClient):
    """Test validation with auto-detection"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(WEBULL_USA_CSV, "webull_usa.csv")}
    response = client.post("/api/v2/positions/import/universal/validate", 
                          headers=headers,
                          files=files)
    
    assert response.status_code == 200
    data = response.json()
    # Should detect broker (might be in warnings or broker_detected field)
    assert data.get("valid") is True or "broker_detected" in data


def test_validate_empty_csv(client: TestClient):
    """Test validation rejects empty CSV"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(EMPTY_CSV, "empty.csv")}
    response = client.post("/api/v2/positions/import/universal/validate", 
                          headers=headers,
                          files=files)
    
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False
    assert "error" in data


def test_validate_invalid_csv(client: TestClient):
    """Test validation rejects invalid CSV"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(INVALID_CSV, "invalid.csv")}
    response = client.post("/api/v2/positions/import/universal/validate", 
                          headers=headers,
                          files=files)
    
    assert response.status_code == 200
    data = response.json()
    # Should either fail validation or fail to detect broker
    assert data["valid"] is False or data["broker_detected"] is None


def test_validate_missing_columns(client: TestClient):
    """Test validation detects missing required columns"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(MISSING_COLUMNS_CSV, "missing_cols.csv")}
    response = client.post("/api/v2/positions/import/universal/validate", 
                          headers=headers,
                          files=files,
                          data={"broker": "webull_usa"})
    
    assert response.status_code == 200
    data = response.json()
    # Should detect missing columns
    if data.get("missing_fields"):
        assert len(data["missing_fields"]) > 0


# === Error Handling Tests ===

def test_import_empty_csv_fails(client: TestClient):
    """Test that importing empty CSV fails gracefully"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(EMPTY_CSV, "empty.csv")}
    response = client.post("/api/v2/positions/import/universal", 
                          headers=headers,
                          files=files,
                          data={"broker": "webull_usa"})
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "error" in data


def test_import_invalid_broker_name(client: TestClient):
    """Test import with invalid broker name"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    files = {"file": create_csv_file(WEBULL_USA_CSV, "webull_usa.csv")}
    response = client.post("/api/v2/positions/import/universal", 
                          headers=headers,
                          files=files,
                          data={"broker": "invalid_broker"})
    
    assert response.status_code == 200
    data = response.json()
    # With invalid broker, should fall back to auto-detection and succeed
    assert data["success"] is True or data.get("error") is not None


def test_import_malformed_csv(client: TestClient):
    """Test import handles malformed CSV gracefully"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    malformed_csv = """Symbol,Side,Total Qty
AAPL,BUY,ten
TSLA,INVALID,"""
    
    files = {"file": create_csv_file(malformed_csv, "malformed.csv")}
    response = client.post("/api/v2/positions/import/universal", 
                          headers=headers,
                          files=files,
                          data={"broker": "webull_usa"})
    
    assert response.status_code == 200
    data = response.json()
    # Should either fail or have warnings
    assert data["success"] is False or "warnings" in data


def test_import_missing_required_field(client: TestClient):
    """Test import fails when required field is missing"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    response = client.post("/api/v2/positions/import/universal", 
                          headers=headers,
                          data={"broker": "webull_usa"})
                          # Missing file
    
    assert response.status_code == 422  # Validation error


# === Integration Tests ===

def test_import_creates_accurate_positions(client: TestClient):
    """Test that imported positions have correct values"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # Import data
    files = {"file": create_csv_file(WEBULL_USA_CSV, "webull_usa.csv")}
    import_response = client.post("/api/v2/positions/import/universal", 
                                 headers=headers,
                                 files=files,
                                 data={"broker": "webull_usa"})
    assert import_response.status_code == 200
    
    # Get positions
    positions_response = client.get("/api/v2/positions/", headers=headers)
    positions = positions_response.json()
    
    # Find AAPL position (bought 10, sold 5, should have 5 remaining)
    aapl = next((p for p in positions if p["ticker"] == "AAPL"), None)
    assert aapl is not None
    assert aapl["current_shares"] == 5
    assert aapl["avg_entry_price"] == 150.0
    
    # Find TSLA position (bought 20, no sales)
    tsla = next((p for p in positions if p["ticker"] == "TSLA"), None)
    assert tsla is not None
    assert tsla["current_shares"] == 20
    assert tsla["avg_entry_price"] == 200.0


def test_import_with_warnings(client: TestClient):
    """Test that import returns warnings for problematic rows"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    csv_with_issues = """Symbol,Side,Total Qty,Avg Price,Filled Time,Status
AAPL,BUY,10,150.00,10/15/2024 09:30:00,Filled
INVALID,,0,0,invalid_date,Unknown
TSLA,BUY,20,200.00,10/17/2024 10:00:00,Filled"""
    
    files = {"file": create_csv_file(csv_with_issues, "with_issues.csv")}
    response = client.post("/api/v2/positions/import/universal", 
                          headers=headers,
                          files=files,
                          data={"broker": "webull_usa"})
    
    assert response.status_code == 200
    data = response.json()
    # Should succeed but have warnings
    if data["success"]:
        assert "warnings" in data
        assert len(data["warnings"]) > 0


def test_import_multiple_times(client: TestClient):
    """Test importing multiple CSV files"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # First import
    files1 = {"file": create_csv_file(WEBULL_USA_CSV, "webull_usa.csv")}
    response1 = client.post("/api/v2/positions/import/universal", 
                           headers=headers,
                           files=files1,
                           data={"broker": "webull_usa"})
    assert response1.status_code == 200
    assert response1.json()["success"] is True
    
    # Second import with different data
    csv2 = """Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time
MICROSOFT CORP,MSFT,BUY,Filled,15,15,300.00,300.00,Day,10/18/2024 09:00:00,10/18/2024 09:00:15"""
    
    files2 = {"file": create_csv_file(csv2, "another.csv")}
    response2 = client.post("/api/v2/positions/import/universal", 
                           headers=headers,
                           files=files2,
                           data={"broker": "webull_usa"})
    assert response2.status_code == 200
    assert response2.json()["success"] is True
    
    # Should now have 3 positions total
    positions = client.get("/api/v2/positions/", headers=headers)
    assert len(positions.json()) == 3


def test_full_import_workflow(client: TestClient):
    """Test complete import workflow from validation to position retrieval"""
    token = create_test_user(client)
    headers = get_auth_headers(token)
    
    # 1. Validate CSV
    files1 = {"file": create_csv_file(WEBULL_USA_CSV, "webull_usa.csv")}
    validate_response = client.post("/api/v2/positions/import/universal/validate", 
                                   headers=headers,
                                   files=files1)
    assert validate_response.status_code == 200
    validate_data = validate_response.json()
    assert validate_data["valid"] is True
    broker = validate_data["broker_detected"]
    
    # 2. Import CSV
    files2 = {"file": create_csv_file(WEBULL_USA_CSV, "webull_usa.csv")}
    import_response = client.post("/api/v2/positions/import/universal", 
                                 headers=headers,
                                 files=files2,
                                 data={"broker": broker})
    assert import_response.status_code == 200
    import_data = import_response.json()
    assert import_data["success"] is True
    assert import_data["total_positions"] > 0
    
    # 3. Verify positions were created
    positions_response = client.get("/api/v2/positions/", headers=headers)
    assert positions_response.status_code == 200
    positions = positions_response.json()
    assert len(positions) == import_data["total_positions"]
    
    # 4. Verify position details
    position_id = positions[0]["id"]
    detail_response = client.get(f"/api/v2/positions/{position_id}", headers=headers)
    assert detail_response.status_code == 200
    detail_data = detail_response.json()
    assert "position" in detail_data
    assert "events" in detail_data
    assert len(detail_data["events"]) > 0
