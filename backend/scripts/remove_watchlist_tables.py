"""Remove watchlist tables

This script removes the watchlist-related tables from the database
since we've removed the watchlist functionality from the application.

Usage: Run this script manually if you have existing watchlist tables
"""

from app.db.database import engine
from sqlalchemy import text

def remove_watchlist_tables():
    """Remove watchlist tables if they exist"""
    try:
        with engine.connect() as connection:
            # Drop tables in correct order (child tables first)
            connection.execute(text("DROP TABLE IF EXISTS watchlist_items;"))
            connection.execute(text("DROP TABLE IF EXISTS watchlists;"))
            connection.commit()
            print("✅ Watchlist tables removed successfully")
    except Exception as e:
        print(f"❌ Error removing watchlist tables: {e}")
        print("This is normal if the tables didn't exist yet.")

if __name__ == "__main__":
    remove_watchlist_tables()