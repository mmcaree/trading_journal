#!/usr/bin/env python3
"""
Backfill account_value_at_entry for existing positions (Phase 2.2).

This script calculates the historical account value at the time each position
was opened using the AccountValueService.

Run: python backend/scripts/backfill_account_value_at_entry.py
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.session import SessionLocal
from app.models.position_models import TradingPosition, User
from app.services.account_value_service import AccountValueService


def backfill_account_values():
    """Backfill account_value_at_entry for all positions"""
    db = SessionLocal()
    account_value_service = AccountValueService(db)
    
    try:
        # Get all positions without account_value_at_entry
        positions = db.query(TradingPosition).filter(
            TradingPosition.account_value_at_entry.is_(None),
            TradingPosition.opened_at.isnot(None)
        ).all()
        
        print(f"📊 Found {len(positions)} positions to backfill")
        print("="*60)
        
        if len(positions) == 0:
            print("✅ No positions need backfilling!")
            return
        
        updated = 0
        errors = 0
        
        for position in positions:
            try:
                # Calculate account value at position open time
                account_value = account_value_service.get_account_value_at_date(
                    user_id=position.user_id,
                    target_date=position.opened_at
                )
                
                position.account_value_at_entry = account_value
                
                # Recalculate risk percent if we have stop loss data
                if position.current_stop_loss and position.avg_entry_price and account_value > 0:
                    max_loss_per_share = abs(position.avg_entry_price - position.current_stop_loss)
                    max_loss_amount = max_loss_per_share * position.current_shares
                    position.current_risk_percent = (max_loss_amount / account_value) * 100
                
                updated += 1
                
                if updated % 10 == 0:
                    print(f"  ✓ Updated {updated} positions...")
                    db.commit()
                
            except Exception as e:
                errors += 1
                print(f"  ✗ Error updating position {position.id} ({position.ticker}): {e}")
                continue
        
        # Final commit
        db.commit()
        
        print("="*60)
        print(f"✅ Successfully updated {updated} positions")
        if errors > 0:
            print(f"⚠️  {errors} positions had errors")
        
        # Show sample of updated positions
        print("\n📋 Sample of updated positions:")
        print("-" * 60)
        sample = db.query(TradingPosition).filter(
            TradingPosition.account_value_at_entry.isnot(None)
        ).limit(5).all()
        
        for pos in sample:
            print(f"  {pos.ticker:10} Opened: {pos.opened_at.date()}  "
                  f"Account Value: ${pos.account_value_at_entry:,.2f}  "
                  f"Risk: {pos.current_risk_percent or 0:.2f}%")
        
    except Exception as e:
        print(f"\n❌ Backfill failed: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    print("╔════════════════════════════════════════════════════════════╗")
    print("║  Backfill Account Value at Entry (Phase 2.2)              ║")
    print("╚════════════════════════════════════════════════════════════╝")
    print()
    print("This will calculate account_value_at_entry for all positions")
    print("based on their opened_at date using dynamic calculation.")
    print()
    
    response = input("Continue? (yes/no): ")
    if response.lower() == 'yes':
        backfill_account_values()
    else:
        print("❌ Cancelled")
