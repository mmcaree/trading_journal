#!/usr/bin/env python3
"""
Initialize database with all tables including import functionality
"""

import sys
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.append(str(backend_dir))

from app.models.models import Base
from app.models import import_models  # Import to register the models
from app.db.session import engine
from app.core.config import settings

def initialize_database():
    """Create all tables"""
    
    print(f"Initializing database with URL: {settings.DATABASE_URL}")
    
    try:
        # Create all tables
        Base.metadata.create_all(bind=engine)
        print("✅ Successfully created all database tables")
        
        # List created tables
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        print(f"Created tables: {tables}")
        
        # Check trades table columns
        if 'trades' in tables:
            columns = [col['name'] for col in inspector.get_columns('trades')]
            print(f"Trades table columns: {columns}")
            
            if 'imported_order_id' in columns:
                print("✅ imported_order_id column exists in trades table")
            else:
                print("❌ imported_order_id column missing from trades table")
        
    except Exception as e:
        print(f"❌ Failed to initialize database: {e}")
        raise

if __name__ == "__main__":
    initialize_database()