#!/usr/bin/env python3
"""
Database migration to add timezone field to users table
"""

import sys
import os

# Add the backend directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.db.session import get_db


def add_timezone_column():
    """Add timezone column to users table"""
    db = next(get_db())
    
    try:
        # Add timezone column with default value
        db.execute(text("""
            ALTER TABLE users ADD COLUMN timezone VARCHAR DEFAULT 'America/New_York';
        """))
        
        db.commit()
        print("Successfully added timezone column to users table")
        
    except Exception as e:
        db.rollback()
        print(f"Error adding timezone column: {str(e)}")
        if "duplicate column name" in str(e).lower() or "already exists" in str(e).lower():
            print("Timezone column already exists, skipping migration")
        else:
            raise
    finally:
        db.close()


if __name__ == "__main__":
    add_timezone_column()