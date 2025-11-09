"""
Enhanced CSV Import Service
Robust system for importing trading data from CSV files with comprehensive validation
"""

import csv
import io
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.position_models import TradingPosition, TradingPositionEvent, EventType
from app.models import User
from app.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

class CSVValidationError(Exception):
    """Custom exception for CSV validation errors"""
    def __init__(self, message: str, row_number: int = None, field: str = None):
        self.message = message
        self.row_number = row_number
        self.field = field
        super().__init__(self.message)

class CSVImportService:
    """Service for importing and validating CSV trading data"""
    
    # Required CSV columns and their expected types
    REQUIRED_COLUMNS = {
        'date': str,
        'symbol': str,
        'action': str,  # BUY, SELL
        'quantity': (int, float, str),
        'price': (float, str),
    }
    
    # Optional columns that can enhance data
    OPTIONAL_COLUMNS = {
        'fees': (float, str),
        'notes': str,
        'stop_loss': (float, str),
        'instrument_type': str,  # stock, options
        'option_type': str,      # call, put
        'strike_price': (float, str),
        'expiration_date': str,
        'order_id': str,
        'account': str
    }
    
    # Valid values for specific fields
    VALID_ACTIONS = ['BUY', 'SELL', 'buy', 'sell']
    VALID_INSTRUMENT_TYPES = ['stock', 'options', 'STOCK', 'OPTIONS']
    VALID_OPTION_TYPES = ['call', 'put', 'CALL', 'PUT']
    
    def __init__(self, db: Session):
        self.db = db
        self.validation_errors: List[CSVValidationError] = []
        self.warnings: List[str] = []
    
    def validate_csv_structure(self, csv_content: str) -> Dict[str, Any]:
        """Validate CSV structure and return analysis"""
        try:
            # Parse CSV
            csv_file = io.StringIO(csv_content)
            reader = csv.DictReader(csv_file)
            
            # Check if file is empty
            headers = reader.fieldnames
            if not headers:
                raise CSVValidationError("CSV file is empty or has no headers")
            
            # Normalize column names (remove spaces, convert to lowercase)
            normalized_headers = [self._normalize_column_name(h) for h in headers]
            
            # Check for required columns
            missing_required = []
            for required_col in self.REQUIRED_COLUMNS:
                if required_col not in normalized_headers:
                    missing_required.append(required_col)
            
            if missing_required:
                raise CSVValidationError(f"Missing required columns: {', '.join(missing_required)}")
            
            # Count rows
            rows = list(reader)
            row_count = len(rows)
            
            if row_count == 0:
                raise CSVValidationError("CSV file contains no data rows")
            
            return {
                'valid': True,
                'headers': headers,
                'normalized_headers': normalized_headers,
                'row_count': row_count,
                'has_optional_columns': [col for col in self.OPTIONAL_COLUMNS if col in normalized_headers]
            }
            
        except Exception as e:
            if isinstance(e, CSVValidationError):
                raise
            raise CSVValidationError(f"Error parsing CSV: {str(e)}")
    
    def validate_and_parse_csv(self, csv_content: str, user_id: int) -> Dict[str, Any]:
        """Validate CSV content and parse into trading events"""
        # Reset validation state
        self.validation_errors = []
        self.warnings = []
        
        try:
            # Validate structure first
            structure_info = self.validate_csv_structure(csv_content)
            
            # Parse rows
            csv_file = io.StringIO(csv_content)
            reader = csv.DictReader(csv_file)
            
            # Normalize headers
            normalized_reader = self._normalize_csv_reader(reader)
            
            parsed_events = []
            row_number = 1  # Start from 1 (header is row 0)
            
            for row in normalized_reader:
                row_number += 1
                try:
                    event_data = self._parse_row(row, row_number)
                    if event_data:
                        parsed_events.append(event_data)
                except CSVValidationError as e:
                    e.row_number = row_number
                    self.validation_errors.append(e)
                except Exception as e:
                    self.validation_errors.append(
                        CSVValidationError(f"Unexpected error: {str(e)}", row_number)
                    )
            
            # Additional validations
            self._validate_position_consistency(parsed_events)
            self._check_for_duplicates(parsed_events, user_id)
            
            return {
                'valid': len(self.validation_errors) == 0,
                'events': parsed_events,
                'errors': [self._format_error(e) for e in self.validation_errors],
                'warnings': self.warnings,
                'summary': {
                    'total_rows': len(parsed_events),
                    'buy_events': len([e for e in parsed_events if e['action'].upper() == 'BUY']),
                    'sell_events': len([e for e in parsed_events if e['action'].upper() == 'SELL']),
                    'unique_symbols': len(set(e['symbol'] for e in parsed_events)),
                    'date_range': self._get_date_range(parsed_events)
                }
            }
            
        except CSVValidationError as e:
            return {
                'valid': False,
                'events': [],
                'errors': [self._format_error(e)],
                'warnings': [],
                'summary': {}
            }
    
    def import_events(self, parsed_events: List[Dict[str, Any]], user_id: int) -> Dict[str, Any]:
        """Import validated events into the database"""
        try:
            imported_count = 0
            skipped_count = 0
            position_updates = {}
            
            for event_data in parsed_events:
                try:
                    # Find or create position
                    position = self._find_or_create_position(event_data, user_id)
                    
                    # Create event
                    event = self._create_position_event(event_data, position.id, user_id)
                    
                    self.db.add(event)
                    imported_count += 1
                    
                    # Track position for updates
                    if position.id not in position_updates:
                        position_updates[position.id] = position
                    
                except Exception as e:
                    logger.error(f"Error importing event: {e}")
                    skipped_count += 1
                    continue
            
            # Commit all events
            self.db.commit()
            
            # Update position calculations
            for position in position_updates.values():
                self._update_position_totals(position)
            
            self.db.commit()
            
            return {
                'success': True,
                'imported_count': imported_count,
                'skipped_count': skipped_count,
                'total_positions_updated': len(position_updates)
            }
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Import failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'imported_count': 0,
                'skipped_count': len(parsed_events)
            }
    
    def _normalize_column_name(self, column_name: str) -> str:
        """Normalize column name for comparison"""
        return column_name.strip().lower().replace(' ', '_').replace('-', '_')
    
    def _normalize_csv_reader(self, reader):
        """Create reader with normalized column names"""
        for row in reader:
            normalized_row = {}
            for key, value in row.items():
                normalized_key = self._normalize_column_name(key)
                normalized_row[normalized_key] = value.strip() if value else ''
            yield normalized_row
    
    def _parse_row(self, row: Dict[str, str], row_number: int) -> Dict[str, Any]:
        """Parse a single CSV row into event data"""
        try:
            # Parse required fields
            symbol = self._parse_symbol(row.get('symbol', ''), row_number)
            action = self._parse_action(row.get('action', ''), row_number)
            quantity = self._parse_quantity(row.get('quantity', ''), row_number)
            price = self._parse_price(row.get('price', ''), row_number)
            trade_date = self._parse_date(row.get('date', ''), row_number)
            
            # Parse optional fields
            fees = self._parse_optional_float(row.get('fees'), 'fees', row_number, default=0.0)
            stop_loss = self._parse_optional_float(row.get('stop_loss'), 'stop_loss', row_number)
            notes = row.get('notes', '').strip()
            
            # Instrument type detection
            instrument_type = self._parse_instrument_type(row, symbol, row_number)
            
            # Option-specific fields
            option_data = self._parse_option_data(row, instrument_type, row_number)
            
            event_data = {
                'symbol': symbol,
                'action': action,
                'quantity': quantity,
                'price': price,
                'date': trade_date,
                'fees': fees,
                'stop_loss': stop_loss,
                'notes': notes,
                'instrument_type': instrument_type,
                'row_number': row_number
            }
            
            # Add option data if applicable
            if option_data:
                event_data.update(option_data)
            
            return event_data
            
        except CSVValidationError:
            raise
        except Exception as e:
            raise CSVValidationError(f"Error parsing row: {str(e)}", row_number)
    
    def _parse_symbol(self, value: str, row_number: int) -> str:
        """Parse and validate symbol"""
        symbol = value.upper().strip()
        if not symbol:
            raise CSVValidationError("Symbol cannot be empty", row_number, 'symbol')
        
        # Basic symbol validation
        if not symbol.replace('.', '').replace('-', '').isalnum():
            self.warnings.append(f"Row {row_number}: Unusual symbol format '{symbol}'")
        
        return symbol
    
    def _parse_action(self, value: str, row_number: int) -> str:
        """Parse and validate action"""
        action = value.upper().strip()
        if action not in [a.upper() for a in self.VALID_ACTIONS]:
            raise CSVValidationError(f"Invalid action '{value}'. Must be BUY or SELL", row_number, 'action')
        return action
    
    def _parse_quantity(self, value: str, row_number: int) -> int:
        """Parse and validate quantity"""
        try:
            quantity = int(float(value.replace(',', '')))
            if quantity <= 0:
                raise CSVValidationError("Quantity must be positive", row_number, 'quantity')
            return quantity
        except (ValueError, TypeError):
            raise CSVValidationError(f"Invalid quantity '{value}'", row_number, 'quantity')
    
    def _parse_price(self, value: str, row_number: int) -> Decimal:
        """Parse and validate price"""
        try:
            # Remove currency symbols and commas
            cleaned_value = value.replace('$', '').replace(',', '').strip()
            price = Decimal(cleaned_value)
            if price < 0:
                raise CSVValidationError("Price cannot be negative", row_number, 'price')
            return price
        except (ValueError, InvalidOperation):
            raise CSVValidationError(f"Invalid price '{value}'", row_number, 'price')
    
    def _parse_date(self, value: str, row_number: int) -> date:
        """Parse date with multiple format support"""
        if not value:
            raise CSVValidationError("Date cannot be empty", row_number, 'date')
        
        # Common date formats to try
        date_formats = [
            '%Y-%m-%d',
            '%m/%d/%Y',
            '%m-%d-%Y',
            '%d/%m/%Y',
            '%Y-%m-%d %H:%M:%S',
            '%m/%d/%Y %H:%M:%S'
        ]
        
        for fmt in date_formats:
            try:
                parsed_date = datetime.strptime(value.strip(), fmt).date()
                
                # Validate date range (not too far in past or future)
                today = date.today()
                if parsed_date > today:
                    self.warnings.append(f"Row {row_number}: Future date detected: {parsed_date}")
                elif (today - parsed_date).days > 3650:  # 10 years
                    self.warnings.append(f"Row {row_number}: Very old date detected: {parsed_date}")
                
                return parsed_date
                
            except ValueError:
                continue
        
        raise CSVValidationError(f"Invalid date format '{value}'. Expected formats: YYYY-MM-DD, MM/DD/YYYY", row_number, 'date')
    
    def _parse_optional_float(self, value: str, field_name: str, row_number: int, default=None) -> Optional[float]:
        """Parse optional float field"""
        if not value or value.strip() == '':
            return default
        
        try:
            cleaned_value = value.replace('$', '').replace(',', '').strip()
            return float(cleaned_value)
        except (ValueError, TypeError):
            raise CSVValidationError(f"Invalid {field_name} '{value}'", row_number, field_name)
    
    def _parse_instrument_type(self, row: Dict[str, str], symbol: str, row_number: int) -> str:
        """Determine instrument type"""
        explicit_type = row.get('instrument_type', '').strip().lower()
        
        if explicit_type:
            if explicit_type not in [t.lower() for t in self.VALID_INSTRUMENT_TYPES]:
                raise CSVValidationError(f"Invalid instrument type '{explicit_type}'", row_number, 'instrument_type')
            return explicit_type
        
        # Auto-detect based on symbol or other fields
        if any(opt_field in row and row[opt_field] for opt_field in ['option_type', 'strike_price', 'expiration_date']):
            return 'options'
        
        # Check symbol for option indicators
        if any(char in symbol for char in ['C', 'P']) and len(symbol) > 6:
            return 'options'
        
        return 'stock'  # Default
    
    def _parse_option_data(self, row: Dict[str, str], instrument_type: str, row_number: int) -> Optional[Dict[str, Any]]:
        """Parse option-specific data"""
        if instrument_type.lower() != 'options':
            return None
        
        option_data = {}
        
        # Option type
        option_type = row.get('option_type', '').strip().lower()
        if option_type:
            if option_type not in [t.lower() for t in self.VALID_OPTION_TYPES]:
                raise CSVValidationError(f"Invalid option type '{option_type}'", row_number, 'option_type')
            option_data['option_type'] = option_type
        
        # Strike price
        strike_price = self._parse_optional_float(row.get('strike_price'), 'strike_price', row_number)
        if strike_price is not None:
            option_data['strike_price'] = strike_price
        
        # Expiration date
        exp_date = row.get('expiration_date', '').strip()
        if exp_date:
            try:
                option_data['expiration_date'] = self._parse_date(exp_date, row_number)
            except CSVValidationError as e:
                e.field = 'expiration_date'
                raise
        
        return option_data if option_data else None
    
    def _validate_position_consistency(self, events: List[Dict[str, Any]]):
        """Validate that buy/sell quantities make sense"""
        symbol_totals = {}
        
        for event in events:
            symbol = event['symbol']
            action = event['action'].upper()
            quantity = event['quantity']
            
            if symbol not in symbol_totals:
                symbol_totals[symbol] = 0
            
            if action == 'BUY':
                symbol_totals[symbol] += quantity
            else:  # SELL
                symbol_totals[symbol] -= quantity
        
        # Check for over-selling
        for symbol, total in symbol_totals.items():
            if total < 0:
                self.warnings.append(f"Symbol {symbol}: More shares sold than bought (net: {total})")
    
    def _check_for_duplicates(self, events: List[Dict[str, Any]], user_id: int):
        """Check for potential duplicate events"""
        # Check within the import batch
        seen_events = set()
        for event in events:
            event_key = (
                event['symbol'],
                event['action'],
                event['quantity'],
                event['price'],
                event['date']
            )
            
            if event_key in seen_events:
                self.warnings.append(
                    f"Row {event['row_number']}: Potential duplicate event for {event['symbol']} on {event['date']}"
                )
            else:
                seen_events.add(event_key)
        
        # Check against existing database events (basic check)
        existing_events = self.db.query(TradingPositionEvent).filter(
            TradingPositionEvent.user_id == user_id
        ).all()
        
        for event in events:
            for existing in existing_events:
                if (existing.symbol == event['symbol'] and
                    existing.event_date.date() == event['date'] and
                    abs(float(existing.quantity) - event['quantity']) < 0.01 and
                    abs(float(existing.price) - float(event['price'])) < 0.01):
                    
                    self.warnings.append(
                        f"Row {event['row_number']}: Possible duplicate of existing event for {event['symbol']} on {event['date']}"
                    )
    
    def _get_date_range(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Get date range of events"""
        if not events:
            return {}
        
        dates = [event['date'] for event in events]
        return {
            'earliest': min(dates).isoformat(),
            'latest': max(dates).isoformat(),
            'span_days': (max(dates) - min(dates)).days
        }
    
    def _format_error(self, error: CSVValidationError) -> Dict[str, Any]:
        """Format error for API response"""
        return {
            'message': error.message,
            'row_number': error.row_number,
            'field': error.field
        }
    
    def _find_or_create_position(self, event_data: Dict[str, Any], user_id: int) -> TradingPosition:
        """Find existing position or create new one"""
        # For basic positions, we match by symbol and instrument type
        existing = self.db.query(TradingPosition).filter(
            TradingPosition.user_id == user_id,
            TradingPosition.symbol == event_data['symbol'],
            TradingPosition.instrument_type == event_data['instrument_type']
        ).first()
        
        if existing:
            return existing
        
        # Create new position
        position = TradingPosition(
            user_id=user_id,
            symbol=event_data['symbol'],
            instrument_type=event_data.get('instrument_type', 'stock'),
            option_type=event_data.get('option_type'),
            strike_price=event_data.get('strike_price'),
            expiration_date=event_data.get('expiration_date'),
            total_shares=0,
            average_cost=Decimal('0'),
            total_cost=Decimal('0'),
            created_at=utc_now()
        )
        
        self.db.add(position)
        self.db.flush()  # Get the ID
        return position
    
    def _create_position_event(self, event_data: Dict[str, Any], position_id: int, user_id: int) -> TradingPositionEvent:
        """Create a position event from parsed data"""
        event_type = EventType.BUY if event_data['action'].upper() == 'BUY' else EventType.SELL
        
        return TradingPositionEvent(
            user_id=user_id,
            position_id=position_id,
            event_type=event_type,
            symbol=event_data['symbol'],
            quantity=event_data['quantity'],
            price=event_data['price'],
            fees=Decimal(str(event_data['fees'])),
            event_date=datetime.combine(event_data['date'], datetime.min.time()),
            stop_loss=event_data.get('stop_loss'),
            notes=event_data.get('notes', ''),
            created_at=utc_now()
        )
    
    def _update_position_totals(self, position: TradingPosition):
        """Recalculate position totals based on events"""
        events = self.db.query(TradingPositionEvent).filter(
            TradingPositionEvent.position_id == position.id
        ).order_by(TradingPositionEvent.event_date).all()
        
        total_shares = 0
        total_cost = Decimal('0')
        
        for event in events:
            if event.event_type == EventType.BUY:
                total_shares += event.quantity
                total_cost += (event.price * event.quantity) + event.fees
            elif event.event_type == EventType.SELL:
                total_shares -= event.quantity
                # For sells, subtract the cost basis proportionally
                if total_shares > 0:
                    cost_per_share = total_cost / (total_shares + event.quantity)
                    total_cost -= cost_per_share * event.quantity
        
        position.total_shares = total_shares
        position.total_cost = total_cost
        position.average_cost = total_cost / total_shares if total_shares > 0 else Decimal('0')
        position.updated_at = utc_now()