"""
Run database migration for account transactions on SQLite (Local Development)
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
        migration_path = Path(__file__).parent / 'add_account_transactions.sql'
        with open(migration_path, 'r', encoding='utf-8') as f:
            sql = f.read()
        
        print("📦 Running migration: Add Account Transactions Table")
        print("="*60)
        
        # Execute migration (SQLite can handle multiple statements)
        cursor.executescript(sql)
        conn.commit()
        
        # Verify table was created
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='account_transactions'
        """)
        table = cursor.fetchone()
        
        if table:
            print(f"✅ Table 'account_transactions' created successfully")
        else:
            print(f"⚠️  Table 'account_transactions' may already exist")
        
        # Verify indexes
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='index' AND name LIKE 'idx_account_transactions%'
        """)
        indexes = cursor.fetchall()
        print(f"✅ Created/verified {len(indexes)} indexes:")
        for idx in indexes:
            print(f"   - {idx[0]}")
        
        # Show table structure
        print("\n📋 Table Structure:")
        print("-" * 60)
        
        cursor.execute("PRAGMA table_info(account_transactions)")
        columns = cursor.fetchall()
        
        print("\naccount_transactions columns:")
        for col in columns:
            col_id, name, col_type, not_null, default_val, pk = col
            null_str = "NOT NULL" if not_null else "NULL"
            default_str = f"DEFAULT {default_val}" if default_val else ""
            pk_str = "PRIMARY KEY" if pk else ""
            print(f"  {name:20} {col_type:15} {null_str:10} {default_str:25} {pk_str}")
        
        # Show foreign keys
        cursor.execute("PRAGMA foreign_key_list(account_transactions)")
        fks = cursor.fetchall()
        if fks:
            print("\nForeign Keys:")
            for fk in fks:
                print(f"  - Column '{fk[3]}' references {fk[2]}({fk[4]})")
        
        # Count existing records (if any)
        cursor.execute("SELECT COUNT(*) FROM account_transactions")
        count = cursor.fetchone()[0]
        print(f"\n📊 Current records in table: {count}")
        
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
    print("╚════════════════════════════════════════════════════════════╝")
    print()
    run_migration()
