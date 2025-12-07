"""
Add original_stop_loss to trading_position_events table.

This field preserves the original stop loss at time of entry for accurate Original Risk calculations,
while stop_loss can be updated as the position is managed.

Usage:
    python migrations/add_original_stop_loss.py
"""

import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.db.session import engine

def upgrade():
    """Add original_stop_loss column to trading_position_events"""
    with engine.connect() as conn:
        # Add the column
        print("Adding original_stop_loss column to trading_position_events...")
        conn.execute(text("""
            ALTER TABLE trading_position_events 
            ADD COLUMN original_stop_loss FLOAT NULL
        """))
        
        # Backfill: Set original_stop_loss = stop_loss for existing events
        # This preserves historical data - the current stop_loss becomes the original
        print("Backfilling original_stop_loss with existing stop_loss values...")
        conn.execute(text("""
            UPDATE trading_position_events 
            SET original_stop_loss = stop_loss 
            WHERE stop_loss IS NOT NULL
        """))
        
        conn.commit()
        print("✅ Migration completed successfully!")
        print("   - Added original_stop_loss column")
        print("   - Backfilled existing stop_loss values")

def downgrade():
    """Remove original_stop_loss column"""
    with engine.connect() as conn:
        print("Removing original_stop_loss column from trading_position_events...")
        conn.execute(text("""
            ALTER TABLE trading_position_events 
            DROP COLUMN original_stop_loss
        """))
        conn.commit()
        print("✅ Rollback completed!")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Add original_stop_loss column migration")
    parser.add_argument('--downgrade', action='store_true', help='Rollback the migration')
    args = parser.parse_args()
    
    if args.downgrade:
        downgrade()
    else:
        upgrade()
