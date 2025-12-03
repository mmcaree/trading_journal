# Phase 2.3 Testing Checklist
**Dynamic Account Values - Frontend Integration**

## 🎯 Testing Overview
Phase 2.3 replaces manual account value input with dynamic calculations. All account values should now be calculated automatically based on:
- Starting balance (set by user once)
- Realized P&L from closed positions
- Deposits and withdrawals

---

## 🧪 Pre-Testing Setup

### 1. Create Test User
```bash
# Register a new test account or use existing
Username: test_phase23
Email: test_phase23@example.com
Starting Balance: $10,000
Starting Date: January 1, 2025
```

### 2. Prepare Test Data
- [ ] Import sample trades (use test CSV files)
- [ ] Create at least 2 closed positions (1 win, 1 loss)
- [ ] Create at least 1 open position
- [ ] Add 1 deposit transaction ($5,000)
- [ ] Add 1 withdrawal transaction ($2,000)

---

## 📋 Feature Testing

### ✅ Settings Page - Account Management

#### Starting Balance Configuration
- [ ] Navigate to Settings → Account Management
- [ ] Verify "Starting Balance Configuration" section exists
- [ ] Input starting balance: $10,000
- [ ] Select starting date: January 1, 2025
- [ ] Click "Update Starting Balance"
- [ ] Verify success message appears
- [ ] Refresh page - verify balance persists

#### Current Account Value Display (Read-Only)
- [ ] Verify "Current Account Value (Calculated)" section shows:
  - [ ] Current value (formatted as currency)
  - [ ] Growth amount and percentage
  - [ ] Chip showing green (positive) or red (negative)
- [ ] Verify breakdown shows:
  - [ ] Starting Balance: $10,000
  - [ ] Trading P&L: (sum of closed positions)
  - [ ] Deposits: +$5,000
  - [ ] Withdrawals: -$2,000
  - [ ] Calculation total matches current value
- [ ] Click "View Breakdown" - verify modal opens with details

#### Account Transactions
- [ ] Click "Add Transaction" button
- [ ] Add deposit:
  - [ ] Type: Deposit
  - [ ] Amount: $1,000
  - [ ] Date: Today
  - [ ] Description: "Test deposit"
  - [ ] Click Save
  - [ ] Verify transaction appears in list
  - [ ] Verify account value increased by $1,000
- [ ] Add withdrawal:
  - [ ] Type: Withdrawal  
  - [ ] Amount: $500
  - [ ] Date: Today
  - [ ] Description: "Test withdrawal"
  - [ ] Click Save
  - [ ] Verify transaction appears in list
  - [ ] Verify account value decreased by $500
- [ ] Edit transaction:
  - [ ] Click Edit on a transaction
  - [ ] Change amount
  - [ ] Save
  - [ ] Verify account value updates
- [ ] Delete transaction:
  - [ ] Click Delete
  - [ ] Confirm deletion
  - [ ] Verify account value updates

#### Performance Summary
- [ ] Verify 4 summary cards display:
  - [ ] Starting Balance
  - [ ] Current Value
  - [ ] Trading Growth (P&L only)
  - [ ] Net Cash Flow (deposits - withdrawals)
- [ ] Verify Trading Growth excludes deposits/withdrawals
- [ ] Verify percentages calculate correctly

---

### ✅ Dashboard - Account Overview

#### Account Balance Card
- [ ] Navigate to Dashboard
- [ ] Verify "Account Balance" card shows:
  - [ ] Current value matches Settings page
  - [ ] Total Growth percentage
  - [ ] Green up arrow (if positive) or red down (if negative)
  - [ ] "View Breakdown" button exists
- [ ] Click "View Breakdown"
  - [ ] Verify dialog opens
  - [ ] Verify all breakdown components shown:
    - [ ] Current Account Value (highlighted)
    - [ ] Starting Balance
    - [ ] Trading P&L
    - [ ] Total Deposits
    - [ ] Total Withdrawals
    - [ ] Total Growth %
    - [ ] Trading Growth %
  - [ ] Verify info alert explains difference
  - [ ] Close dialog

#### Trading Performance Card  
- [ ] Verify "Trading Performance" card shows:
  - [ ] Trading Growth percentage (excludes deposits/withdrawals)
  - [ ] P&L amount
  - [ ] "(Excludes deposits/withdrawals)" text
- [ ] Verify value matches breakdown

#### Equity Curve Chart
- [ ] Verify equity curve chart displays on dashboard
- [ ] Verify chart shows account value over time
- [ ] Hover over points - verify tooltips show:
  - [ ] Date
  - [ ] Value
  - [ ] Event type (if applicable)
- [ ] Verify event colors:
  - [ ] Green dots = deposits
  - [ ] Red dots = withdrawals  
  - [ ] Blue dots = position closes

---

### ✅ Analytics Page - Growth Metrics

#### Account Growth Analysis Section
- [ ] Navigate to Analytics
- [ ] Verify "Account Growth Analysis" section exists
- [ ] Verify 4 cards display:
  - [ ] Current Account Value
  - [ ] Trading Growth (highlighted green)
  - [ ] Total Growth
  - [ ] Net Cash Flow
- [ ] Verify "Trading Growth" card:
  - [ ] Shows percentage
  - [ ] Shows P&L amount
  - [ ] Caption: "Excludes deposits/withdrawals"
- [ ] Verify "Total Growth" card:
  - [ ] Shows percentage
  - [ ] Shows growth amount
  - [ ] Caption: "Includes deposits/withdrawals"
- [ ] Verify info alert explains difference

#### Time Scale Filters
- [ ] Test each time scale button:
  - [ ] 1M (last month)
  - [ ] 3M (last 3 months)
  - [ ] 6M (last 6 months)
  - [ ] YTD (year to date)
  - [ ] 1YR (last year)
  - [ ] ALL (all time)
- [ ] Verify growth metrics recalculate for each period
- [ ] Verify equity curve adjusts to show selected period

#### Equity Curve Chart (Multiple Tabs)
- [ ] Verify equity curve appears on multiple tabs:
  - [ ] Overview tab
  - [ ] Time Analysis tab
  - [ ] Portfolio tab
- [ ] Test time range selectors on chart:
  - [ ] 1M, 3M, 6M, YTD, 1Y, ALL buttons
  - [ ] Verify chart data updates
  - [ ] Verify statistics update (peak, lowest, change %)

---

### ✅ Equity Curve Component (Detailed)

#### Visual Elements
- [ ] Verify chart header shows:
  - [ ] "Account Equity Curve" title with icon
  - [ ] Starting value
  - [ ] Current value
  - [ ] Change amount and percentage chip
- [ ] Verify time range buttons render correctly
- [ ] Verify chart axes:
  - [ ] X-axis shows dates (formatted properly)
  - [ ] Y-axis shows currency values with $ symbol
- [ ] Verify legend shows:
  - [ ] Green dot = Deposits
  - [ ] Red dot = Withdrawals
  - [ ] Blue dot = Position Closed

#### Interactivity
- [ ] Hover over chart line:
  - [ ] Verify tooltip appears
  - [ ] Shows formatted date
  - [ ] Shows account value
  - [ ] Shows event type if applicable
  - [ ] Shows description if available
- [ ] Click time range buttons:
  - [ ] Verify chart data filters correctly
  - [ ] Verify statistics recalculate
- [ ] Verify chart is responsive (resize browser window)

#### Statistics Display
- [ ] Verify bottom statistics show:
  - [ ] Peak value (highest point)
  - [ ] Lowest value (lowest point)
- [ ] Verify statistics match chart visually

---

## 🔬 Edge Case Testing

### Zero Balances & Empty States
- [ ] New user with no starting balance:
  - [ ] Should default to $10,000
  - [ ] Verify displayed in UI
- [ ] User with no trades:
  - [ ] Equity curve should show flat line
  - [ ] Trading Growth should be 0%
- [ ] User with only deposits/withdrawals:
  - [ ] Trading Growth should be 0%
  - [ ] Total Growth should match net cash flow

### Negative Scenarios
- [ ] Starting balance: $10,000
- [ ] Close position with large loss: -$12,000
- [ ] Verify account value shows negative: -$2,000
- [ ] Verify displayed with red color
- [ ] Verify growth percentage calculated correctly

### Large Numbers
- [ ] Test with large starting balance: $1,000,000
- [ ] Verify currency formatting (commas, decimals)
- [ ] Test with large P&L swings: ±$100,000
- [ ] Verify charts scale appropriately

### Time Boundaries
- [ ] Set starting date in far past (2020)
- [ ] Verify equity curve includes all data
- [ ] Test YTD filter on January 1st
- [ ] Test with positions spanning multiple years

### Concurrent Updates
- [ ] Open Settings in one tab
- [ ] Open Dashboard in another tab
- [ ] Update starting balance in Settings
- [ ] Refresh Dashboard
- [ ] Verify values updated (cache invalidated)

---

## 🔄 Integration Testing

### Account Value Consistency Across Pages
- [ ] Check account value on:
  - [ ] Settings page
  - [ ] Dashboard
  - [ ] Analytics page
- [ ] Verify all three show same value
- [ ] Update starting balance
- [ ] Verify all three update consistently

### Transaction Impact on Account Value
- [ ] Note current account value: $______
- [ ] Add deposit: $1,000
- [ ] Verify new value = old value + $1,000
- [ ] Add withdrawal: $500
- [ ] Verify new value = old value - $500
- [ ] Navigate between pages
- [ ] Verify value consistent everywhere

### Position Close Impact
- [ ] Note current account value: $______
- [ ] Close an open position with P&L: $______
- [ ] Verify account value updates by P&L amount
- [ ] Verify Trading Growth % increases/decreases
- [ ] Verify Total Growth % includes the change

### Cache Invalidation
- [ ] Load Dashboard (account value cached)
- [ ] Via Settings, update starting balance
- [ ] Return to Dashboard WITHOUT refreshing
- [ ] Click "View Breakdown" - should fetch fresh data
- [ ] Verify breakdown shows updated starting balance

---

## 🚨 Error Handling

### Network Errors
- [ ] Open DevTools → Network tab
- [ ] Throttle to "Slow 3G"
- [ ] Navigate to Dashboard
- [ ] Verify loading states display
- [ ] Verify data eventually loads

### API Errors
- [ ] Simulate 500 error (if possible via dev tools)
- [ ] Verify error message displays
- [ ] Verify no app crash
- [ ] Verify user can retry

### Invalid Data
- [ ] Try to set starting balance to negative: -$1,000
- [ ] Verify error message
- [ ] Try to set starting balance to $0
- [ ] Verify warning or error

---

## 📱 Responsive Design Testing

### Desktop (1920x1080)
- [ ] Settings page layout correct
- [ ] Dashboard cards display properly
- [ ] Analytics charts readable
- [ ] Equity curve full width

### Tablet (768x1024)
- [ ] Cards stack appropriately
- [ ] Charts remain readable
- [ ] Buttons accessible
- [ ] No horizontal scroll

### Mobile (375x667)
- [ ] All text readable
- [ ] Forms usable
- [ ] Charts display (may be compressed)
- [ ] Buttons not overlapping

---

## 🎨 UI/UX Quality Checks

### Visual Consistency
- [ ] Colors match theme (green=positive, red=negative)
- [ ] Icons used consistently
- [ ] Spacing uniform
- [ ] Font sizes appropriate

### Accessibility
- [ ] Tooltips explain technical terms
- [ ] Help text for complex fields
- [ ] Error messages clear
- [ ] Success confirmations visible

### User Feedback
- [ ] Loading spinners during API calls
- [ ] Success toasts after updates
- [ ] Error alerts when issues occur
- [ ] Disabled buttons while processing

---

## 🔐 Security Testing

### Authorization
- [ ] Log out
- [ ] Try to access `/api/users/me/account-value` directly
- [ ] Verify 401 Unauthorized
- [ ] Log in as different user
- [ ] Verify can only see own account value

### Data Validation
- [ ] Try extremely large starting balance: $999,999,999,999
- [ ] Verify handled gracefully
- [ ] Try special characters in transaction description
- [ ] Verify sanitized/escaped properly

---

## ⚡ Performance Testing

### Load Times
- [ ] Navigate to Dashboard
- [ ] Open DevTools → Performance tab
- [ ] Record load time for account value fetch
- [ ] Should be < 500ms for cached value
- [ ] Should be < 2s for fresh calculation

### Cache Efficiency
- [ ] Load Dashboard (cache miss - slow)
- [ ] Reload Dashboard (cache hit - fast)
- [ ] Wait 5 minutes (cache TTL expires)
- [ ] Reload Dashboard (cache miss again)
- [ ] Verify cache TTL working as expected

### Large Dataset Performance
- [ ] Import 1000+ trades (if possible)
- [ ] Load equity curve
- [ ] Verify renders without lag
- [ ] Check for any performance warnings in console

---

## 🐛 Known Issues Check

### Fixed Issues (Should NOT occur)
- [ ] ~~500 error on login~~ - FIXED
- [ ] ~~account_value_at_entry column errors~~ - REMOVED
- [ ] ~~Manual balance overwriting calculated value~~ - REMOVED

### Monitor For New Issues
- [ ] Any console errors?
- [ ] Any TypeScript type errors?
- [ ] Any React warnings?
- [ ] Any accessibility warnings?

---

## ✅ Final Verification

### Pre-Production Checklist
- [ ] All features tested and working
- [ ] No console errors
- [ ] No broken UI elements
- [ ] Responsive on all screen sizes
- [ ] Account value calculations verified accurate
- [ ] Trading Growth vs Total Growth working correctly
- [ ] Cache invalidation working
- [ ] API endpoints responding correctly

### Production Readiness
- [ ] Backend deployed with Phase 2.2 + 2.3 changes
- [ ] Frontend deployed with all 3 pages updated
- [ ] Migration script ready (but not run yet)
- [ ] Rollback plan documented
- [ ] Monitoring set up for new endpoints

---

## 📊 Test Results Summary

**Tester:** _________________  
**Date:** _________________  
**Environment:** _________________

### Pass/Fail Summary
- Settings Page: ☐ PASS ☐ FAIL
- Dashboard: ☐ PASS ☐ FAIL  
- Analytics: ☐ PASS ☐ FAIL
- Equity Curve: ☐ PASS ☐ FAIL
- Integration: ☐ PASS ☐ FAIL
- Edge Cases: ☐ PASS ☐ FAIL
- Performance: ☐ PASS ☐ FAIL

### Critical Issues Found
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Minor Issues Found
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Recommendations
_________________________________________________
_________________________________________________
_________________________________________________

**Overall Assessment:** ☐ Ready for Production ☐ Needs Work

---

## 🔗 Related Documentation
- [PHASE_2.2_2.3_STATUS.md](./PHASE_2.2_2.3_STATUS.md) - Implementation status
- [API_ROUTES.md](./API_ROUTES.md) - API endpoint documentation
- [ARCHITECTURE_DIAGRAM.md](./ARCHITECTURE_DIAGRAM.md) - System architecture

---

**Last Updated:** December 2, 2025  
**Version:** 1.0
