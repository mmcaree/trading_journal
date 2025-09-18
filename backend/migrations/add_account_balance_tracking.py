"""
Migration script to add account balance tracking fields to User model
"""
import os
import sys

# Add the backend directory to the path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from app.database.database import get_database_url

def run_migration():
    """Add current_account_balance and initial_account_balance fields to users table"""
    
    # Get database URL
    database_url = get_database_url()
    engine = create_engine(database_url)
    
    try:
        with engine.connect() as connection:
            print("🚀 Starting account balance tracking migration...")
            
            # Add current_account_balance column
            try:
                connection.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN current_account_balance REAL;
                """))
                print("✅ Added current_account_balance column to users table")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                    print("ℹ️ current_account_balance column already exists")
                else:
                    raise e
            
            # Add initial_account_balance column
            try:
                connection.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN initial_account_balance REAL;
                """))
                print("✅ Added initial_account_balance column to users table")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                    print("ℹ️ initial_account_balance column already exists")
                else:
                    raise e
            
            # Set default values for existing users (use default_account_size if available)
            result = connection.execute(text("""
                UPDATE users 
                SET current_account_balance = COALESCE(default_account_size, 10000.0),
                    initial_account_balance = COALESCE(default_account_size, 10000.0)
                WHERE current_account_balance IS NULL
            """))
            
            affected_rows = result.rowcount
            print(f"✅ Updated {affected_rows} users with default account balance values")
            
            # Commit the transaction
            connection.commit()
            
            print("🎉 Migration completed successfully!")
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        raise e
    finally:
        engine.dispose()

if __name__ == "__main__":
    run_migration()