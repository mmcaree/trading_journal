#!/usr/bin/env python3
"""
Database migration: Add imported_order_id column to trades table
"""

import sqlite3
import sys
from pathlib import Path

def add_imported_order_id_column():
    """Add imported_order_id column to trades table"""
    
    backend_dir = Path(__file__).parent
    db_path = backend_dir / "trade_journal.db"
    
    print(f"Adding imported_order_id column to trades table at: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if trades table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='trades'")
        trades_exists = cursor.fetchone() is not None
        
        if not trades_exists:
            print("❌ Trades table doesn't exist yet")
            return
        
        # Check if imported_order_id column already exists
        cursor.execute("PRAGMA table_info(trades)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'imported_order_id' in columns:
            print("✅ imported_order_id column already exists in trades table")
            return
        
        # Add the column
        cursor.execute("""
            ALTER TABLE trades 
            ADD COLUMN imported_order_id INTEGER 
            REFERENCES imported_orders(id) ON DELETE SET NULL
        """)
        
        conn.commit()
        print("✅ Successfully added imported_order_id column to trades table")
        
        # Verify the column was added
        cursor.execute("PRAGMA table_info(trades)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'imported_order_id' in columns:
            print("✅ Verified: imported_order_id column exists in trades table")
        else:
            print("❌ Error: imported_order_id column not found after adding")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Migration failed: {e}")
        raise
        
    finally:
        conn.close()

if __name__ == "__main__":
    add_imported_order_id_column()