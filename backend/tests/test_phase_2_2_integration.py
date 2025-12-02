#!/usr/bin/env python3
"""
Phase 2.2 Integration Test - Verify Service Integration

Tests that AccountValueService properly integrates with:
- PositionService
- AnalyticsService
- Import Services
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.session import SessionLocal
from app.models.position_models import User, TradingPosition
from app.services.account_value_service import AccountValueService
from app.services.position_service import PositionService
from app.services.analytics_service import get_account_growth_metrics
from datetime import datetime


def test_position_service_integration():
    """Test PositionService can calculate account value at entry"""
    print("\n📊 Testing PositionService Integration...")
    print("-" * 60)
    
    db = SessionLocal()
    try:
        # Get a user with positions
        user = db.query(User).first()
        if not user:
            print("⚠️  No users found in database")
            return False
        
        position_service = PositionService(db)
        
        # Verify AccountValueService is initialized
        assert hasattr(position_service, 'account_value_service'), "Missing account_value_service"
        assert position_service.account_value_service is not None, "account_value_service is None"
        
        print(f"✅ PositionService has AccountValueService")
        
        # Test calculate_account_value_at_entry method exists
        assert hasattr(position_service, 'calculate_account_value_at_entry'), "Missing method"
        assert hasattr(position_service, 'update_position_risk_metrics'), "Missing method"
        
        print(f"✅ PositionService has new methods")
        
        # Get a position to test with
        position = db.query(TradingPosition).filter(
            TradingPosition.user_id == user.id,
            TradingPosition.opened_at.isnot(None)
        ).first()
        
        if position:
            # Test method works
            account_value = position_service.calculate_account_value_at_entry(user.id, position)
            print(f"✅ calculate_account_value_at_entry returned: ${account_value:,.2f}")
            assert account_value > 0, "Account value should be positive"
        else:
            print(f"⚠️  No positions found for user {user.id}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


def test_analytics_service_integration():
    """Test AnalyticsService functions work"""
    print("\n📈 Testing AnalyticsService Integration...")
    print("-" * 60)
    
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if not user:
            print("⚠️  No users found in database")
            return False
        
        # Test get_account_growth_metrics
        metrics = get_account_growth_metrics(db=db, user_id=user.id)
        
        print(f"✅ get_account_growth_metrics returned data")
        print(f"   Current Value: ${metrics.get('current_value', 0):,.2f}")
        print(f"   Starting Balance: ${metrics.get('starting_balance', 0):,.2f}")
        print(f"   Trading Growth: {metrics.get('trading_growth_percent', 0):.2f}%")
        print(f"   Total Growth: {metrics.get('total_growth_percent', 0):.2f}%")
        
        # Verify keys exist
        required_keys = [
            'current_value', 'starting_balance', 'realized_pnl',
            'trading_growth_percent', 'total_growth_percent',
            'deposits_total', 'withdrawals_total'
        ]
        
        for key in required_keys:
            assert key in metrics, f"Missing key: {key}"
        
        print(f"✅ All required keys present")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


def test_import_service_integration():
    """Test import services have AccountValueService"""
    print("\n📥 Testing Import Service Integration...")
    print("-" * 60)
    
    db = SessionLocal()
    try:
        from app.services.import_service import IndividualPositionImportService
        from app.services.universal_import_service import UniversalImportService
        
        # Test IndividualPositionImportService
        import_service = IndividualPositionImportService(db)
        assert hasattr(import_service, 'account_value_service'), "Missing account_value_service"
        assert import_service.account_value_service is not None, "account_value_service is None"
        print(f"✅ IndividualPositionImportService has AccountValueService")
        
        # Test UniversalImportService
        universal_service = UniversalImportService(db)
        assert hasattr(universal_service, 'account_value_service'), "Missing account_value_service"
        assert universal_service.account_value_service is not None, "account_value_service is None"
        print(f"✅ UniversalImportService has AccountValueService")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


def test_database_column_exists():
    """Test account_value_at_entry column exists"""
    print("\n🗄️  Testing Database Schema...")
    print("-" * 60)
    
    db = SessionLocal()
    try:
        # Query a position and check for column
        position = db.query(TradingPosition).first()
        if position:
            assert hasattr(position, 'account_value_at_entry'), "Missing column"
            print(f"✅ account_value_at_entry column exists")
            print(f"   Sample value: {position.account_value_at_entry}")
        else:
            print(f"⚠️  No positions in database to test")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    finally:
        db.close()


if __name__ == "__main__":
    print("╔════════════════════════════════════════════════════════════╗")
    print("║         Phase 2.2 Integration Test Suite                  ║")
    print("╚════════════════════════════════════════════════════════════╝")
    
    results = {
        "Database Schema": test_database_column_exists(),
        "PositionService Integration": test_position_service_integration(),
        "AnalyticsService Integration": test_analytics_service_integration(),
        "Import Service Integration": test_import_service_integration(),
    }
    
    print("\n" + "="*60)
    print("RESULTS SUMMARY")
    print("="*60)
    
    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{test_name:40} {status}")
    
    print("="*60)
    
    all_passed = all(results.values())
    if all_passed:
        print("\n✅ ALL TESTS PASSED - Phase 2.2 integration verified!")
        sys.exit(0)
    else:
        print("\n❌ SOME TESTS FAILED - Review errors above")
        sys.exit(1)
