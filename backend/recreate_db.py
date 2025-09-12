#!/usr/bin/env python3
"""
Recreate database with all tables and columns
"""

import os
import sys
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.append(str(backend_dir))

def recreate_database():
    """Remove old database and create new one with all tables"""
    
    # Database file paths to check
    db_files = [
        "app.db",
        "trade_journal.db",
        "../trade_journal.db"
    ]
    
    print("🔄 Recreating database...")
    
    # Remove existing database files
    for db_file in db_files:
        db_path = Path(db_file)
        if db_path.exists():
            try:
                os.remove(db_path)
                print(f"✅ Removed old database: {db_path}")
            except OSError as e:
                print(f"❌ Could not remove {db_path}: {e}")
                print("Please stop the FastAPI server and run this script again")
                return False
    
    # Import and create tables
    try:
        from app.models.models import Base
        from app.models import import_models  # Import to register the models
        from app.db.session import engine
        from app.core.config import settings
        
        print(f"📊 Creating database at: {settings.DATABASE_URL}")
        
        # Create all tables
        Base.metadata.create_all(bind=engine)
        print("✅ Successfully created all database tables")
        
        # Verify tables
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        print(f"📋 Created tables: {tables}")
        
        # Check trades table columns
        if 'trades' in tables:
            columns = [col['name'] for col in inspector.get_columns('trades')]
            print(f"🔍 Trades table columns: {len(columns)} columns")
            
            if 'imported_order_id' in columns:
                print("✅ imported_order_id column exists in trades table")
                return True
            else:
                print("❌ imported_order_id column missing from trades table")
                return False
        else:
            print("❌ Trades table not created")
            return False
            
    except Exception as e:
        print(f"❌ Failed to recreate database: {e}")
        return False

if __name__ == "__main__":
    success = recreate_database()
    if success:
        print("\n🎉 Database recreated successfully!")
        print("You can now restart the FastAPI server and try the import again.")
    else:
        print("\n❌ Database recreation failed.")
        print("Please check the errors above and try again.")