#!/usr/bin/env python3
"""Test SHORT import with live import and logging"""

import logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

from app.db.session import SessionLocal
from app.services.import_service import IndividualPositionImportService
from app.models import User

db = SessionLocal()

# Get demo user
user = db.query(User).filter(User.username == 'demo').first()
if not user:
    print("Demo user not found!")
    exit(1)

print(f"Testing import for user: {user.username} (ID: {user.id})")

# Read CSV
with open('C:/Users/mmcar/Desktop/Dev/TradeJournal/test_data/open_ticker_debug.csv', 'r') as f:
    csv_content = f.read()

# Run actual import
service = IndividualPositionImportService(db)
try:
    result = service.import_webull_csv(csv_content, user.id)
    print(f"\n\nImport completed:")
    print(f"  Success: {result.get('success', False)}")
    print(f"  Total positions: {result.get('total_positions', 0)}")
    print(f"  Open positions: {result.get('open_positions', 0)}")
    print(f"  Imported events: {result.get('imported_events', 0)}")
    print(f"  Warnings: {len(result.get('warnings', []))}")
except Exception as e:
    print(f"ERROR during import: {e}")
    import traceback
    traceback.print_exc()

db.close()
