#!/usr/bin/env python3
"""
Add default_account_size column to users table
"""

import os
import sys
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.append(str(backend_dir))

def add_default_account_size_column():
    """Add default_account_size column to users table"""
    
    from sqlalchemy import text
    from app.db.session import engine
    
    print("🔄 Adding default_account_size column to users table...")
    
    try:
        with engine.connect() as connection:
            # Check if column already exists
            result = connection.execute(text("PRAGMA table_info(users)"))
            columns = [row[1] for row in result.fetchall()]
            
            if 'default_account_size' in columns:
                print("✅ default_account_size column already exists")
                return True
            
            # Add the column
            connection.execute(text("ALTER TABLE users ADD COLUMN default_account_size FLOAT"))
            connection.commit()
            
            print("✅ Successfully added default_account_size column")
            return True
            
    except Exception as e:
        print(f"❌ Failed to add default_account_size column: {e}")
        return False

if __name__ == "__main__":
    success = add_default_account_size_column()
    if success:
        print("\n🎉 Migration completed successfully!")
    else:
        print("\n❌ Migration failed.")