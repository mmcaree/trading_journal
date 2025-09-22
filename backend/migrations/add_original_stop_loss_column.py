"""
Database migration: Add original_stop_loss column to trade_entries table
"""
import sqlite3
import sys
import os

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def migrate_db():
    """Add original_stop_loss column to trade_entries table"""
    
    db_path = os.path.join(os.path.dirname(__file__), '..', 'app.db')
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(trade_entries)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'original_stop_loss' in columns:
            print("Column 'original_stop_loss' already exists in trade_entries table")
            conn.close()
            return True
        
        # Add the original_stop_loss column
        cursor.execute("""
            ALTER TABLE trade_entries 
            ADD COLUMN original_stop_loss REAL
        """)
        
        # For existing entries, set original_stop_loss to current stop_loss 
        # (best estimate we have for historical data)
        cursor.execute("""
            UPDATE trade_entries 
            SET original_stop_loss = stop_loss 
            WHERE original_stop_loss IS NULL
        """)
        
        conn.commit()
        print("Successfully added 'original_stop_loss' column to trade_entries table")
        print("Set original_stop_loss = stop_loss for existing entries")
        
        # Show affected rows
        cursor.execute("SELECT COUNT(*) FROM trade_entries WHERE original_stop_loss IS NOT NULL")
        count = cursor.fetchone()[0]
        print(f"Updated {count} existing trade entries")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"Error during migration: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        return False

if __name__ == "__main__":
    success = migrate_db()
    if success:
        print("Migration completed successfully!")
    else:
        print("Migration failed!")
        sys.exit(1)