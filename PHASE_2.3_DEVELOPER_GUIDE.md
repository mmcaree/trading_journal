# Phase 2.3 Developer Guide
**Dynamic Account Value System - Quick Reference**

## 🎯 Key Concepts

### What Changed?
Previously, users manually updated their account balance. Now, the system **automatically calculates** account value based on:

```
Account Value = Starting Balance + Realized P&L + Deposits - Withdrawals
```

### Architecture
- **Backend**: `AccountValueService` calculates values dynamically with 5-minute cache
- **Frontend**: Fetches values via API endpoints, never stores or updates balance directly
- **Database**: `initial_account_balance` (user sets once), `starting_balance_date`

---

## 📡 API Endpoints

### Get Current Account Value
```http
GET /api/users/me/account-value
Authorization: Bearer {token}

Response:
{
  "account_value": 15234.56
}
```

### Get Detailed Breakdown
```http
GET /api/users/me/account-value/breakdown
Authorization: Bearer {token}

Response:
{
  "current_value": 15234.56,
  "starting_balance": 10000.00,
  "realized_pnl": 3234.56,
  "total_deposits": 5000.00,
  "total_withdrawals": 3000.00,
  "net_cash_flow": 2000.00,
  "calculation": "10000.00 + 3234.56 + 5000.00 - 3000.00 = 15234.56"
}
```

### Get Growth Metrics
```http
GET /api/analytics/account-growth-metrics
Authorization: Bearer {token}

Response:
{
  "current_value": 15234.56,
  "starting_balance": 10000.00,
  "realized_pnl": 3234.56,
  "net_deposits": 2000.00,
  "total_deposits": 5000.00,
  "total_withdrawals": 3000.00,
  "trading_growth_percent": 32.35,  // P&L only, excludes deposits/withdrawals
  "total_growth_percent": 52.35,    // Includes everything
  "calculation": { ... }
}
```

### Get Equity Curve
```http
GET /api/users/me/equity-curve?start_date=2025-01-01&end_date=2025-12-31
Authorization: Bearer {token}

Response:
{
  "equity_curve": [
    {
      "date": "2025-01-01",
      "value": 10000.00,
      "event_type": null,
      "description": "Starting balance"
    },
    {
      "date": "2025-01-15",
      "value": 15000.00,
      "event_type": "deposit",
      "description": "Initial funding"
    },
    {
      "date": "2025-02-01",
      "value": 15500.00,
      "event_type": "position_close",
      "description": "Closed AAPL for +$500"
    }
  ]
}
```

### Update Starting Balance
```http
PUT /api/users/me/starting-balance?starting_balance=10000&starting_date=2025-01-01
Authorization: Bearer {token}

Response:
{
  "success": true,
  "starting_balance": 10000.00,
  "starting_date": "2025-01-01T00:00:00Z"
}
```

---

## 🔧 Backend Usage

### Getting Account Value (Correct Way)
```python
from app.services.account_value_service import AccountValueService

# In your route/service
account_service = AccountValueService(db)

# Get current value
current_value = account_service.get_current_account_value(user_id)

# Get value at specific date
value_at_entry = account_service.get_account_value_at_date(
    user_id=user_id,
    target_date=position.opened_at
)

# Get detailed breakdown
breakdown = account_service.get_account_value_breakdown(user_id)

# Get equity curve for charting
equity_curve = account_service.get_equity_curve(
    user_id=user_id,
    start_date=start_date,
    end_date=end_date
)
```

### Cache Invalidation (Important!)
When user changes affect account value, **always invalidate cache**:

```python
from app.services.account_value_service import AccountValueService

account_service = AccountValueService(db)

# Invalidate when:
# 1. User updates starting balance
user.initial_account_balance = new_balance
db.commit()
account_service.invalidate_cache(user.id)

# 2. User adds/edits/deletes a transaction
transaction = AccountTransaction(...)
db.add(transaction)
db.commit()
account_service.invalidate_cache(user.id)

# 3. Position closes (P&L realized) - automatic, no action needed
```

### ❌ What NOT To Do
```python
# ❌ WRONG: Don't update current_account_balance directly
user.current_account_balance += pnl  # NO!
db.commit()

# ✅ CORRECT: Let AccountValueService calculate it
account_service = AccountValueService(db)
current_value = account_service.get_current_account_value(user.id)
```

---

## 💻 Frontend Usage

### React Components
```typescript
import { useState, useEffect } from 'react';
import api from '../services/apiConfig';

function AccountValueDisplay() {
  const [accountValue, setAccountValue] = useState<number>(0);
  const [breakdown, setBreakdown] = useState<any>(null);

  useEffect(() => {
    loadAccountValue();
  }, []);

  const loadAccountValue = async () => {
    try {
      // Get current value
      const valueRes = await api.get('/api/users/me/account-value');
      setAccountValue(valueRes.data.account_value);

      // Get breakdown
      const breakdownRes = await api.get('/api/users/me/account-value/breakdown');
      setBreakdown(breakdownRes.data);
    } catch (error) {
      console.error('Failed to load account value:', error);
    }
  };

  return (
    <div>
      <h2>Account Value</h2>
      <p>${accountValue.toLocaleString()}</p>
      
      {breakdown && (
        <div>
          <p>Starting: ${breakdown.starting_balance.toLocaleString()}</p>
          <p>Trading P&L: ${breakdown.realized_pnl.toLocaleString()}</p>
          <p>Net Deposits: ${breakdown.net_cash_flow.toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}
```

### Using EquityCurveChart Component
```typescript
import { EquityCurveChart } from '../components/EquityCurveChart';

function Dashboard() {
  return (
    <div>
      {/* Full width, 400px height */}
      <EquityCurveChart height={400} />
      
      {/* Custom date range */}
      <EquityCurveChart 
        startDate="2025-01-01"
        endDate="2025-12-31"
        height={300}
      />
    </div>
  );
}
```

---

## 🗃️ Database Schema

### User Model
```python
class User(Base):
    # DEPRECATED: Don't write to this field
    current_account_balance = Column(Float, nullable=True)
    
    # ACTIVE: User sets these
    initial_account_balance = Column(Float, nullable=True)  # User's starting balance
    starting_balance_date = Column(DateTime, nullable=True)  # When they started
```

### AccountTransaction Model
```python
class AccountTransaction(Base):
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    transaction_type = Column(String)  # 'DEPOSIT' or 'WITHDRAWAL'
    amount = Column(Float, nullable=False)
    transaction_date = Column(DateTime, nullable=False)
    description = Column(Text, nullable=True)
```

### TradingPosition Model
```python
class TradingPosition(Base):
    # Used for P&L calculation
    total_realized_pnl = Column(Float, nullable=True)
    status = Column(String)  # 'open' or 'closed'
    closed_at = Column(DateTime, nullable=True)
```

---

## 🔍 Debugging

### Check Cache State
```python
from app.services.account_value_service import AccountValueService

# View cache contents (development only)
print(f"Cache size: {len(AccountValueService._cache)}")
print(f"Cached users: {[k[0] for k in AccountValueService._cache.keys()]}")

# Clear all cache (testing only)
AccountValueService.clear_all_cache()
```

### Verify Calculation Manually
```sql
-- Check user's starting balance
SELECT initial_account_balance, starting_balance_date 
FROM users WHERE id = 1;

-- Check realized P&L
SELECT SUM(total_realized_pnl) as total_pnl
FROM trading_positions
WHERE user_id = 1 AND status = 'closed';

-- Check deposits
SELECT SUM(amount) as total_deposits
FROM account_transactions
WHERE user_id = 1 AND transaction_type = 'DEPOSIT';

-- Check withdrawals
SELECT SUM(amount) as total_withdrawals
FROM account_transactions
WHERE user_id = 1 AND transaction_type = 'WITHDRAWAL';

-- Manual calculation:
-- Account Value = initial_account_balance + total_pnl + total_deposits - total_withdrawals
```

### Common Issues

#### Issue: Account value not updating after transaction
**Cause:** Cache not invalidated  
**Fix:** Ensure `account_service.invalidate_cache(user_id)` called after DB commit

#### Issue: Frontend shows stale data
**Cause:** Browser cache or component not refetching  
**Fix:** Check useEffect dependencies, force refresh, clear browser cache

#### Issue: Equity curve missing points
**Cause:** Date filters too restrictive  
**Fix:** Check start_date/end_date parameters, use 'ALL' time range

---

## 📚 Key Metrics Explained

### Trading Growth %
```
Trading Growth % = (Realized P&L / Starting Balance) × 100
```
- **Excludes** deposits and withdrawals
- Shows your **actual trading performance**
- Used by professional traders and brokers

### Total Growth %
```
Total Growth % = ((Current Value - Starting Balance) / Starting Balance) × 100
```
- **Includes** deposits and withdrawals
- Shows **overall account growth**
- Less useful for performance analysis

### Example
```
Starting Balance: $10,000
Realized P&L: +$2,000 (from trading)
Deposits: +$5,000
Withdrawals: -$1,000
Current Value: $16,000

Trading Growth % = (2000 / 10000) × 100 = 20%
Total Growth % = ((16000 - 10000) / 10000) × 100 = 60%

Your trading skill: 20% (good!)
Your total account growth: 60% (but includes deposits)
```

---

## ✅ Best Practices

### DO:
✅ Always use `AccountValueService` for account value calculations  
✅ Invalidate cache after balance/transaction changes  
✅ Show Trading Growth % as primary metric to users  
✅ Explain the difference between Trading Growth and Total Growth  
✅ Use equity curve for visual performance tracking  
✅ Test with various date ranges and edge cases  

### DON'T:
❌ Don't write to `user.current_account_balance` directly  
❌ Don't calculate account value in frontend  
❌ Don't forget to invalidate cache after changes  
❌ Don't confuse Trading Growth with Total Growth in UI  
❌ Don't show stale cached data (respect TTL)  
❌ Don't remove `initial_account_balance` field  

---

## 🚀 Quick Start Testing

### 1. Backend Test
```bash
# Start backend
cd backend
python -m uvicorn app.main:app --reload

# Test endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/users/me/account-value
```

### 2. Frontend Test
```bash
# Start frontend
cd frontend
npm run dev

# Open browser
# Navigate to: http://localhost:5173
# Login and check Settings → Account Management
```

### 3. Integration Test
1. Set starting balance: $10,000
2. Close a position with +$500 P&L
3. Add deposit: $1,000
4. Check Dashboard - should show:
   - Current Value: $11,500
   - Trading Growth: 5%
   - Total Growth: 15%

---

## 📞 Support

### Questions?
- Check [PHASE_2.3_TESTING_CHECKLIST.md](./PHASE_2.3_TESTING_CHECKLIST.md)
- Review [API_ROUTES.md](./API_ROUTES.md)
- See [PHASE_2.2_2.3_STATUS.md](./PHASE_2.2_2.3_STATUS.md)

### Found a Bug?
1. Check console for errors
2. Verify cache is not stale
3. Test with fresh user account
4. Check backend logs

---

**Last Updated:** December 2, 2025  
**Version:** 1.0
