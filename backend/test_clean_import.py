#!/usr/bin/env python3
"""Test SHORT import with clean slate"""

import logging
logging.basicConfig(level=logging.WARNING, format='%(levelname)s: %(message)s')

from app.db.session import SessionLocal
from app.services.import_service import IndividualPositionImportService
from app.services.data_service import clear_all_user_data
from app.models import User

db = SessionLocal()

# Get demo user
user = db.query(User).filter(User.username == 'demo').first()
if not user:
    print("Demo user not found!")
    exit(1)

print(f"Testing import for user: {user.username} (ID: {user.id})")

# CLEAR ALL DATA FIRST
print("Clearing all existing data...")
clear_all_user_data(db, user.id)
db.commit()
print("Data cleared.")

# Read CSV
with open('C:/Users/mmcar/Desktop/Dev/TradeJournal/test_data/open_ticker_debug.csv', 'r') as f:
    csv_content = f.read()

# Run actual import
service = IndividualPositionImportService(db)
print("\nImporting...")
result = service.import_webull_csv(csv_content, user.id)

print(f"\nImport completed:")
print(f"  Success: {result.get('success', False)}")
print(f"  Total positions: {result.get('total_positions', 0)}")
print(f"  Open positions: {result.get('open_positions', 0)}")
print(f"  Imported events: {result.get('imported_events', 0)}")

# Now query database to verify
from app.models import TradingPosition, TradingPositionEvent

positions = (db.query(TradingPosition)
    .filter(TradingPosition.user_id == user.id, TradingPosition.ticker == 'OPEN')
    .order_by(TradingPosition.opened_at)
    .all())

print(f"\nDatabase verification:")
print(f"  Total OPEN positions in DB: {len(positions)}")
print(f"  Closed in DB: {sum(1 for p in positions if p.status.value == 'CLOSED')}")
print(f"  Open in DB: {sum(1 for p in positions if p.status.value == 'OPEN')}")

# Find SHORT position
print(f"\nSearching for SHORT position at 10:55:22:")
for pos in positions:
    events = db.query(TradingPositionEvent).filter(
        TradingPositionEvent.position_id == pos.id
    ).order_by(TradingPositionEvent.event_date).all()
    
    for e in events:
        if "10:55:22" in str(e.event_date):
            print(f"\n  Position {pos.id}: {pos.current_shares} shares, Status: {pos.status.value}")
            print(f"    Opened: {pos.opened_at}")
            print(f"    Closed: {pos.closed_at}")
            print(f"    Events:")
            for ev in events:
                print(f"      {ev.event_date} | {ev.event_type.value:4s} {ev.shares:5d} @ {ev.price:7.2f} | Before: {ev.position_shares_before:5d} After: {ev.position_shares_after:5d}")
            break

db.close()
