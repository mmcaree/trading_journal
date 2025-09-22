#!/usr/bin/env python3
"""
Migration: Add original_shares column to trade_entries table
This stores the original shares amount at entry creation time for accurate Original Risk % calculation
"""

import sqlite3
import os
import sys

def run_migration():
    # Get the database path
    db_path = os.path.join(os.path.dirname(__file__), '..', 'app.db')
    
    print(f"Running migration: Add original_shares column to trade_entries")
    print(f"Database path: {db_path}")
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(trade_entries)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'original_shares' not in columns:
            print("Adding original_shares column...")
            
            # Add the original_shares column
            cursor.execute("""
                ALTER TABLE trade_entries 
                ADD COLUMN original_shares INTEGER
            """)
            
            # Update existing records to set original_shares = shares (for existing data)
            cursor.execute("""
                UPDATE trade_entries 
                SET original_shares = shares 
                WHERE original_shares IS NULL
            """)
            
            conn.commit()
            print("✅ Successfully added original_shares column and populated existing records")
        else:
            print("✅ original_shares column already exists")
        
        # Verify the change
        cursor.execute("PRAGMA table_info(trade_entries)")
        columns = [column[1] for column in cursor.fetchall()]
        print(f"Current trade_entries columns: {columns}")
        
        conn.close()
        print("Migration completed successfully!")
        
    except Exception as e:
        print(f"❌ Error running migration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_migration()