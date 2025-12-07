#!/usr/bin/env python3
"""
Production Individual Position Lifecycle Import Service
Integrates the proven CSV import logic with the existing database models
"""

import csv
import io
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.services.position_service import PositionService

from app.models.position_models import (
    TradingPosition, 
    TradingPositionEvent, 
    EventType, 
    PositionStatus,
    InstrumentType,
    OptionType,
    EventSource,
    ImportedPendingOrder,
    OrderStatus
)
from app.models import User
from app.utils.datetime_utils import utc_now
from app.services.broker_profiles import WEBULL_USA_PROFILE
from app.services.account_value_service import AccountValueService

logger = logging.getLogger(__name__)

class ImportValidationError(Exception):
    """Custom exception for import validation errors"""
    def __init__(self, message: str, row_number: int = None, field: str = None):
        self.message = message
        self.row_number = row_number
        self.field = field
        super().__init__(self.message)

class IndividualPositionTracker:
    """Tracks individual position lifecycles during import"""
    
    def __init__(self, db: Session, user_id: int, account_value_service=None):
        self.db = db
        self.user_id = user_id
        self.account_value_service = account_value_service
        self.position_service = PositionService(db)
        self.symbol_positions: Dict[str, List[TradingPosition]] = {}
        self.position_counter = 0
    
    def add_event(self, event_data: Dict[str, Any]) -> TradingPosition:
        """Add event to appropriate position and return the position"""
        symbol = event_data['symbol']
        
        if symbol not in self.symbol_positions:
            self.symbol_positions[symbol] = []
        
        # Find the current open position or create new one
        current_position = self._get_current_position(symbol, event_data)
        
        # Create the event
        event = self._create_position_event(event_data, current_position)
        self.db.add(event)
        
        # Update position based on event
        self._update_position_from_event(current_position, event, event_data)
        
        # Flush changes so they're visible to the session
        self.db.flush()
        
        return current_position
    
    def _get_current_position(self, symbol: str, event_data: Dict[str, Any]) -> TradingPosition:
        """Get current open position or create new one"""
        positions = self.symbol_positions[symbol]
        
        # Look for open position (not closed)
        for position in reversed(positions):  # Check most recent first
            if position.status == PositionStatus.OPEN:
                return position
        
        # No open position found - create new one
        # This happens for the first buy/short or when starting new position after closure
        side_upper = event_data['side'].upper()
        
        if side_upper in ['BUY', 'SHORT'] or len(positions) == 0:
            return self._create_new_position(symbol, event_data)
        else:
            # Sell order but no open position - this shouldn't happen in clean data
            logger.warning(f"Sell order for {symbol} but no open position exists (side='{event_data['side']}')")
            return self._create_new_position(symbol, event_data)
    
    def _create_new_position(self, symbol: str, event_data: Dict[str, Any]) -> TradingPosition:
        """Create a new position"""
        self.position_counter += 1
        
        # Note: account_value_at_entry is calculated dynamically via AccountValueService
        # No need to store static value - always compute fresh for accuracy
        
        position = TradingPosition(
            user_id=self.user_id,
            ticker=symbol,
            instrument_type=self._map_instrument_type(event_data.get('instrument_type', 'STOCK')),
            status=PositionStatus.OPEN,
            current_shares=0,
            avg_entry_price=None,
            total_cost=0.0,
            total_realized_pnl=0.0,
            opened_at=event_data['filled_time'],
            created_at=utc_now(),
            updated_at=utc_now()
        )
        
        # Add option-specific fields if applicable
        if position.instrument_type == InstrumentType.OPTIONS and event_data.get('options_info'):
            options_info = event_data['options_info']
            position.strike_price = options_info.get('strike_price')
            position.expiration_date = options_info.get('expiration_date')
            position.option_type = self._map_option_type(options_info.get('option_type'))
        
        self.db.add(position)
        self.db.flush()  # Get the ID
        
        self.symbol_positions[symbol].append(position)
        return position
    
    def _create_position_event(self, event_data: Dict[str, Any], position: TradingPosition) -> TradingPositionEvent:
        """Create a position event from import data"""
        event_type = self._map_event_type(event_data['side'])
        shares = self._calculate_event_shares(event_data)
        
        # Extract stop loss (if provided)
        stop_loss_value = float(event_data.get('stop_loss', 0)) or None
        
        return TradingPositionEvent(
            position_id=position.id,
            event_type=event_type,
            event_date=event_data['filled_time'],
            shares=shares,
            price=float(event_data['avg_price']),
            stop_loss=stop_loss_value,
            original_stop_loss=stop_loss_value,  # Set original_stop_loss to same value at import
            notes=event_data.get('notes', ''),
            source=EventSource.IMPORT,
            source_id=f"import_{utc_now().isoformat()}",
            position_shares_before=position.current_shares,
            created_at=utc_now()
        )
    
    def _update_position_from_event(self, position: TradingPosition, event: TradingPositionEvent, event_data: Dict[str, Any]):
        """Update position calculations based on new event"""
        if event.event_type == EventType.BUY:
            self._process_buy_event(position, event)
        elif event.event_type == EventType.SELL:
            self._process_sell_event(position, event)
        
        # Update event's after-state
        event.position_shares_after = position.current_shares
        
        # Check if position should be closed
        if position.current_shares == 0:
            position.status = PositionStatus.CLOSED
            position.closed_at = event.event_date
        
        # Update risk management from event
        if event.stop_loss:
            position.current_stop_loss = event.stop_loss
        
        position.updated_at = utc_now()
    
    def _process_buy_event(self, position: TradingPosition, event: TradingPositionEvent):
        """Process buy event using FIFO logic + correct original risk"""
        was_first_buy = position.current_shares == 0

        if position.current_shares >= 0:
            # Adding to long or creating new long
            if was_first_buy:
                position.avg_entry_price = event.price
                position.current_shares = event.shares
                position.total_cost = event.price * event.shares
                position.original_shares = event.shares  # ← Critical for backfill

                # ← THIS IS THE FIX: Use shared logic from PositionService
                self.position_service._set_original_risk(
                    position=position,
                    shares=event.shares,
                    price=event.price
                )
            else:
                # Average cost calculation
                total_cost = position.total_cost + (event.price * event.shares)
                position.current_shares += event.shares
                position.avg_entry_price = total_cost / position.current_shares
                position.total_cost = total_cost
        else:
            # Covering short position with buy
            cover_qty = min(abs(position.current_shares), event.shares)
            remaining_qty = event.shares - cover_qty

            # Calculate P&L on covered shares
            pnl_per_share = position.avg_entry_price - event.price
            realized_pnl = pnl_per_share * cover_qty
            position.total_realized_pnl += realized_pnl
            event.realized_pnl = realized_pnl

            position.current_shares += cover_qty

            if remaining_qty > 0:
                # Create new long position with remaining
                position.current_shares = remaining_qty
                position.avg_entry_price = event.price
                position.total_cost = event.price * remaining_qty

                # ← Also set original risk when flipping from short → long
                self.position_service._set_original_risk(
                    position=position,
                    shares=remaining_qty,
                    price=event.price
                )

        # Update current risk if stop loss exists
        if event.stop_loss and event.stop_loss > 0:
            self._calculate_current_risk_percent(position)
    
    def _process_sell_event(self, position: TradingPosition, event: TradingPositionEvent):
        """Process sell event using FIFO logic"""
        if event.shares < 0:  # This is a short sale
            if position.current_shares > 0:
                # Shorting against long position (reduces long first)
                cover_qty = min(position.current_shares, abs(event.shares))
                remaining_short = abs(event.shares) - cover_qty
                
                # Calculate P&L on covered shares
                if position.avg_entry_price:
                    pnl_per_share = event.price - position.avg_entry_price
                    realized_pnl = pnl_per_share * cover_qty
                    position.total_realized_pnl += realized_pnl
                    event.realized_pnl = realized_pnl
                
                position.current_shares -= cover_qty
                
                if remaining_short > 0:
                    # Create short position with remaining
                    position.current_shares = -remaining_short
                    position.avg_entry_price = event.price
                    position.total_cost = event.price * remaining_short
            else:
                # Adding to short or creating new short
                if position.current_shares == 0:
                    position.avg_entry_price = event.price
                    position.current_shares = event.shares  # Already negative
                    position.total_cost = event.price * abs(event.shares)
                else:
                    # Adding to existing short position
                    total_proceeds = position.total_cost + (event.price * abs(event.shares))
                    position.current_shares += event.shares  # Add negative value
                    position.avg_entry_price = total_proceeds / abs(position.current_shares)
                    position.total_cost = total_proceeds
        else:
            # Regular sell from long position
            if position.current_shares > 0:
                sell_qty = min(position.current_shares, event.shares)
                
                # Calculate P&L
                if position.avg_entry_price and position.avg_entry_price > 0:
                    pnl_per_share = event.price - position.avg_entry_price
                    realized_pnl = pnl_per_share * sell_qty
                    position.total_realized_pnl += realized_pnl
                    event.realized_pnl = realized_pnl
                else:
                    logger.warning(f"Cannot calculate P&L for sell - avg_entry_price is {position.avg_entry_price}")
                
                position.current_shares -= sell_qty
                
                # Check if selling MORE than owned (going short)
                remaining_sell = event.shares - sell_qty
                if remaining_sell > 0:
                    logger.info(f"Sell of {event.shares} exceeds position of {sell_qty}, creating short position of {remaining_sell} shares")
                    # Create short position with remaining shares
                    position.current_shares = -remaining_sell
                    position.avg_entry_price = event.price
                    position.total_cost = event.price * remaining_sell
                else:
                    # Adjust cost basis for remaining long shares
                    if position.current_shares > 0 and position.avg_entry_price:
                        position.total_cost = position.avg_entry_price * position.current_shares
                    # Note: When current_shares = 0 (position closed), we preserve total_cost
                    # as it represents the total capital deployed for return calculations
            elif position.current_shares == 0:
                # Selling with no position - create short
                logger.info(f"Sell of {event.shares} with no position, creating short position")
                position.current_shares = -event.shares
                position.avg_entry_price = event.price
                position.total_cost = event.price * event.shares
            else:
                # Already short, adding to short position
                logger.info(f"Adding {event.shares} to existing short position of {position.current_shares}")
                total_proceeds = position.total_cost + (event.price * event.shares)
                position.current_shares -= event.shares  # Make more negative
                position.avg_entry_price = total_proceeds / abs(position.current_shares)
                position.total_cost = total_proceeds
    
    def _map_instrument_type(self, instrument_type: str) -> InstrumentType:
        """Map string to InstrumentType enum"""
        if instrument_type.upper() == 'OPTIONS':
            return InstrumentType.OPTIONS
        return InstrumentType.STOCK
    
    def _map_option_type(self, option_type: str) -> Optional[OptionType]:
        """Map string to OptionType enum"""
        if not option_type:
            return None
        if option_type.upper() == 'CALL':
            return OptionType.CALL
        elif option_type.upper() == 'PUT':
            return OptionType.PUT
        return None
    
    def _map_event_type(self, side: str) -> EventType:
        """Map side to EventType"""
        if side.upper() in ['BUY']:
            return EventType.BUY
        elif side.upper() in ['SELL', 'SHORT']:
            return EventType.SELL
        else:
            raise ImportValidationError(f"Unknown side: {side}")
    
    def _calculate_event_shares(self, event_data: Dict[str, Any]) -> int:
        """Calculate shares for event (positive for buy, negative for sell/short)"""
        quantity = int(event_data['filled_qty'])
        side = event_data['side'].upper()
        
        if side == 'BUY':
            return quantity
        elif side == 'SELL':
            return quantity  # Will be handled as positive sell in logic
        elif side == 'SHORT':
            return -quantity  # Negative for short
        else:
            raise ImportValidationError(f"Unknown side: {side}")
    
    def _calculate_original_risk_percent(self, position: TradingPosition, event: TradingPositionEvent):
        """Calculate original risk percentage for new position entry
        
        Uses the actual shares from the buy event (not accumulated original_shares)
        and dynamically calculates account value at the time of entry.
        """
        # Get dynamically calculated account value at event time
        account_value = self.account_value_service.get_account_value_at_date(
            self.user_id, 
            event.event_date
        )
        
        if not account_value or account_value <= 0:
            logger.warning(f"Invalid account value {account_value} at {event.event_date}")
            return
        
        # Calculate original risk: (entry_price - stop_loss) × event_shares / account_value
        # Use event.shares (the actual shares bought), NOT position.original_shares
        if event.stop_loss and event.price and event.shares:
            risk_per_share = event.price - event.stop_loss
            total_risk = risk_per_share * event.shares  # Use THIS event's shares
            risk_percent = (total_risk / account_value) * 100
            
            position.original_risk_percent = round(risk_percent, 2)
            logger.info(f"Calculated original risk for {position.ticker}: {risk_percent:.2f}% "
                       f"(${total_risk:.2f} / ${account_value:.2f})")
    
    def _calculate_current_risk_percent(self, position: TradingPosition):
        """Calculate current risk percentage based on current position and stop loss
        
        Uses dynamically calculated account value at the time of the event.
        """
        # Get dynamically calculated account value at event time
        # Use the most recent event time or position opened_at
        from app.models import TradingPositionEvent
        
        latest_event = self.db.query(TradingPositionEvent).filter(
            TradingPositionEvent.position_id == position.id
        ).order_by(TradingPositionEvent.event_date.desc()).first()
        
        event_date = latest_event.event_date if latest_event else position.opened_at
        if not event_date:
            return
        
        account_value = self.account_value_service.get_account_value_at_date(
            self.user_id,
            event_date
        )
        
        if not account_value or account_value <= 0:
            return
        
        # Calculate current risk: (avg_entry_price - current_stop_loss) × current_shares / current_account_value
        if position.current_stop_loss and position.avg_entry_price and position.current_shares > 0:
            risk_per_share = position.avg_entry_price - position.current_stop_loss
            total_risk = risk_per_share * position.current_shares
            risk_percent = (total_risk / account_value) * 100
            
            position.current_risk_percent = round(risk_percent, 2)
            logger.info(f"Updated current risk for {position.ticker}: {risk_percent:.2f}%")

class IndividualPositionImportService:
    """Production import service using individual position lifecycle tracking"""
    
    def __init__(self, db: Session):
        self.db = db
        self.account_value_service = AccountValueService(db)
        self.validation_errors: List[ImportValidationError] = []
        self.warnings: List[str] = []
    
    def import_webull_csv(self, csv_content: str, user_id: int) -> Dict[str, Any]:
        """Import Webull CSV using individual position lifecycle tracking"""
        try:
            # Reset validation state
            self.validation_errors = []
            self.warnings = []
            
            # Set broker profile for parsing
            self.broker_profile = WEBULL_USA_PROFILE
            
            # Parse CSV events
            events = self._parse_webull_csv(csv_content)
            
            if self.validation_errors:
                return {
                    'success': False,
                    'errors': [self._format_error(e) for e in self.validation_errors],
                    'warnings': self.warnings
                }
            
            # Sort events chronologically with deterministic tie-breaking
            events.sort(key=self._sort_key)
            
            # Enhanced events with stop loss detection and pending orders collection
            enhanced_events, pending_orders_data = self._detect_stop_losses(events)
            
            # Process events using individual position tracking
            tracker = IndividualPositionTracker(self.db, user_id, self.account_value_service)
            
            imported_count = 0
            position_count = 0
            
            for event_data in enhanced_events:
                # Only process filled orders for position tracking
                if event_data['status'].upper() == 'FILLED':
                    try:
                        position = tracker.add_event(event_data)
                        imported_count += 1
                        
                        if position.id and position.id > position_count:
                            position_count = position.id
                            
                    except Exception as e:
                        logger.error(f"Error processing event: {e}")
                        self.validation_errors.append(
                            ImportValidationError(f"Error processing event: {str(e)}")
                        )
            
            # Now store pending orders and link them to positions
            self._store_pending_orders(pending_orders_data, tracker, user_id)
            
            if self.validation_errors:
                self.db.rollback()
                return {
                    'success': False,
                    'errors': [self._format_error(e) for e in self.validation_errors],
                    'warnings': self.warnings
                }
            
            # Commit all changes
            self.db.commit()
            
            return {
                'success': True,
                'imported_events': imported_count,
                'total_positions': len([p for positions in tracker.symbol_positions.values() for p in positions]),
                'open_positions': len([p for positions in tracker.symbol_positions.values() 
                                     for p in positions if p.status == PositionStatus.OPEN]),
                'warnings': self.warnings
            }
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Import failed: {e}")
            return {
                'success': False,
                'errors': [{'message': str(e), 'row_number': None, 'field': None}],
                'imported_events': 0
            }
    
    def _parse_webull_csv(self, csv_content: str) -> List[Dict[str, Any]]:
        """Parse Webull CSV format"""
        csv_file = io.StringIO(csv_content)
        reader = csv.DictReader(csv_file)
        
        events = []
        row_number = 1
        
        for row in reader:
            row_number += 1
            try:
                # Handle different time column names
                filled_time_val = row.get('Filled Time') or row.get('Executed Time')
                placed_time_val = row.get('Placed Time') or filled_time_val
                
                # For cancelled/pending orders, we might not have filled time
                if row.get('Status', '').upper() in ['CANCELLED', 'PENDING']:
                    # Use placed time for cancelled/pending orders
                    if not placed_time_val:
                        continue
                    time_to_use = placed_time_val
                else:
                    # For filled orders, require filled time
                    if not filled_time_val or (isinstance(filled_time_val, str) and filled_time_val.strip() == ''):
                        continue
                    time_to_use = filled_time_val
                
                # Helper function to safely convert to string and strip
                def safe_strip(value, default=''):
                    if value is None:
                        return default
                    return str(value).strip()
                
                # Parse symbol and detect if it's options
                symbol = safe_strip(row['Symbol']).upper()
                
                # Auto-detect options from symbol format (e.g., INTC250926C00030000)
                from app.utils.options_parser import is_options_symbol, parse_options_symbol, convert_options_price
                
                is_options = is_options_symbol(symbol)
                options_info = None
                if is_options:
                    options_info = parse_options_symbol(symbol)
                
                # Parse base prices
                order_price = self._parse_price(safe_strip(row.get('Price'), '0'))
                avg_price = self._parse_price(safe_strip(row.get('Avg Price') or row.get('Filled Price') or row.get('Price'), '0'))
                
                # Apply options multiplier if this is an options contract
                if is_options:
                    order_price = convert_options_price(order_price)
                    avg_price = convert_options_price(avg_price)
                
                # Normalize the side value using action_mappings from broker profile
                raw_side = safe_strip(row['Side'])
                normalized_side = self.broker_profile.action_mappings.get(raw_side, raw_side.upper())
                
                event_data = {
                    'symbol': symbol,
                    'side': normalized_side,  # Use normalized side
                    'status': safe_strip(row['Status']),
                    'filled_qty': int(float(safe_strip(row.get('Filled Qty') or row.get('Filled'), '0'))),
                    'total_qty': int(float(safe_strip(row.get('Total Qty'), '0'))),
                    'order_price': order_price,
                    'avg_price': avg_price,
                    'time_in_force': safe_strip(row.get('Time-in-Force', '')),
                    'placed_time': self._parse_datetime(safe_strip(placed_time_val)),
                    'filled_time': self._parse_datetime(safe_strip(time_to_use)),
                    'is_stop_loss': safe_strip(row.get('Is_Stop_Loss', 'False')).lower() == 'true',
                    'stop_loss_reason': safe_strip(row.get('Stop_Loss_Reason', '')),
                    'instrument_type': 'OPTIONS' if is_options else safe_strip(row.get('Instrument_Type', 'Stock')),
                    'options_info': options_info,
                    'row_number': row_number
                }
                
                # For cancelled/pending orders, use total_qty as the quantity since filled_qty would be 0
                if event_data['status'].upper() in ['CANCELLED', 'PENDING']:
                    event_data['filled_qty'] = event_data['total_qty']
                
                # Validate required fields
                if not event_data['symbol']:
                    raise ImportValidationError("Symbol cannot be empty", row_number, 'Symbol')
                
                # Only validate filled orders - cancelled/pending orders can have empty prices and 0 quantities
                if event_data['status'].upper() == 'FILLED':
                    if event_data['filled_qty'] <= 0:
                        raise ImportValidationError("Filled quantity must be positive for filled orders", row_number, 'Filled')
                    
                    if event_data['avg_price'] <= 0:
                        # Log warning instead of raising error to help debug
                        logger.warning(f"Row {row_number}: Filled order with zero/invalid price - Symbol: {event_data['symbol']}, Side: {event_data['side']}, Qty: {event_data['filled_qty']}")
                        raise ImportValidationError("Average price must be positive for filled orders", row_number, 'Avg Price')
                
                events.append(event_data)
                
            except ImportValidationError:
                raise
            except Exception as e:
                raise ImportValidationError(f"Error parsing row: {str(e)}", row_number)
        
        return events
    
    def _parse_datetime(self, date_str: str) -> datetime:
        """Parse datetime string"""
        if not date_str:
            raise ValueError("Empty datetime string")
        
        # Convert to string if needed
        date_str = str(date_str)
        
        # Remove timezone abbreviations (EDT, EST, etc.) as we'll treat everything as local time
        date_str_clean = date_str.strip()
        timezone_abbrevs = ['EDT', 'EST', 'PDT', 'PST', 'CDT', 'CST', 'MDT', 'MST']
        for tz in timezone_abbrevs:
            if date_str_clean.endswith(f' {tz}'):
                date_str_clean = date_str_clean[:-4].strip()  # Remove ' TZ'
                break
        
        # Handle Webull format: "2025-08-15 10:52:21"
        try:
            return datetime.strptime(date_str_clean, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            # Try alternative formats
            formats = [
                '%m/%d/%Y %H:%M:%S',  # 09/19/2025 15:50:40
                '%Y-%m-%d %H:%M',
                '%m/%d/%Y %H:%M'
            ]
            
            for fmt in formats:
                try:
                    return datetime.strptime(date_str_clean, fmt)
                except ValueError:
                    continue
            
            raise ValueError(f"Unable to parse datetime: {date_str}")
    
    def _parse_price(self, price_str: str) -> float:
        """Parse price string, handling @ prefix from limit orders and market orders"""
        if not price_str:
            return 0.0
        
        # Convert to string if it's already a number
        price_clean = str(price_str).strip()
        
        # Remove @ symbol if present (limit order indicator)
        if price_clean.startswith('@'):
            price_clean = price_clean[1:]
        
        # Handle market orders - return 0 as placeholder
        if price_clean.upper() in ['MARKET', 'MKT']:
            return 0.0
        
        try:
            return float(price_clean)
        except ValueError:
            raise ValueError(f"Unable to parse price: {price_str}")
    
    def _sort_key(self, event):
        """Sort key for deterministic ordering"""
        filled_time = event['filled_time']
        # Secondary sort by side to ensure deterministic ordering for same timestamps
        # BUY first, then SHORT, then SELL (handles stop-loss scenarios)
        side_priority = {'Buy': 1, 'Short': 2, 'Sell': 3}.get(event['side'], 4)
        return (filled_time, side_priority)
    
    def _detect_stop_losses(self, events: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Detect stop loss orders by matching buy events with their corresponding cancelled sell orders"""
        enhanced_events = []
        pending_orders_data = []
        
        # Group events by symbol to analyze position context
        from collections import defaultdict
        symbol_groups = defaultdict(list)
        
        for event in events:
            symbol = event['symbol']
            symbol_groups[symbol].append(event)
        
        # Process each symbol group to detect stop losses
        for symbol, symbol_events in symbol_groups.items():
            # Sort events by time to understand position flow
            symbol_events.sort(key=lambda x: x['filled_time'])
            
            # Separate filled vs cancelled/pending orders
            filled_events = [e for e in symbol_events if e['status'].upper() == 'FILLED']
            cancelled_events = [e for e in symbol_events if e['status'].upper() == 'CANCELLED']
            pending_events = [e for e in symbol_events if e['status'].upper() == 'PENDING']
            
            # Also identify FILLED sell orders that were stop losses (placed at same time as buy, filled later)
            # These are stop losses that got triggered, not manual sells
            stop_loss_sells = []
            for e in filled_events:
                if e['side'].upper() == 'SELL' and e.get('placed_time') and e.get('filled_time'):
                    # If placed_time != filled_time, this was a pending order that got filled (likely stop loss)
                    if e['placed_time'] != e['filled_time']:
                        stop_loss_sells.append(e)
            
            msg = f"Symbol {symbol}: {len(filled_events)} filled, {len(cancelled_events)} cancelled, {len(pending_events)} pending, {len(stop_loss_sells)} triggered stops"
            logger.info(msg)
            print(f"[IMPORT] {msg}")
            
            # Process filled events and match each BUY with its corresponding cancelled/pending SELL
            # Track running position to match stop losses with correct buys
            position_shares = 0
            used_stop_orders = set()  # Track which cancelled orders we've already matched
            
            for event in filled_events:
                stop_loss_price = None
                
                # For BUY events, look for a corresponding stop loss order (cancelled, pending, or triggered)
                if event['side'].upper() == 'BUY':
                    event_time = event['filled_time']
                    buy_shares = event['filled_qty']
                    position_shares += buy_shares
                    
                    logger.debug(f"Processing BUY: {buy_shares} shares at {event_time}, position size now {position_shares}")
                    
                    # Strategy 1: Match with FILLED sells that were placed at same time (triggered stop losses)
                    # These are stop orders that got executed
                    matching_stops = [e for e in stop_loss_sells
                                    if e.get('placed_time') == event_time and
                                    e.get('filled_qty', e.get('total_qty', 0)) == buy_shares and
                                    id(e) not in used_stop_orders]
                    
                    # Strategy 2: Match cancelled sells with SAME placed_time and matching quantity
                    if not matching_stops:
                        matching_stops = [e for e in cancelled_events 
                                        if e['side'].upper() == 'SELL' and 
                                        e.get('placed_time') == event_time and
                                        e.get('filled_qty', e.get('total_qty', 0)) == buy_shares and
                                        id(e) not in used_stop_orders]
                    
                    # Strategy 3: Try matching with current position size (for both triggered and cancelled)
                    if not matching_stops:
                        matching_stops = [e for e in stop_loss_sells
                                        if e.get('placed_time') == event_time and
                                        e.get('filled_qty', e.get('total_qty', 0)) == position_shares and
                                        id(e) not in used_stop_orders]
                    
                    if not matching_stops:
                        matching_stops = [e for e in cancelled_events 
                                        if e['side'].upper() == 'SELL' and 
                                        e.get('placed_time') == event_time and
                                        e.get('filled_qty', e.get('total_qty', 0)) == position_shares and
                                        id(e) not in used_stop_orders]
                    
                    # Strategy 4: Also check pending sell orders placed at same time
                    if not matching_stops:
                        matching_stops = [e for e in pending_events 
                                        if e['side'].upper() == 'SELL' and 
                                        e.get('placed_time') == event_time and
                                        (e.get('filled_qty', e.get('total_qty', 0)) == buy_shares or 
                                         e.get('filled_qty', e.get('total_qty', 0)) == position_shares) and
                                        id(e) not in used_stop_orders]
                    
                    if matching_stops:
                        # Use the first matching stop order
                        stop_order = matching_stops[0]
                        used_stop_orders.add(id(stop_order))
                        
                        # For stop orders, use order_price (for cancelled/pending) or avg_price (for filled stops)
                        stop_loss_price = self._parse_price(stop_order.get('order_price', stop_order.get('avg_price')))
                        if stop_loss_price:
                            event['stop_loss'] = stop_loss_price
                            if stop_order in stop_loss_sells:
                                match_type = "TRIGGERED"
                            elif stop_order in pending_events:
                                match_type = "PENDING"
                            else:
                                match_type = "CANCELLED"
                            stop_qty = stop_order.get('filled_qty', stop_order.get('total_qty', 0))
                            msg = f"✓ Matched BUY {buy_shares} shares at {event_time} with {match_type} sell stop loss at ${stop_loss_price} (stop qty: {stop_qty}, position size: {position_shares})"
                            logger.info(msg)
                            print(f"[IMPORT] {msg}")
                        else:
                            logger.warning(f"Found matching stop order for BUY at {event_time} but no valid price: order_price={stop_order.get('order_price')}, avg_price={stop_order.get('avg_price')}")
                    else:
                        msg = f"✗ No matching stop order found for BUY {buy_shares} shares at {event_time} (position size: {position_shares})"
                        logger.warning(msg)
                        print(f"[IMPORT] {msg}")
                
                elif event['side'].upper() == 'SELL':
                    # Track position reduction
                    position_shares -= event['filled_qty']
                    # SELL events don't need stop losses as the risk was already realized
            
            # Add all filled events (enhanced with stop loss info)
            enhanced_events.extend(filled_events)
            
            # Collect pending orders for this symbol (will be stored after positions are created)
            for pending_event in pending_events:
                # For pending orders, use order_price (the intended stop loss price) not avg_price (which is empty)
                price = self._parse_price(pending_event.get('order_price', pending_event.get('avg_price')))
                pending_order_data = {
                    'symbol': symbol,
                    'side': pending_event['side'],
                    'status': pending_event['status'],
                    'shares': pending_event.get('total_qty', pending_event.get('filled_qty', 0)),
                    'price': price,
                    'order_type': pending_event.get('order_type', 'Unknown'),
                    'placed_time': pending_event['filled_time'],  # Use filled_time as placed_time for pending
                    'stop_loss': price if pending_event['side'].upper() == 'SELL' else self._parse_price(pending_event.get('stop_loss')),
                    'take_profit': self._parse_price(pending_event.get('take_profit')),
                    'notes': f"Imported pending order: {pending_event.get('order_type', 'Unknown')}"
                }
                pending_orders_data.append(pending_order_data)
            
            # Also collect cancelled orders that might be relevant
            for cancelled_event in cancelled_events:
                # For cancelled orders, use order_price (the intended stop loss price) not avg_price
                price = self._parse_price(cancelled_event.get('order_price', cancelled_event.get('avg_price')))
                cancelled_order_data = {
                    'symbol': symbol,
                    'side': cancelled_event['side'],
                    'status': 'cancelled',
                    'shares': cancelled_event.get('total_qty', cancelled_event.get('filled_qty', 0)),
                    'price': price,
                    'order_type': cancelled_event.get('order_type', 'Unknown'),
                    'placed_time': cancelled_event['filled_time'],
                    'stop_loss': price if cancelled_event['side'].upper() == 'SELL' else self._parse_price(cancelled_event.get('stop_loss')),
                    'take_profit': self._parse_price(cancelled_event.get('take_profit')),
                    'notes': f"Imported cancelled order: {cancelled_event.get('order_type', 'Unknown')}"
                }
                pending_orders_data.append(cancelled_order_data)
        
        return enhanced_events, pending_orders_data
    
    def _store_pending_orders(self, pending_orders_data: List[Dict[str, Any]], tracker: 'IndividualPositionTracker', user_id: int):
        """Store pending orders and link them to their respective positions"""
        try:
            for order_data in pending_orders_data:
                symbol = order_data['symbol']
                
                # Find the current open position for this symbol
                current_position = None
                if symbol in tracker.symbol_positions:
                    # Get the most recent open position for this symbol
                    for position in reversed(tracker.symbol_positions[symbol]):
                        if position.status == PositionStatus.OPEN:
                            current_position = position
                            break
                
                if current_position:
                    # Create ImportedPendingOrder record
                    pending_order = ImportedPendingOrder(
                        symbol=symbol,
                        side=order_data['side'],
                        status=OrderStatus.PENDING if order_data['status'].upper() == 'PENDING' else OrderStatus.CANCELLED,
                        shares=int(order_data['shares']) if order_data['shares'] else 0,
                        price=order_data['price'],
                        order_type=order_data.get('order_type'),
                        placed_time=order_data['placed_time'],
                        stop_loss=order_data.get('stop_loss'),
                        take_profit=order_data.get('take_profit'),
                        user_id=user_id,
                        position_id=current_position.id,
                        notes=order_data.get('notes')
                    )
                    
                    self.db.add(pending_order)
                    logger.info(f"Stored pending order: {symbol} {order_data['side']} {order_data['shares']} @ {order_data['price']}")
                else:
                    logger.warning(f"No open position found for pending order: {symbol} {order_data['side']}")
            
            # Commit all pending orders
            self.db.commit()
            logger.info(f"Successfully stored {len(pending_orders_data)} pending orders")
            
        except Exception as e:
            logger.error(f"Error storing pending orders: {e}")
            self.db.rollback()
            raise e

    def _format_error(self, error: ImportValidationError) -> Dict[str, Any]:
        """Format error for API response"""
        return {
            'message': error.message,
            'row_number': error.row_number,
            'field': error.field
        }