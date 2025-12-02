"""
Run database migration to add starting_balance_date column on SQLite (Local Development)
"""
import sqlite3
import sys
from pathlib import Path

def run_migration():
    # Local SQLite database path
    db_path = Path(__file__).parent.parent / 'app.db'
    
    print(f"🚀 Connecting to local SQLite database...")
    print(f"   Path: {db_path}")
    print()
    
    if not db_path.exists():
        print(f"❌ Database not found at {db_path}")
        print("   Make sure you're running this from the backend/migrations directory")
        sys.exit(1)
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        # Read migration SQL
        migration_path = Path(__file__).parent / 'add_starting_balance_date.sql'
        with open(migration_path, 'r', encoding='utf-8') as f:
            sql = f.read()
        
        print("📦 Running migration: Add starting_balance_date to users table")
        print("="*60)
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'starting_balance_date' in columns:
            print("⚠️  Column 'starting_balance_date' already exists!")
            print("   Migration may have already been run.")
            response = input("\n   Continue anyway? (yes/no): ")
            if response.lower() != 'yes':
                print("❌ Migration cancelled.")
                sys.exit(0)
        
        # Execute migration
        cursor.executescript(sql)
        conn.commit()
        
        # Verify column was added
        cursor.execute("PRAGMA table_info(users)")
        columns_after = {col[1]: col for col in cursor.fetchall()}
        
        if 'starting_balance_date' in columns_after:
            col_info = columns_after['starting_balance_date']
            print(f"✅ Column 'starting_balance_date' added successfully")
            print(f"   Type: {col_info[2]}")
            print(f"   Nullable: {col_info[3] == 0}")
        
        # Count users with backfilled dates
        cursor.execute("""
            SELECT COUNT(*) FROM users 
            WHERE starting_balance_date IS NOT NULL
        """)
        count = cursor.fetchone()[0]
        print(f"\n✅ Backfilled {count} user(s) with starting_balance_date")
        
        # Show sample data
        cursor.execute("""
            SELECT username, initial_account_balance, starting_balance_date 
            FROM users 
            LIMIT 3
        """)
        samples = cursor.fetchall()
        
        if samples:
            print("\n📊 Sample Data:")
            print("-" * 60)
            for username, balance, date in samples:
                print(f"  User: {username:20} Balance: ${balance or 0:>10,.2f}  Date: {date or 'NULL'}")
        
        print("\n" + "="*60)
        print("✅ Local SQLite Migration completed successfully!")
        print("="*60)
        
    except sqlite3.Error as e:
        print(f"\n❌ Migration failed: {e}")
        if conn:
            conn.rollback()
        sys.exit(1)
    except FileNotFoundError:
        print(f"❌ Migration file not found: {migration_path}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        if conn:
            conn.rollback()
        sys.exit(1)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

if __name__ == '__main__':
    print("╔════════════════════════════════════════════════════════════╗")
    print("║     LOCAL DATABASE MIGRATION - SQLITE (app.db)            ║")
    print("║     Add starting_balance_date column                       ║")
    print("╚════════════════════════════════════════════════════════════╝")
    print()
    run_migration()
