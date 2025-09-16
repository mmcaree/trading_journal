#!/usr/bin/env python3
"""
Migration: Add trade_entries table and migrate existing trade data

This migration:
1. Creates the trade_entries table
2. Migrates existing trades to create initial entries 
3. Maintains backward compatibility
"""

import sys
from pathlib import Path
from datetime import datetime

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.append(str(backend_dir))

from sqlalchemy import text
from app.db.session import SessionLocal, engine
from app.models.models import Base, Trade, TradeEntry
from app.models import import_models  # Import to register all models

def run_migration():
    """Run the migration"""
    
    print("🚀 Starting trade_entries migration...")
    
    db = SessionLocal()
    
    try:
        # 1. Create the trade_entries table
        print("📋 Creating trade_entries table...")
        TradeEntry.__table__.create(engine, checkfirst=True)
        print("✅ trade_entries table created")
        
        # 2. Migrate existing trades to create initial entries
        print("📊 Migrating existing trades...")
        
        # Get all existing active trades (handle different status formats)
        trades = db.query(Trade).filter(
            Trade.status.in_(['ACTIVE', 'PLANNED', 'active', 'planned', 'Open'])
        ).all()
        print(f"Found {len(trades)} active/planned trades to migrate")
        
        migrated_count = 0
        for trade in trades:
            # Check if this trade already has entries (in case migration is run multiple times)
            existing_entries = db.query(TradeEntry).filter(TradeEntry.trade_id == trade.id).count()
            
            if existing_entries == 0:
                # Create initial entry from the trade data
                entry = TradeEntry(
                    trade_id=trade.id,
                    entry_price=trade.entry_price,
                    entry_date=trade.entry_date,
                    shares=int(trade.position_size) if trade.position_size else 0,
                    stop_loss=trade.stop_loss,
                    notes=f"Initial entry (migrated from trade #{trade.id})",
                    created_at=trade.created_at or datetime.utcnow(),
                    is_active=True
                )
                
                db.add(entry)
                migrated_count += 1
        
        # Commit the migration
        db.commit()
        print(f"✅ Successfully migrated {migrated_count} trades to trade_entries")
        
        # 3. Verify the migration
        total_entries = db.query(TradeEntry).count()
        print(f"📈 Total trade entries in database: {total_entries}")
        
        print("🎉 Migration completed successfully!")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()

def rollback_migration():
    """Rollback the migration (for development purposes)"""
    
    print("⚠️  Rolling back trade_entries migration...")
    
    db = SessionLocal()
    
    try:
        # Delete all trade entries
        deleted_count = db.query(TradeEntry).delete()
        print(f"🗑️  Deleted {deleted_count} trade entries")
        
        # Drop the table
        TradeEntry.__table__.drop(engine, checkfirst=True)
        print("✅ trade_entries table dropped")
        
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
    
    parser = argparse.ArgumentParser(description='Trade entries migration')
    parser.add_argument('--rollback', action='store_true', help='Rollback the migration')
    
    args = parser.parse_args()
    
    if args.rollback:
        rollback_migration()
    else:
        run_migration()