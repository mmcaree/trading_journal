"""
Quick test script to verify account transactions API functionality
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.db.session import SessionLocal
from app.models.position_models import AccountTransaction, User
from datetime import datetime

def test_transaction_model():
    """Test that we can create and query account transactions"""
    db = SessionLocal()
    try:
        # Find first user
        user = db.query(User).first()
        if not user:
            print("No user found in database. Please create a user first.")
            return False
        
        print(f"Testing with user: {user.email} (ID: {user.id})")
        print(f"Initial account balance: ${user.current_account_balance}")
        
        # Create a test deposit
        deposit = AccountTransaction(
            user_id=user.id,
            transaction_type="DEPOSIT",
            amount=5000.0,
            transaction_date=datetime.now(),
            description="Test deposit"
        )
        db.add(deposit)
        db.commit()
        db.refresh(deposit)
        print(f"\n✓ Created deposit transaction ID: {deposit.id}")
        
        # Query transactions
        transactions = db.query(AccountTransaction).filter(
            AccountTransaction.user_id == user.id
        ).all()
        print(f"✓ Found {len(transactions)} transaction(s) for user")
        
        for txn in transactions:
            print(f"  - {txn.transaction_type}: ${txn.amount} on {txn.transaction_date}")
        
        # Clean up test transaction
        db.delete(deposit)
        db.commit()
        print(f"\n✓ Cleaned up test transaction")
        
        print("\n✅ Account transactions model working correctly!")
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
    print("Testing Account Transactions Model...")
    print("=" * 50)
    success = test_transaction_model()
    sys.exit(0 if success else 1)
