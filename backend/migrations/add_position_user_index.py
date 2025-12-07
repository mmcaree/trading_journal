"""
Add composite index for calendar query optimization - position_id + event_date lookup
This helps with the JOIN between trading_positions and trading_position_events

Run with: python migrations/add_position_user_index.py
For production: python migrations/add_position_user_index.py --production
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text, inspect
from app.core.config import settings

def add_index(production=False):
    """Add composite index for position_id + event_date"""
    
    if production:
        # Use Railway DATABASE_URL from environment
        database_url = os.getenv('DATABASE_URL')
        if not database_url:
            print("❌ DATABASE_URL environment variable not set")
            return
        print(f"🚀 Connecting to PRODUCTION database...")
    else:
        # Use local database
        database_url = settings.DATABASE_URL
        print(f"🏠 Connecting to LOCAL database: {database_url}")
    
    engine = create_engine(database_url)
    
    # Detect database type
    is_postgres = 'postgresql' in database_url
    
    index_name = 'ix_events_position_date'
    
    with engine.connect() as conn:
        # Check if index already exists
        inspector = inspect(engine)
        existing_indexes = [idx['name'] for idx in inspector.get_indexes('trading_position_events')]
        
        if index_name in existing_indexes:
            print(f"ℹ️  Index '{index_name}' already exists, skipping...")
            return
        
        # Create index
        print(f"📊 Creating composite index: {index_name}")
        print(f"   Columns: position_id, event_date")
        print(f"   Purpose: Optimize JOIN performance for calendar queries")
        
        if is_postgres:
            create_index_sql = f"""
                CREATE INDEX IF NOT EXISTS {index_name} 
                ON trading_position_events (position_id, event_date)
            """
        else:
            create_index_sql = f"""
                CREATE INDEX IF NOT EXISTS {index_name} 
                ON trading_position_events (position_id, event_date)
            """
        
        conn.execute(text(create_index_sql))
        conn.commit()
        
        print(f"✓ Index created successfully!")
        print(f"\n📈 Performance impact:")
        print(f"   - Faster JOINs between positions and events")
        print(f"   - Faster filtering by date within a position")
        print(f"   - Expected speedup: 2-5x for calendar queries")

if __name__ == "__main__":
    production = '--production' in sys.argv
    
    if production:
        confirm = input("⚠️  You are about to modify the PRODUCTION database. Continue? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Cancelled.")
            sys.exit(0)
    
    add_index(production)
