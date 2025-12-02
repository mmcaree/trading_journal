#!/usr/bin/env python3
"""Test SHORT import to debug the issue"""

from app.db.session import SessionLocal
from app.services import import_service as service_module
from app.services.import_service import IndividualPositionImportService
from app.models import User, TradingPosition, TradingPositionEvent

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

# Parse events first to see what we're working with
service = IndividualPositionImportService(db)
service.broker_profile = service_module.WEBULL_USA_PROFILE  # Set broker profile for parsing

try:
    events = service._parse_webull_csv(csv_content)
    print(f"Successfully parsed {len(events)} total events")
except Exception as e:
    print(f"ERROR parsing CSV: {e}")
    import traceback
    traceback.print_exc()
    events = []

# Filter to OPEN ticker and filled orders
print(f"\nFirst 5 parsed events:")
for e in events[:5]:
    print(f"  Symbol: '{e['symbol']}' | Side: '{e['side']}' | Status: '{e['status']}' | Qty: {e['filled_qty']}")

open_events = [e for e in events if e['symbol'] == 'OPEN' and e['status'].upper() == 'FILLED']
open_events.sort(key=lambda x: x['filled_time'])

print(f"\nFiltered to {len(open_events)} OPEN FILLED events")

# Show ALL sides to debug
print("\nALL event sides in parsed data:")
for e in open_events[:10]:
    print(f"  {e['filled_time']} | Side: '{e['side']}' | Qty: {e['filled_qty']}")

print("\nEvents around SHORT (08/15 10:52-10:56):")
print("=" * 100)

for i, e in enumerate(open_events):
    if '2025-08-15' in str(e['filled_time']) and '10:5' in str(e['filled_time']):
        print(f"{i+1}. {e['filled_time']} | {e['side']:5} {e['filled_qty']:4} @ {e['avg_price']:6.2f}")

# Now check what's in the database
print("\n\nCurrent OPEN positions in database:")
print("=" * 100)
positions = db.query(TradingPosition).filter(
    TradingPosition.user_id == user.id,
    TradingPosition.ticker == 'OPEN'
).order_by(TradingPosition.created_at.desc()).limit(3).all()

for pos in positions:
    events_count = db.query(TradingPositionEvent).filter(TradingPositionEvent.position_id == pos.id).count()
    print(f"\nPosition {pos.id}: {pos.current_shares} shares, Status: {pos.status}")
    print(f"  Events: {events_count}")
    print(f"  Opened: {pos.opened_at}")
    print(f"  Closed: {pos.closed_at}")
    
    # Show events around 08/15 10:55
    pos_events = db.query(TradingPositionEvent).filter(
        TradingPositionEvent.position_id == pos.id
    ).order_by(TradingPositionEvent.event_date).all()
    
    print(f"  Events around 08/15 10:52-10:56:")
    for e in pos_events:
        if '2025-08-15' in str(e.event_date) and '10:5' in str(e.event_date):
            print(f"    {e.event_date} | {e.event_type} {e.shares:5} @ {e.price:6.2f} | Before: {e.position_shares_before:5} After: {e.position_shares_after:5}")

db.close()
