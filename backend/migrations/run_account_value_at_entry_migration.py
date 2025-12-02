"""
Run database migration to add account_value_at_entry column on SQLite (Local Development)
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
        migration_path = Path(__file__).parent / 'add_account_value_at_entry.sql'
        with open(migration_path, 'r', encoding='utf-8') as f:
            sql = f.read()
        
        print("📦 Running migration: Add account_value_at_entry to trading_positions")
        print("="*60)
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(trading_positions)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'account_value_at_entry' in columns:
            print("⚠️  Column 'account_value_at_entry' already exists!")
            print("   Migration may have already been run.")
            response = input("\n   Continue anyway? (yes/no): ")
            if response.lower() != 'yes':
                print("❌ Migration cancelled.")
                sys.exit(0)
        
        # Execute migration
        cursor.executescript(sql)
        conn.commit()
        
        # Verify column was added
        cursor.execute("PRAGMA table_info(trading_positions)")
        columns_after = {col[1]: col for col in cursor.fetchall()}
        
        if 'account_value_at_entry' in columns_after:
            col_info = columns_after['account_value_at_entry']
            print(f"✅ Column 'account_value_at_entry' added successfully")
            print(f"   Type: {col_info[2]}")
            print(f"   Nullable: {col_info[3] == 0}")
        
        # Count positions
        cursor.execute("SELECT COUNT(*) FROM trading_positions")
        count = cursor.fetchone()[0]
        print(f"\n📊 Total positions in database: {count}")
        print(f"   Run backfill_account_value_at_entry.py to calculate values")
        
        print("\n" + "="*60)
        print("✅ Local SQLite Migration completed successfully!")
        print("="*60)
        print("\n📝 Next Steps:")
        print("   1. Run: python scripts/backfill_account_value_at_entry.py")
        print("   2. This will calculate account_value_at_entry for all positions")
        
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
    print("║     Add account_value_at_entry column                      ║")
    print("╚════════════════════════════════════════════════════════════╝")
    print()
    run_migration()
