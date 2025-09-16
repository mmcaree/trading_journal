#!/usr/bin/env python3
"""
Migration: Add instrument_type and options fields to trades table

This migration:
1. Adds instrument_type field (STOCK, OPTIONS)
2. Adds options-specific fields (strike_price, expiration_date, option_type)
3. Updates existing trades to be STOCK type
4. Maintains backward compatibility
"""

import sys
from pathlib import Path
from datetime import datetime

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.append(str(backend_dir))

from sqlalchemy import text, Column, String, Float, DateTime, Enum
from app.db.session import SessionLocal, engine
from app.models.models import Base, Trade
from app.models import import_models  # Import to register all models
import enum

class InstrumentType(str, enum.Enum):
    STOCK = "stock"
    OPTIONS = "options"

def run_migration():
    """Run the migration"""
    
    print("🚀 Starting options support migration...")
    
    db = SessionLocal()
    
    try:
        # 1. Add new columns to trades table
        print("📋 Adding new columns to trades table...")
        
        with engine.connect() as conn:
            # Add instrument_type column (default to STOCK for existing trades)
            try:
                conn.execute(text("""
                    ALTER TABLE trades 
                    ADD COLUMN instrument_type VARCHAR(10) DEFAULT 'stock'
                """))
                print("✅ Added instrument_type column")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                    print("ℹ️  instrument_type column already exists")
                else:
                    raise
            
            # Add options-specific columns
            try:
                conn.execute(text("""
                    ALTER TABLE trades 
                    ADD COLUMN strike_price FLOAT
                """))
                print("✅ Added strike_price column")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                    print("ℹ️  strike_price column already exists")
                else:
                    raise
            
            try:
                conn.execute(text("""
                    ALTER TABLE trades 
                    ADD COLUMN expiration_date DATETIME
                """))
                print("✅ Added expiration_date column")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                    print("ℹ️  expiration_date column already exists")
                else:
                    raise
            
            try:
                conn.execute(text("""
                    ALTER TABLE trades 
                    ADD COLUMN option_type VARCHAR(10)
                """))
                print("✅ Added option_type column")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                    print("ℹ️  option_type column already exists")
                else:
                    raise
            
            # Commit the schema changes
            conn.commit()
        
        # 2. Update existing trades to be STOCK type
        print("📊 Updating existing trades to STOCK type...")
        
        result = db.execute(text("""
            UPDATE trades 
            SET instrument_type = 'stock' 
            WHERE instrument_type IS NULL OR instrument_type = ''
        """))
        
        updated_count = result.rowcount
        print(f"✅ Updated {updated_count} existing trades to STOCK type")
        
        # Commit the data changes
        db.commit()
        
        # 3. Verify the migration
        stock_count = db.execute(text("SELECT COUNT(*) FROM trades WHERE instrument_type = 'stock'")).scalar()
        options_count = db.execute(text("SELECT COUNT(*) FROM trades WHERE instrument_type = 'options'")).scalar()
        print(f"📈 Total stock trades: {stock_count}")
        print(f"📈 Total options trades: {options_count}")
        
        print("🎉 Migration completed successfully!")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()

def rollback_migration():
    """Rollback the migration (for development purposes)"""
    
    print("⚠️  Rolling back options support migration...")
    
    db = SessionLocal()
    
    try:
        with engine.connect() as conn:
            # Remove the columns (SQLite doesn't support DROP COLUMN easily, so we'll skip for now)
            # In production, you might want to create a new table without these columns and migrate data
            print("ℹ️  Note: Column removal not implemented for SQLite compatibility")
            print("ℹ️  Columns will remain but can be ignored")
            
            # Clear the options-specific data
            conn.execute(text("""
                UPDATE trades 
                SET instrument_type = 'stock',
                    strike_price = NULL,
                    expiration_date = NULL,
                    option_type = NULL
            """))
            
            conn.commit()
        
        db.commit()
        print("🎉 Rollback completed successfully!")
        
    except Exception as e:
        print(f"❌ Rollback failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Options support migration')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration')
    
    args = parser.parse_args()
    
    if args.rollback:
        rollback_migration()
    else:
        run_migration()