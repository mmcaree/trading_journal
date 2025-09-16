#!/usr/bin/env python3
"""
Migration: Add trade_group_id to trades table
Purpose: Group related trade events (entries, adds, sells) into logical trading positions
"""

import sys
import os
import uuid
from datetime import datetime

# Add the backend directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.db.session import SessionLocal, engine
from app.models.models import Base, Trade

def run_migration():
    """Add trade_group_id column and populate it for existing trades"""
    print("🚀 Starting trade_groups migration...")
    
    db = SessionLocal()
    
    try:
        # Check if column already exists (SQLite version)
        result = db.execute(text("""
            PRAGMA table_info(trades)
        """))
        
        columns = [row[1] for row in result.fetchall()]  # Column names are in index 1
        
        if 'trade_group_id' in columns:
            print("✅ trade_group_id column already exists")
        else:
            # Add the trade_group_id column
            print("📋 Adding trade_group_id column to trades table...")
            db.execute(text("""
                ALTER TABLE trades 
                ADD COLUMN trade_group_id VARCHAR
            """))
            
            # Create index for trade_group_id
            db.execute(text("""
                CREATE INDEX ix_trades_trade_group_id 
                ON trades (trade_group_id)
            """))
            
            print("✅ trade_group_id column and index created")
        
        # Populate trade_group_id for existing trades
        print("📊 Assigning trade group IDs to existing trades...")
        
        # Get all trades without trade_group_id
        trades_without_group = db.execute(text("""
            SELECT id, ticker, user_id, entry_date, trade_type
            FROM trades 
            WHERE trade_group_id IS NULL 
            ORDER BY user_id, ticker, entry_date
        """)).fetchall()
        
        grouped_trades = 0
        for trade in trades_without_group:
            # Generate a unique trade group ID
            trade_group_id = f"tg_{str(uuid.uuid4()).replace('-', '')[:12]}"
            
            # Update the trade with the new group ID
            db.execute(text("""
                UPDATE trades 
                SET trade_group_id = :trade_group_id 
                WHERE id = :trade_id
            """), {
                'trade_group_id': trade_group_id,
                'trade_id': trade.id
            })
            
            grouped_trades += 1
        
        print(f"✅ Successfully assigned group IDs to {grouped_trades} trades")
        
        # Verify the migration
        total_groups = db.execute(text("""
            SELECT COUNT(DISTINCT trade_group_id) 
            FROM trades 
            WHERE trade_group_id IS NOT NULL
        """)).scalar()
        
        total_trades = db.execute(text("""
            SELECT COUNT(*) 
            FROM trades
        """)).scalar()
        
        print(f"📈 Total trade groups in database: {total_groups}")
        print(f"📈 Total trades in database: {total_trades}")
        
        # Commit all changes
        db.commit()
        print("🎉 Migration completed successfully!")
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        db.rollback()
        return False
        
    finally:
        db.close()

def rollback_migration():
    """Remove trade_group_id column (rollback)"""
    print("🔄 Rolling back trade_groups migration...")
    
    db = SessionLocal()
    
    try:
        # Drop the index first
        db.execute(text("""
            DROP INDEX IF EXISTS ix_trades_trade_group_id
        """))
        
        # Remove the column
        db.execute(text("""
            ALTER TABLE trades 
            DROP COLUMN IF EXISTS trade_group_id
        """))
        
        db.commit()
        print("✅ Rollback completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Rollback failed: {str(e)}")
        db.rollback()
        return False
        
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback_migration()
    else:
        run_migration()