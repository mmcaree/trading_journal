# Integration Tests - Quick Start Guide

## Running All Integration Tests

```powershell
# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Run all integration tests with verbose output
pytest tests/test_api_auth.py tests/test_api_positions.py tests/test_analytics.py -v

# Run with coverage report
pytest tests/test_api_auth.py tests/test_api_positions.py tests/test_analytics.py --cov=app --cov-report=term --cov-report=html

# Run specific test file
pytest tests/test_api_auth.py -v

# Run specific test
pytest tests/test_api_auth.py::test_register_user_success -v

# Run tests matching pattern
pytest -k "auth" -v

# Run with detailed output on failures
pytest -v --tb=long

# Run in parallel (requires pytest-xdist)
pytest -n auto
```

## Test Summary

### ✅ Passing Tests: 52/59

#### Authentication Tests (7/7 passing)
- ✅ User registration with validation
- ✅ Duplicate username/email prevention
- ✅ Login with correct/wrong credentials
- ✅ Protected route authentication
- ✅ Password reset email security

#### Position Management Tests (29/29 passing)
- ✅ Position CRUD operations
- ✅ Event management (buy/sell)
- ✅ Journal entries
- ✅ Filtering and pagination
- ✅ User isolation and permissions
- ✅ Data validation
- ✅ Full position lifecycle

#### Analytics Tests (16/23 passing, 7 skipped)
- ✅ Advanced analytics metrics
- ✅ Performance tracking
- ✅ Date range filtering
- ✅ User isolation
- ✅ Debug endpoints
- ✅ Error handling
- ⏭️ 7 tests skipped (deprecated endpoints)

## Test Coverage: 51%

### High Coverage (>75%)
- ✅ Models: 100%
- ✅ Schemas: 100%
- ✅ Analytics: 88-91%
- ✅ Auth: 80%
- ✅ Position Service: 76%

### Low Coverage (<30%)
- 🔴 Import Service: 11% ⚠️ NEEDS TESTS
- 🔴 Universal Import: 10% ⚠️ NEEDS TESTS
- 🔴 User Service: 33%
- 🔴 Email Service: 33%
- 🔴 Validators: 15%

## Viewing Coverage Report

After running tests with coverage:
```powershell
# Open HTML coverage report
.\htmlcov\index.html
```

## Test Files

- `test_api_auth.py` - Authentication endpoints
- `test_api_positions.py` - Position management endpoints
- `test_analytics.py` - Analytics endpoints
- `conftest.py` - Test configuration and fixtures

## Known Issues

### Fixed
- ✅ Test database cleanup on Windows (PermissionError)

### Skipped Tests
- ⏭️ 3 tests for deprecated `/api/analytics/performance` endpoint
- ⏭️ 4 tests for unimplemented `/api/analytics/setups` endpoint

## Next Steps

1. 🔴 **Critical**: Add import API tests (currently 11% coverage)
2. 🟡 Add user management tests
3. 🟡 Add tags/images tests
4. 🟡 Increase positions_v2.py coverage to 80%+
5. 🟢 Set up CI/CD with coverage requirements

## Detailed Review

See `INTEGRATION_TESTS_REVIEW.md` for comprehensive code review and recommendations.
