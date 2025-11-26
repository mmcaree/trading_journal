"""
Run database migration for position tagging system
"""
import sqlite3
import sys
from pathlib import Path

def run_migration():
    # Get database path from environment or use default
    import os
    db_url = os.getenv('DATABASE_URL', 'sqlite:///./app.db')
    
    if db_url.startswith('sqlite:///'):
        db_path = db_url.replace('sqlite:///', '')
    else:
        print("❌ This script only supports SQLite databases")
        print(f"Found: {db_url}")
        sys.exit(1)
    
    if not Path(db_path).exists():
        print(f"❌ Database not found: {db_path}")
        sys.exit(1)
    
    print(f"📦 Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Read migration SQL
        migration_path = Path(__file__).parent / 'migrations' / 'add_position_tags.sql'
        with open(migration_path, 'r') as f:
            sql = f.read()
        
        print("🚀 Running migration: Add Position Tagging System")
        
        # Execute migration
        cursor.executescript(sql)
        conn.commit()
        
        # Verify tables were created
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='position_tags'")
        if cursor.fetchone():
            print("✅ Table 'position_tags' created successfully")
        
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='position_tag_assignment'")
        if cursor.fetchone():
            print("✅ Table 'position_tag_assignment' created successfully")
        
        # Verify indexes
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%tag%'")
        indexes = cursor.fetchall()
        print(f"✅ Created {len(indexes)} indexes")
        
        print("\n✅ Migration completed successfully!")
        
    except sqlite3.Error as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    run_migration()
