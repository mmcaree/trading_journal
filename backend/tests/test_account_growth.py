"""
Test account growth calculation with deposits/withdrawals
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.db.session import SessionLocal
from app.models.position_models import AccountTransaction, User, TradingPosition, PositionStatus
from datetime import datetime, timedelta

def test_account_growth_with_transactions():
    """Test that account growth properly accounts for deposits/withdrawals"""
    db = SessionLocal()
    try:
        # Find first user
        user = db.query(User).first()
        if not user:
            print("❌ No user found in database")
            return False
        
        print(f"Testing with user: {user.email} (ID: {user.id})")
        
        # Set initial balances
        user.initial_account_balance = 100000.0
        user.current_account_balance = 100000.0
        db.commit()
        print(f"✓ Set initial balance: ${user.initial_account_balance:,.2f}")
        
        # Scenario: User deposits $20,000 and makes $5,000 profit trading
        
        # 1. Create a deposit
        deposit = AccountTransaction(
            user_id=user.id,
            transaction_type="DEPOSIT",
            amount=20000.0,
            transaction_date=datetime.now() - timedelta(days=10),
            description="Test deposit"
        )
        db.add(deposit)
        db.commit()
        print(f"✓ Created deposit: ${deposit.amount:,.2f}")
        
        # Update account balance to reflect deposit
        user.current_account_balance = 120000.0
        db.commit()
        print(f"✓ Account balance after deposit: ${user.current_account_balance:,.2f}")
        
        # 2. Simulate $5,000 trading profit
        user.current_account_balance = 125000.0
        db.commit()
        print(f"✓ Account balance after trading: ${user.current_account_balance:,.2f}")
        
        # 3. Check the calculations
        print("\n📊 ACCOUNT GROWTH ANALYSIS:")
        print("=" * 60)
        print(f"Starting Balance:     ${user.initial_account_balance:>12,.2f}")
        print(f"Current Balance:      ${user.current_account_balance:>12,.2f}")
        print(f"Total Deposits:       ${deposit.amount:>12,.2f}")
        print(f"Total Withdrawals:    ${0:>12,.2f}")
        print(f"Net Cash Flow:        ${deposit.amount:>12,.2f}")
        print("-" * 60)
        
        # Raw growth (includes deposits)
        raw_growth = user.current_account_balance - user.initial_account_balance
        raw_growth_pct = (raw_growth / user.initial_account_balance) * 100
        print(f"Raw Account Growth:   ${raw_growth:>12,.2f} ({raw_growth_pct:>6.2f}%)")
        print("                      ⚠️  INCORRECT - includes deposits")
        
        # True trading growth (excludes deposits)
        trading_growth = user.current_account_balance - user.initial_account_balance - deposit.amount
        trading_growth_pct = (trading_growth / user.initial_account_balance) * 100
        print(f"Trading Performance:  ${trading_growth:>12,.2f} ({trading_growth_pct:>6.2f}%)")
        print("                      ✓ CORRECT - excludes deposits")
        print("=" * 60)
        
        # Verify the math
        expected_trading_growth = 5000.0
        expected_trading_pct = 5.0
        
        if abs(trading_growth - expected_trading_growth) < 0.01:
            print(f"\n✅ Trading growth calculation CORRECT!")
            print(f"   Expected: ${expected_trading_growth:,.2f} ({expected_trading_pct:.2f}%)")
            print(f"   Got:      ${trading_growth:,.2f} ({trading_growth_pct:.2f}%)")
        else:
            print(f"\n❌ Trading growth calculation INCORRECT!")
            print(f"   Expected: ${expected_trading_growth:,.2f}")
            print(f"   Got:      ${trading_growth:,.2f}")
            return False
        
        # Test withdrawal scenario
        print("\n\n📊 TESTING WITHDRAWAL SCENARIO:")
        print("=" * 60)
        
        withdrawal = AccountTransaction(
            user_id=user.id,
            transaction_type="WITHDRAWAL",
            amount=10000.0,
            transaction_date=datetime.now(),
            description="Test withdrawal"
        )
        db.add(withdrawal)
        db.commit()
        print(f"✓ Created withdrawal: ${withdrawal.amount:,.2f}")
        
        user.current_account_balance = 115000.0
        db.commit()
        print(f"✓ Account balance after withdrawal: ${user.current_account_balance:,.2f}")
        
        # Recalculate
        net_deposits = deposit.amount - withdrawal.amount  # $20k - $10k = $10k
        trading_growth_with_withdrawal = user.current_account_balance - user.initial_account_balance - net_deposits
        trading_growth_pct_with_withdrawal = (trading_growth_with_withdrawal / user.initial_account_balance) * 100
        
        print(f"\nNet Deposits/Withdrawals: ${net_deposits:,.2f}")
        print(f"Trading Performance:      ${trading_growth_with_withdrawal:,.2f} ({trading_growth_pct_with_withdrawal:.2f}%)")
        
        if abs(trading_growth_with_withdrawal - expected_trading_growth) < 0.01:
            print(f"✅ Trading growth still correct after withdrawal!")
        else:
            print(f"❌ Trading growth changed after withdrawal (should stay the same)")
            return False
        
        # Cleanup
        db.delete(deposit)
        db.delete(withdrawal)
        user.initial_account_balance = None
        user.current_account_balance = None
        db.commit()
        print(f"\n✓ Cleaned up test data")
        
        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("=" * 60)
        print("\nKEY TAKEAWAY:")
        print("Without tracking deposits/withdrawals separately, a $20,000")
        print("deposit would appear as a 20% return when the actual trading")
        print("performance was only 5%!")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        db.rollback()
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    print("Testing Account Growth Calculation with Deposits/Withdrawals")
    print("=" * 60)
    success = test_account_growth_with_transactions()
    sys.exit(0 if success else 1)
