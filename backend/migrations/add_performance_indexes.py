#!/usr/bin/env python3
"""
Performance optimization - Add database indexes
"""
from sqlalchemy import text
from app.db.session import engine

def add_performance_indexes():
    """Add indexes to improve query performance"""
    
    indexes_to_create = [
        # User table indexes
        "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)",
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
        "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
        
        # TradingPosition indexes
        "CREATE INDEX IF NOT EXISTS idx_trading_positions_user_id ON trading_positions(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_trading_positions_status ON trading_positions(status)",
        "CREATE INDEX IF NOT EXISTS idx_trading_positions_user_status ON trading_positions(user_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_trading_positions_ticker ON trading_positions(ticker)",
        "CREATE INDEX IF NOT EXISTS idx_trading_positions_opened_at ON trading_positions(opened_at)",
        "CREATE INDEX IF NOT EXISTS idx_trading_positions_closed_at ON trading_positions(closed_at)",
        "CREATE INDEX IF NOT EXISTS idx_trading_positions_setup_type ON trading_positions(setup_type)",
        
        # TradingPositionEvent indexes
        "CREATE INDEX IF NOT EXISTS idx_trading_position_events_position_id ON trading_position_events(position_id)",
        "CREATE INDEX IF NOT EXISTS idx_trading_position_events_event_date ON trading_position_events(event_date)",
        "CREATE INDEX IF NOT EXISTS idx_trading_position_events_event_type ON trading_position_events(event_type)",
        
        # InstructorNote indexes
        "CREATE INDEX IF NOT EXISTS idx_instructor_notes_student_id ON instructor_notes(student_id)",
        "CREATE INDEX IF NOT EXISTS idx_instructor_notes_instructor_id ON instructor_notes(instructor_id)",
        "CREATE INDEX IF NOT EXISTS idx_instructor_notes_created_at ON instructor_notes(created_at)",
        
        # TradingPositionJournalEntry indexes
        "CREATE INDEX IF NOT EXISTS idx_journal_entries_position_id ON trading_position_journal_entries(position_id)",
        "CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date ON trading_position_journal_entries(entry_date)",
        
        # TradingPositionChart indexes
        "CREATE INDEX IF NOT EXISTS idx_position_charts_position_id ON trading_position_charts(position_id)",
        "CREATE INDEX IF NOT EXISTS idx_position_charts_uploaded_at ON trading_position_charts(uploaded_at)",
        
        # Composite indexes for common queries
        "CREATE INDEX IF NOT EXISTS idx_positions_user_opened ON trading_positions(user_id, opened_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_positions_user_status_opened ON trading_positions(user_id, status, opened_at DESC)",
    ]
    
    with engine.connect() as conn:
        for index_sql in indexes_to_create:
            try:
                print(f"Creating index: {index_sql}")
                conn.execute(text(index_sql))
                conn.commit()
                print("✅ Index created successfully")
            except Exception as e:
                print(f"⚠️  Index creation failed (might already exist): {e}")
    
    print("🎯 Database indexing complete!")

if __name__ == "__main__":
    add_performance_indexes()