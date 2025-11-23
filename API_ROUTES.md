# TradeJournal API Routes Documentation

Complete reference for all API endpoints in the TradeJournal application.

**Base URL**: `https://tradingjournal.up.railway.app` (production) or `http://localhost:8000` (local)

**Auto-Generated Docs**: `/docs` (Swagger UI) or `/redoc` (ReDoc)

---

## 📋 Table of Contents

- [Authentication](#authentication)
- [Positions Management](#positions-management)
- [Events Management](#events-management)
- [Journal Entries](#journal-entries)
- [Import/Export](#importexport)
- [Analytics](#analytics)
- [User Profile](#user-profile)
- [Image Management](#image-management)
- [Admin/Instructor](#admininstructor)

---

## 🔐 Authentication

All authenticated endpoints require Bearer token in Authorization header:
```
Authorization: Bearer <access_token>
```

### POST `/auth/register`
Register a new user account.

**Request Body**:
```json
{
  "username": "trader123",
  "email": "trader@example.com",
  "password": "secure_password",
  "first_name": "John",
  "last_name": "Doe"
}
```

**Response**: `201 Created`
```json
{
  "id": 1,
  "username": "trader123",
  "email": "trader@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "STUDENT",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Possible Errors**:
- `400 Bad Request` - Username/email already exists
- `422 Unprocessable Entity` - Validation error

---

### POST `/auth/login`
Login and receive access token.

**Request Body** (form-data):
```
username: trader123
password: secure_password
```

**Response**: `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Possible Errors**:
- `401 Unauthorized` - Invalid credentials

---

### POST `/auth/forgot-password`
Request password reset email.

**Request Body**:
```json
{
  "email": "trader@example.com"
}
```

**Response**: `200 OK`
```json
{
  "message": "If the email address exists, a password reset link has been sent."
}
```

**Note**: Always returns success to prevent email enumeration

---

### POST `/auth/reset-password`
Reset password using token from email.

**Request Body**:
```json
{
  "token": "reset_token_from_email",
  "new_password": "new_secure_password"
}
```

**Response**: `200 OK`
```json
{
  "message": "Password has been reset successfully"
}
```

**Possible Errors**:
- `400 Bad Request` - Invalid or expired token

---

## 📊 Positions Management

All position endpoints require authentication.

### POST `/positions/`
Create a new position with initial buy event.

**Request Body**:
```json
{
  "ticker": "AAPL",
  "strategy": "Momentum",
  "setup_type": "Breakout",
  "timeframe": "Daily",
  "notes": "Strong volume breakout above resistance",
  "account_balance_at_entry": 50000,
  "initial_event": {
    "event_type": "buy",
    "shares": 100,
    "price": 150.50,
    "event_date": "2024-01-15T14:30:00Z",
    "stop_loss": 145.00,
    "take_profit": 160.00,
    "notes": "Entry at breakout confirmation"
  }
}
```

**Response**: `201 Created`
```json
{
  "id": 42,
  "ticker": "AAPL",
  "strategy": "Momentum",
  "setup_type": "Breakout",
  "timeframe": "Daily",
  "status": "open",
  "current_shares": 100,
  "avg_entry_price": 150.50,
  "total_cost": 15050.00,
  "total_realized_pnl": 0,
  "current_stop_loss": 145.00,
  "current_take_profit": 160.00,
  "opened_at": "2024-01-15T14:30:00Z",
  "closed_at": null,
  "notes": "Strong volume breakout above resistance",
  "lessons": null,
  "mistakes": null,
  "events_count": 1,
  "return_percent": null,
  "original_risk_percent": 3.65,
  "current_risk_percent": 3.65,
  "original_shares": 100,
  "account_value_at_entry": 50000
}
```

**Possible Errors**:
- `400 Bad Request` - Invalid data (negative shares/price, etc.)
- `422 Unprocessable Entity` - Validation error

---

### GET `/positions/`
Get all user positions with optional filtering.

**Query Parameters**:
- `status` (optional): Filter by status (`open`, `closed`)
- `ticker` (optional): Filter by ticker symbol
- `strategy` (optional): Filter by strategy
- `include_events` (optional): Include event history (default: `false`)
- `skip` (optional): Pagination offset (default: `0`)
- `limit` (optional): Max results (default: `100`, max: `100000`)

**Example Request**:
```
GET /positions/?status=open&include_events=true&limit=50
```

**Response**: `200 OK`
```json
[
  {
    "id": 42,
    "ticker": "AAPL",
    "strategy": "Momentum",
    "status": "open",
    "current_shares": 100,
    "avg_entry_price": 150.50,
    "total_cost": 15050.00,
    "total_realized_pnl": 0,
    "opened_at": "2024-01-15T14:30:00Z",
    "events_count": 1,
    "events": [
      {
        "id": 101,
        "event_type": "buy",
        "shares": 100,
        "price": 150.50,
        "event_date": "2024-01-15T14:30:00Z",
        "realized_pnl": null
      }
    ]
  }
]
```

---

### GET `/positions/{position_id}`
Get detailed position information including full event history and metrics.

**Response**: `200 OK`
```json
{
  "position": {
    "id": 42,
    "ticker": "AAPL",
    "status": "open",
    "current_shares": 100,
    "avg_entry_price": 150.50,
    "total_cost": 15050.00,
    "total_realized_pnl": 0
  },
  "events": [
    {
      "id": 101,
      "event_type": "buy",
      "shares": 100,
      "price": 150.50,
      "event_date": "2024-01-15T14:30:00Z",
      "stop_loss": 145.00,
      "take_profit": 160.00,
      "notes": "Entry at breakout confirmation",
      "source": "manual",
      "realized_pnl": null,
      "position_shares_before": 0,
      "position_shares_after": 100
    }
  ],
  "metrics": {
    "total_buy_events": 1,
    "total_sell_events": 0,
    "average_buy_price": 150.50,
    "average_sell_price": null,
    "holding_days": 5
  }
}
```

**Possible Errors**:
- `404 Not Found` - Position doesn't exist
- `403 Forbidden` - Not authorized to access this position

---

### PUT `/positions/{position_id}`
Update position metadata (strategy, notes, lessons, mistakes).

**Request Body**:
```json
{
  "strategy": "Momentum - Refined",
  "notes": "Updated analysis after watching price action",
  "lessons": "Wait for volume confirmation before entry",
  "mistakes": "Entered too early without confirmation"
}
```

**Response**: `200 OK` - Returns updated position object

---

### DELETE `/positions/{position_id}`
Delete a position and all related data (events, journal entries, charts).

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Position deleted successfully"
}
```

**Possible Errors**:
- `404 Not Found` - Position doesn't exist
- `403 Forbidden` - Not authorized to delete this position

---

## 📈 Events Management

### POST `/positions/{position_id}/events`
Add a buy or sell event to an existing position.

**Request Body**:
```json
{
  "event_type": "sell",
  "shares": 50,
  "price": 155.00,
  "event_date": "2024-01-20T10:00:00Z",
  "stop_loss": 150.00,
  "take_profit": 165.00,
  "notes": "Partial exit at resistance"
}
```

**Response**: `201 Created`
```json
{
  "id": 102,
  "event_type": "sell",
  "shares": 50,
  "price": 155.00,
  "event_date": "2024-01-20T10:00:00Z",
  "stop_loss": 150.00,
  "take_profit": 165.00,
  "notes": "Partial exit at resistance",
  "source": "manual",
  "realized_pnl": 225.00,
  "position_shares_before": 100,
  "position_shares_after": 50
}
```

**Possible Errors**:
- `400 Bad Request` - Invalid event type or selling more shares than owned
- `403 Forbidden` - Not authorized to modify this position
- `404 Not Found` - Position doesn't exist

---

### GET `/positions/{position_id}/events`
Get all events for a position in chronological order.

**Response**: `200 OK` - Array of event objects

---

### PUT `/positions/events/{event_id}`
Update event stop loss, take profit, or notes (basic update).

**Request Body**:
```json
{
  "stop_loss": 152.00,
  "take_profit": 168.00,
  "notes": "Updated risk management levels"
}
```

**Response**: `200 OK` - Updated event object

---

### PUT `/positions/events/{event_id}/comprehensive`
Comprehensive event update - modify shares, price, date, and risk management.

**Request Body**:
```json
{
  "shares": 75,
  "price": 151.25,
  "event_date": "2024-01-15T15:00:00Z",
  "stop_loss": 146.00,
  "take_profit": 162.00,
  "notes": "Corrected entry details"
}
```

**Response**: `200 OK` - Updated event object

**Note**: This recalculates position metrics based on the updated event.

---

### DELETE `/positions/events/{event_id}`
Delete a specific event.

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Event deleted successfully"
}
```

**Warning**: Deleting events recalculates position metrics. Cannot delete the only event in a position.

---

## 📝 Journal Entries

### GET `/positions/{position_id}/journal`
Get all journal entries for a position (diary-style chronological entries).

**Response**: `200 OK`
```json
[
  {
    "id": 15,
    "entry_type": "note",
    "content": "Market showing weakness, considering exit strategy",
    "entry_date": "2024-01-18T09:00:00Z",
    "created_at": "2024-01-18T09:05:00Z",
    "updated_at": "2024-01-18T09:05:00Z",
    "attached_images": [
      {
        "url": "https://cloudinary.com/image123.jpg",
        "description": "Daily chart showing resistance"
      }
    ],
    "attached_charts": [42, 43]
  }
]
```

---

### POST `/positions/{position_id}/journal`
Create a new journal entry for a position.

**Request Body**:
```json
{
  "entry_type": "lesson",
  "content": "Should have waited for volume confirmation before entering. Entry was too aggressive.",
  "entry_date": "2024-01-20T16:00:00Z",
  "attached_images": null,
  "attached_charts": null
}
```

**Entry Types**: `note`, `lesson`, `mistake`, `analysis`

**Response**: `201 Created` - Journal entry object

---

### PUT `/journal/{entry_id}`
Update a journal entry.

**Request Body**:
```json
{
  "content": "Updated: Should have waited for BOTH volume AND price confirmation",
  "entry_type": "lesson"
}
```

**Response**: `200 OK` - Updated journal entry object

---

### DELETE `/journal/{entry_id}`
Delete a journal entry.

**Response**: `200 OK`
```json
{
  "message": "Journal entry deleted successfully"
}
```

---

## 📥 Import/Export

### POST `/positions/import/webull`
Import Webull CSV file and automatically create positions and events.

**Request**: `multipart/form-data`
```
file: <webull_export.csv>
```

**Response**: `200 OK`
```json
{
  "success": true,
  "imported_events": 247,
  "total_positions": 52,
  "open_positions": 8,
  "warnings": [
    "Position TSLA has pending orders that may need manual review"
  ]
}
```

**Possible Errors**:
- `400 Bad Request` - Invalid CSV format or file type
- `500 Internal Server Error` - Import processing failed

---

### POST `/positions/import/validate`
Validate CSV file without importing (dry run).

**Request**: `multipart/form-data`
```
file: <webull_export.csv>
```

**Response**: `200 OK`
```json
{
  "valid": true,
  "total_events": 247,
  "filled_events": 240,
  "pending_events": 7,
  "unique_symbols": 52,
  "date_range": {
    "earliest": "2023-06-01T09:30:00Z",
    "latest": "2024-01-20T15:45:00Z"
  },
  "errors": [],
  "warnings": [
    "7 pending orders will be tracked separately"
  ]
}
```

---

## 📊 Analytics

### GET `/analytics/performance`
Get overall performance metrics for the user.

**Query Parameters**:
- `start_date` (optional): ISO date string (e.g., `2024-01-01`)
- `end_date` (optional): ISO date string

**Response**: `200 OK`
```json
{
  "total_trades": 52,
  "winning_trades": 35,
  "losing_trades": 17,
  "win_rate": 67.3,
  "total_pnl": 12450.75,
  "average_win": 520.30,
  "average_loss": -245.80,
  "largest_win": 1850.00,
  "largest_loss": -780.50,
  "profit_factor": 2.12,
  "sharpe_ratio": 1.45,
  "max_drawdown": -2340.00,
  "max_drawdown_percent": -15.6
}
```

---

### GET `/analytics/setups`
Get performance breakdown by setup type.

**Response**: `200 OK`
```json
[
  {
    "setup_type": "Breakout",
    "trade_count": 15,
    "win_rate": 73.3,
    "total_pnl": 4250.00,
    "average_pnl": 283.33
  },
  {
    "setup_type": "Pullback",
    "trade_count": 22,
    "win_rate": 63.6,
    "total_pnl": 5800.00,
    "average_pnl": 263.64
  }
]
```

---

## 👤 User Profile

### GET `/users/me`
Get current user profile information.

**Response**: `200 OK`
```json
{
  "id": 1,
  "username": "trader123",
  "email": "trader@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "display_name": "John D.",
  "role": "STUDENT",
  "profile_picture_url": "/static/uploads/profile_xyz.jpg",
  "current_account_balance": 52450.75,
  "initial_account_balance": 50000.00,
  "created_at": "2024-01-01T10:00:00Z",
  "email_notifications_enabled": true,
  "two_factor_enabled": false
}
```

---

### PUT `/users/me`
Update user profile information.

**Request Body**:
```json
{
  "first_name": "John",
  "last_name": "Trader",
  "display_name": "JT",
  "email": "newemaiil@example.com"
}
```

**Response**: `200 OK` - Updated user object

---

### PUT `/users/me/password`
Change user password.

**Request Body**:
```json
{
  "current_password": "old_password",
  "new_password": "new_secure_password"
}
```

**Response**: `200 OK`
```json
{
  "message": "Password changed successfully"
}
```

**Possible Errors**:
- `400 Bad Request` - Current password incorrect

---

### GET `/users/account-balance`
Get current account balance information.

**Response**: `200 OK`
```json
{
  "current_account_balance": 52450.75,
  "initial_account_balance": 50000.00,
  "default_account_size": 50000.00
}
```

---

### PUT `/users/account-balance`
Update account balance.

**Query Parameters**:
- `current_balance` (required): New current balance
- `initial_balance` (optional): Update initial balance

**Example Request**:
```
PUT /users/account-balance?current_balance=55000.00&initial_balance=50000.00
```

**Response**: `200 OK`
```json
{
  "message": "Account balance updated successfully",
  "current_account_balance": 55000.00,
  "initial_account_balance": 50000.00
}
```

---

### POST `/users/me/profile-picture`
Upload profile picture.

**Request**: `multipart/form-data`
```
file: <image.jpg>
```

**Allowed Types**: JPEG, PNG, WebP
**Max Size**: 5MB

**Response**: `200 OK`
```json
{
  "message": "Profile picture updated successfully",
  "profile_picture_url": "/static/uploads/abc123.jpg"
}
```

---

### DELETE `/users/me/profile-picture`
Delete profile picture.

**Response**: `200 OK`
```json
{
  "message": "Profile picture deleted successfully"
}
```

---

### DELETE `/users/me/data`
Clear all trading data (positions, events, journal entries) but keep account.

**Response**: `200 OK`
```json
{
  "message": "All trading data cleared successfully"
}
```

**Warning**: This is irreversible!

---

### DELETE `/users/me`
Delete user account entirely (account + all data).

**Response**: `200 OK`
```json
{
  "message": "Account deleted successfully"
}
```

**Warning**: This is irreversible!

---

## 🖼️ Image Management

### POST `/images/upload`
Upload an image (for charts, screenshots, etc.).

**Request**: `multipart/form-data`
```
file: <image.png>
```

**Allowed Types**: JPG, PNG, GIF, WebP
**Max Size**: 5MB

**Response**: `200 OK`
```json
{
  "success": true,
  "image_url": "https://cloudinary.com/trading_journal_v2/user_1_abc123.jpg",
  "filename": "user_1_abc123"
}
```

**Note**: Uses Cloudinary if configured, otherwise local storage.

---

### POST `/images/position/{position_id}/charts`
Add an uploaded chart image to a position.

**Request Body**:
```json
{
  "image_url": "https://cloudinary.com/trading_journal_v2/user_1_abc123.jpg",
  "description": "Daily chart showing entry point",
  "timeframe": "Daily"
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "chart_id": 42,
  "message": "Chart added successfully"
}
```

---

### GET `/images/position/{position_id}/charts`
Get all charts for a position.

**Response**: `200 OK`
```json
[
  {
    "id": 42,
    "image_url": "https://cloudinary.com/trading_journal_v2/user_1_abc123.jpg",
    "description": "Daily chart showing entry point",
    "timeframe": "Daily",
    "uploaded_at": "2024-01-15T14:45:00Z"
  }
]
```

---

### DELETE `/images/charts/{chart_id}`
Delete a chart image.

**Response**: `200 OK`
```json
{
  "success": true,
  "message": "Chart deleted successfully"
}
```

---

## 🎓 Admin/Instructor

All admin endpoints require `INSTRUCTOR` role.

### GET `/admin/students`
Get list of all students with summary statistics.

**Query Parameters**:
- `search` (optional): Search by username/email/name
- `limit` (optional): Max results (default: `100`, max: `1000`)
- `offset` (optional): Pagination offset

**Response**: `200 OK`
```json
[
  {
    "id": 5,
    "username": "student_joe",
    "email": "joe@example.com",
    "first_name": "Joe",
    "last_name": "Smith",
    "display_name": "Joe S",
    "created_at": "2024-01-10T10:00:00Z",
    "total_positions": 12,
    "open_positions": 3,
    "total_pnl": 1250.50,
    "total_trades": 24,
    "last_trade_date": "2024-01-20T14:30:00Z",
    "has_instructor_notes": true,
    "is_flagged": false
  }
]
```

---

### GET `/admin/student/{student_id}`
Get detailed student information.

**Response**: `200 OK` - Student profile object

---

### GET `/admin/student/{student_id}/positions`
Get all positions for a specific student.

**Response**: `200 OK` - Array of position objects

---

### GET `/admin/student/{student_id}/events`
Get all trading events for a student.

**Query Parameters**:
- `limit` (optional): Default `100`, max `1000`
- `offset` (optional): Pagination

**Response**: `200 OK` - Array of event objects

---

### GET `/admin/student/{student_id}/notes`
Get all instructor notes for a student.

**Response**: `200 OK`
```json
[
  {
    "id": 8,
    "instructor_id": 1,
    "student_id": 5,
    "note_text": "Student improving on risk management. Still needs work on entry timing.",
    "is_flagged": false,
    "created_at": "2024-01-18T16:00:00Z",
    "updated_at": "2024-01-18T16:00:00Z",
    "instructor_username": "prof_smith"
  }
]
```

---

### POST `/admin/student/{student_id}/notes`
Add instructor note for a student.

**Request Body**:
```json
{
  "note_text": "Excellent progress on position sizing this week. Keep it up!",
  "is_flagged": false
}
```

**Response**: `201 Created` - Note object with instructor info

---

### GET `/admin/student/{student_id}/journal`
Get all journal entries for a student across all positions.

**Query Parameters**:
- `limit` (optional): Default `100`, max `1000`
- `offset` (optional): Pagination

**Response**: `200 OK` - Array of journal entries with position context

---

### GET `/admin/student/{student_id}/position/{position_id}/details`
Get complete position details including events, journal entries, and charts.

**Response**: `200 OK`
```json
{
  "position": { /* position object */ },
  "events": [ /* array of events */ ],
  "journal_entries": [ /* array of journal entries */ ],
  "charts": [ /* array of chart images */ ]
}
```

---

### GET `/admin/analytics/class-overview`
Get class-wide analytics summary.

**Response**: `200 OK`
```json
{
  "total_students": 45,
  "active_students": 38,
  "total_positions": 542,
  "open_positions": 87,
  "total_class_pnl": 45823.75,
  "flagged_students": 3,
  "average_pnl_per_student": 1018.31
}
```

---

## 🚨 Common Error Responses

### 400 Bad Request
```json
{
  "error": "bad_request",
  "detail": "Shares must be greater than 0"
}
```

### 401 Unauthorized
```json
{
  "error": "unauthorized",
  "detail": "Not authenticated"
}
```

### 403 Forbidden
```json
{
  "error": "forbidden",
  "detail": "Not authorized to access this resource"
}
```

### 404 Not Found
```json
{
  "error": "not_found",
  "detail": "Position not found"
}
```

### 422 Unprocessable Entity
```json
{
  "error": "validation_error",
  "detail": [
    {
      "loc": ["body", "shares"],
      "msg": "value must be greater than 0",
      "type": "value_error"
    }
  ]
}
```

### 500 Internal Server Error
```json
{
  "error": "internal_server_error",
  "detail": "An unexpected error occurred"
}
```

---

## 📌 Important Notes

### Authentication
- Access tokens expire after 7 days (configurable in `settings.py`)
- Use token in `Authorization: Bearer <token>` header for all protected endpoints
- Tokens are JWT format containing user info

### Rate Limiting
- No explicit rate limiting currently implemented
- Consider implementing for production: 100 req/min per user

### File Uploads
- Images: Max 5MB, formats: JPG, PNG, GIF, WebP
- CSV: Max 10MB for imports
- Cloudinary used if configured, otherwise local storage

### Date Formats
- All dates use ISO 8601 format: `2024-01-15T14:30:00Z`
- Dates are stored in UTC, converted to user timezone in frontend

### Pagination
- Default limit: `100`
- Max limit varies by endpoint (typically `1000` or `100000` for analytics)
- Use `skip` and `limit` parameters for pagination

### Position Status
- `open`: Position currently held
- `closed`: Position fully exited (all shares sold)

### Event Types
- `buy`: Purchase shares (adds to position)
- `sell`: Sell shares (reduces position, may close)

### Journal Entry Types
- `note`: General observation or comment
- `lesson`: Key learning or takeaway
- `mistake`: Error or thing to avoid
- `analysis`: Detailed technical/fundamental analysis

---

## 🔧 Development Tips

### Testing Endpoints
1. Use `/docs` for interactive Swagger UI testing
2. Get auth token from `/auth/login` first
3. Click "Authorize" button in Swagger and paste token
4. Test endpoints directly from browser

### Common Issues & Solutions

**405 Method Not Allowed**:
- Check HTTP method (GET/POST/PUT/DELETE)
- Verify exact endpoint path (trailing slash matters for some frameworks)
- Ensure CORS allows the method (especially OPTIONS for preflight)

**401 Unauthorized**:
- Check token is valid and not expired
- Verify `Authorization: Bearer <token>` header format
- Re-login if token expired

**403 Forbidden**:
- User owns the resource? (can't access other users' positions)
- Instructor endpoints require `INSTRUCTOR` role

**422 Validation Error**:
- Check request body matches schema exactly
- Verify all required fields present
- Check data types (numbers vs strings)

### Debugging Backend
```bash
# Run with detailed logs
uvicorn app.main:app --reload --log-level debug

# Check error logs
tail -f logs/app.log
```

---

**Last Updated**: November 23, 2025
**API Version**: 2.0
**Generated From**: Actual route file analysis
