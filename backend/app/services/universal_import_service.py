"""
Universal CSV Import Service using Broker Profiles

This service extends the import functionality to support multiple broker formats
using the broker profile system. It wraps the existing IndividualPositionImportService
with universal CSV parsing capabilities.
"""

import csv
import io
import logging
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session

from app.services.broker_profiles import (
    BrokerProfile,
    detect_broker_format,
    get_broker_profile,
    map_csv_columns,
    parse_date_flexible,
    clean_currency_value,
    WEBULL_USA_PROFILE,
)
from app.services.import_service import (
    IndividualPositionImportService,
    IndividualPositionTracker,
    ImportValidationError,
)
from app.services.account_value_service import AccountValueService
from app.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)


class UniversalImportService:
    """Universal CSV import service supporting multiple broker formats"""
    
    def __init__(self, db: Session):
        self.db = db
        self.account_value_service = AccountValueService(db)
        self.validation_errors: List[ImportValidationError] = []
        self.warnings: List[str] = []
        self.base_import_service = IndividualPositionImportService(db)
    
    def import_csv(
        self,
        csv_content: str,
        user_id: int,
        broker_name: Optional[str] = None,
        custom_column_map: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Universal CSV import supporting multiple broker formats.
        
        Args:
            csv_content: Raw CSV file content
            user_id: User ID to import for
            broker_name: Optional broker name to force specific profile
            custom_column_map: Optional custom column mapping {field: csv_column}
        
        Returns:
            Import result dictionary with success status and statistics
        """
        try:
            # Reset validation state
            self.validation_errors = []
            self.warnings = []
            
            # Parse CSV into DataFrame
            try:
                df = pd.read_csv(io.StringIO(csv_content))
            except Exception as e:
                return {
                    'success': False,
                    'error': f"Failed to parse CSV: {str(e)}",
                    'broker_detected': None
                }
            
            if df.empty:
                return {
                    'success': False,
                    'error': "CSV file is empty",
                    'broker_detected': None
                }
            
            # Detect or get broker profile
            if broker_name:
                broker_profile = get_broker_profile(broker_name)
                if not broker_profile:
                    return {
                        'success': False,
                        'error': f"Unknown broker: {broker_name}",
                        'broker_detected': None
                    }
                broker_detected = broker_name
            else:
                broker_profile = detect_broker_format(df)
                if not broker_profile:
                    return {
                        'success': False,
                        'error': "Could not auto-detect broker format. Please specify broker or provide custom column mapping.",
                        'broker_detected': None,
                        'available_columns': list(df.columns)
                    }
                broker_detected = broker_profile.name
                self.warnings.append(f"Auto-detected broker format: {broker_profile.display_name}")
            
            # Map CSV columns to standard fields
            if custom_column_map:
                column_map = custom_column_map
            else:
                column_map = map_csv_columns(df, broker_profile)
            
            # Validate required columns are mapped
            required_fields = ['symbol', 'action', 'quantity', 'price', 'date']
            missing_fields = []
            for field in required_fields:
                if field not in column_map or column_map[field] is None:
                    missing_fields.append(field)
            
            if missing_fields:
                return {
                    'success': False,
                    'error': f"Missing required fields: {', '.join(missing_fields)}",
                    'broker_detected': broker_detected,
                    'column_map': column_map,
                    'available_columns': list(df.columns)
                }
            
            # Convert DataFrame to standardized event format
            events = self._convert_df_to_events(df, broker_profile, column_map)
            
            if not events:
                return {
                    'success': False,
                    'error': "No valid events found in CSV",
                    'broker_detected': broker_detected
                }
            
            # Detect stop losses from cancelled orders (similar to IndividualPositionImportService)
            events = self._detect_stop_losses_universal(events)
            
            # Process events using individual position tracking
            tracker = IndividualPositionTracker(self.db, user_id, self.account_value_service)
            
            imported_count = 0
            
            for event_data in events:
                # Only process filled/completed orders
                status = event_data.get('status', 'FILLED').upper()
                if status in ['FILLED', 'COMPLETED', 'EXECUTED']:
                    try:
                        position = tracker.add_event(event_data)
                        imported_count += 1
                    except Exception as e:
                        logger.error(f"Error processing event: {e}")
                        self.validation_errors.append(
                            ImportValidationError(f"Error processing event: {str(e)}")
                        )
            
            if self.validation_errors:
                self.db.rollback()
                return {
                    'success': False,
                    'errors': [self._format_error(e) for e in self.validation_errors],
                    'warnings': self.warnings,
                    'broker_detected': broker_detected
                }
            
            # Commit all changes
            self.db.commit()
            
            # Get position statistics
            all_positions = [p for positions in tracker.symbol_positions.values() for p in positions]
            open_positions = [p for p in all_positions if p.status.value == 'open']
            
            return {
                'success': True,
                'broker_detected': broker_detected,
                'broker_display_name': broker_profile.display_name,
                'imported_events': imported_count,
                'total_positions': len(all_positions),
                'open_positions': len(open_positions),
                'warnings': self.warnings
            }
            
        except Exception as e:
            self.db.rollback()
            logger.exception(f"Universal import failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'imported_events': 0,
                'broker_detected': broker_detected if 'broker_detected' in locals() else None
            }
    
    def _convert_df_to_events(
        self,
        df: pd.DataFrame,
        broker_profile: BrokerProfile,
        column_map: Dict[str, Optional[str]]
    ) -> List[Dict[str, Any]]:
        """
        Convert DataFrame rows to standardized event format using broker profile.
        
        Returns list of event dictionaries compatible with IndividualPositionTracker.
        """
        events = []
        
        for idx, row in df.iterrows():
            try:
                # Extract and clean symbol
                symbol_col = column_map.get('symbol')
                symbol = str(row[symbol_col]).strip().upper() if symbol_col else None
                if not symbol or symbol == 'NAN':
                    continue
                
                # Extract and map action
                action_col = column_map.get('action')
                action_raw = str(row[action_col]).strip() if action_col else None
                if not action_raw:
                    continue
                
                # Map action using broker profile - try exact match first, then uppercase
                action = broker_profile.action_mappings.get(action_raw)
                if not action:
                    action = broker_profile.action_mappings.get(action_raw.upper())
                if not action:
                    action = broker_profile.action_mappings.get(action_raw.lower())
                if not action:
                    # No mapping found, use as-is and uppercase it
                    action = action_raw.upper()
                    
                if action not in ['BUY', 'SELL', 'SHORT']:
                    self.warnings.append(f"Row {idx + 2}: Unknown action '{action_raw}', skipping")
                    continue
                
                # Extract quantity
                quantity_col = column_map.get('quantity')
                try:
                    quantity = int(float(row[quantity_col]))
                    if quantity <= 0:
                        continue
                except (ValueError, TypeError, KeyError):
                    self.warnings.append(f"Row {idx + 2}: Invalid quantity, skipping")
                    continue
                
                # Get status first to handle cancelled orders differently
                status_col = column_map.get('status')
                status = str(row[status_col]).strip().upper() if status_col and status_col in df.columns and pd.notna(row.get(status_col)) else 'FILLED'
                
                # Extract and clean price
                # For CANCELLED orders, use the "Price" column (order/limit price)
                # For FILLED orders, use mapped price column (typically "Avg Price")
                price = 0.0
                is_options = False  # Track if this is an options trade (for Webull USA)
                
                # Detect options for Webull USA (before price parsing)
                if broker_profile.name == 'webull_usa':
                    from app.utils.options_parser import is_options_symbol, parse_options_symbol
                    is_options = is_options_symbol(symbol)
                
                if status == 'CANCELLED':
                    # Cancelled orders have empty Avg Price, use Price column for stop loss price
                    price_cols = ['Price', 'Limit Price', 'Order Price']
                    for col in price_cols:
                        if col in df.columns and pd.notna(row.get(col)):
                            try:
                                price = clean_currency_value(row[col])
                                if price > 0:
                                    # Apply options multiplier for Webull USA options
                                    if is_options and broker_profile.name == 'webull_usa':
                                        from app.utils.options_parser import convert_options_price
                                        price = convert_options_price(price)
                                    break
                            except:
                                continue
                    # If no valid price found, skip this cancelled order
                    if price <= 0:
                        continue
                else:
                    # For filled orders, use the mapped price column
                    price_col = column_map.get('price')
                    try:
                        price = clean_currency_value(row[price_col])
                        if price <= 0:
                            self.warnings.append(f"Row {idx + 2}: Invalid price, skipping")
                            continue
                        # Apply options multiplier for Webull USA options
                        if is_options and broker_profile.name == 'webull_usa':
                            from app.utils.options_parser import convert_options_price
                            price = convert_options_price(price)
                    except (ValueError, TypeError, KeyError):
                        self.warnings.append(f"Row {idx + 2}: Invalid price, skipping")
                        continue
                
                # Parse date
                date_col = column_map.get('date')
                date_value = row[date_col] if date_col else None
                
                # For CANCELLED orders, Filled Time is empty - use Placed Time instead
                if status == 'CANCELLED' and (pd.isna(date_value) or date_value is None):
                    # Try to get Placed Time for cancelled orders
                    placed_time_cols = ['Placed Time', 'Submission Time', 'Order Time']
                    for col in placed_time_cols:
                        if col in df.columns and pd.notna(row.get(col)):
                            date_value = row[col]
                            break
                
                # Try to combine date and time if separate columns exist (but only if date_value is valid)
                time_col = column_map.get('time')
                if time_col and time_col in row and pd.notna(date_value):
                    time_value = row[time_col]
                    if pd.notna(time_value):
                        date_value = f"{date_value} {time_value}"
                
                # Skip if still no valid date
                if pd.isna(date_value) or date_value is None:
                    continue
                
                filled_time = parse_date_flexible(date_value, broker_profile.date_formats)
                if not filled_time:
                    self.warnings.append(f"Row {idx + 2}: Could not parse date '{date_value}', skipping")
                    continue
                
                # Extract optional fields
                commission_col = column_map.get('commission')
                if commission_col and commission_col in df.columns and pd.notna(row.get(commission_col)):
                    commission = clean_currency_value(row[commission_col])
                else:
                    commission = 0.0
                
                stop_loss_col = column_map.get('stop_loss')
                if stop_loss_col and stop_loss_col in df.columns and pd.notna(row.get(stop_loss_col)):
                    stop_loss = clean_currency_value(row[stop_loss_col])
                else:
                    stop_loss = 0.0
                
                take_profit_col = column_map.get('take_profit')
                if take_profit_col and take_profit_col in df.columns and pd.notna(row.get(take_profit_col)):
                    take_profit = clean_currency_value(row[take_profit_col])
                else:
                    take_profit = 0.0
                
                # Detect options for Webull USA and parse options info
                options_info = None
                if is_options and broker_profile.name == 'webull_usa':
                    from app.utils.options_parser import parse_options_symbol
                    options_info = parse_options_symbol(symbol)
                
                # Build standardized event
                event = {
                    'symbol': symbol,
                    'side': action,
                    'filled_qty': quantity,
                    'avg_price': price,
                    'filled_time': filled_time,
                    'status': status,
                    'commission': commission,
                    'stop_loss': stop_loss,
                    'take_profit': take_profit,
                    'instrument_type': 'OPTIONS' if is_options else 'STOCK',
                    'options_info': options_info,
                    'notes': f"Imported from {broker_profile.display_name}"
                }
                
                events.append(event)
                
            except Exception as e:
                logger.warning(f"Row {idx + 2}: Error converting to event: {e}")
                continue
        
        # Sort events chronologically
        events.sort(key=lambda e: e['filled_time'])
        
        # For brokers that don't support shorting (like Webull Australia),
        # reorder same-timestamp BUY/SELL pairs to prevent short positions
        if broker_profile.name in ['webull_au']:
            events = self._reorder_wash_trades(events)
        
        return events
    
    def _detect_stop_losses_universal(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Detect stop loss orders by matching BUY events with their corresponding CANCELLED sell orders.
        Similar to IndividualPositionImportService._detect_stop_losses but adapted for universal format.
        """
        from collections import defaultdict
        
        # Group events by symbol
        symbol_groups = defaultdict(list)
        for event in events:
            symbol = event['symbol']
            symbol_groups[symbol].append(event)
        
        enhanced_events = []
        
        # Process each symbol group
        for symbol, symbol_events in symbol_groups.items():
            # Sort by time
            symbol_events.sort(key=lambda x: x['filled_time'])
            
            # Separate by status
            filled_events = [e for e in symbol_events if e['status'].upper() in ['FILLED', 'COMPLETED', 'EXECUTED']]
            cancelled_events = [e for e in symbol_events if e['status'].upper() == 'CANCELLED']
            
            # Match each BUY with corresponding CANCELLED sell orders
            for event in filled_events:
                if event['side'].upper() == 'BUY':
                    event_time = event['filled_time']
                    buy_shares = event['filled_qty']
                    
                    # Find matching cancelled sell orders
                    matching_stops = [e for e in cancelled_events 
                                    if e['side'].upper() == 'SELL' and 
                                    e['filled_time'] == event_time and
                                    e.get('filled_qty', 0) == buy_shares]
                    
                    if matching_stops:
                        stop_order = matching_stops[0]
                        # Use avg_price from cancelled order as stop loss
                        stop_loss_price = stop_order.get('avg_price', 0)
                        if stop_loss_price and stop_loss_price > 0:
                            event['stop_loss'] = stop_loss_price
                            logger.info(f"Matched BUY {buy_shares} shares of {symbol} at {event_time} with CANCELLED sell stop loss at {stop_loss_price}")
            
            enhanced_events.extend(filled_events)
        
        return enhanced_events
    
    def _reorder_wash_trades(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Reorder same-timestamp BUY/SELL pairs to prevent short positions.
        For brokers that don't support shorting (like Webull Australia),
        ensure BUY always comes before SELL at the same timestamp.
        
        This handles wash trades / day trades where both legs happen simultaneously.
        """
        from collections import defaultdict
        from datetime import datetime
        
        # Group events by symbol and timestamp
        grouped = defaultdict(list)
        for event in events:
            key = (event['symbol'], event['filled_time'])
            grouped[key].append(event)
        
        reordered_events = []
        
        for (symbol, timestamp), group in grouped.items():
            if len(group) > 1:
                # Check if we have both BUY and SELL at same timestamp
                has_buy = any(e['side'].upper() == 'BUY' for e in group)
                has_sell = any(e['side'].upper() == 'SELL' for e in group)
                
                if has_buy and has_sell:
                    # Reorder: BUY first, then SELL (prevents short position)
                    buys = [e for e in group if e['side'].upper() == 'BUY']
                    sells = [e for e in group if e['side'].upper() == 'SELL']
                    others = [e for e in group if e['side'].upper() not in ['BUY', 'SELL']]
                    
                    reordered_events.extend(buys)
                    reordered_events.extend(sells)
                    reordered_events.extend(others)
                    
                    logger.info(f"Reordered wash trade for {symbol} at {timestamp}: {len(buys)} BUY, {len(sells)} SELL")
                else:
                    reordered_events.extend(group)
            else:
                reordered_events.extend(group)
        
        # Re-sort to maintain chronological order (stable sort keeps our reordering within same timestamps)
        reordered_events.sort(key=lambda e: (e['filled_time'], 0 if e['side'].upper() == 'BUY' else 1))
        
        return reordered_events
    
    def validate_csv(
        self,
        csv_content: str,
        broker_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Validate CSV without importing (dry run).
        
        Returns validation results including detected broker, column mapping,
        and sample data preview.
        """
        try:
            # Parse CSV
            try:
                df = pd.read_csv(io.StringIO(csv_content))
            except Exception as e:
                return {
                    'valid': False,
                    'error': f"Failed to parse CSV: {str(e)}"
                }
            
            if df.empty:
                return {
                    'valid': False,
                    'error': "CSV file is empty"
                }
            
            # Detect or get broker profile
            if broker_name:
                broker_profile = get_broker_profile(broker_name)
                if not broker_profile:
                    return {
                        'valid': False,
                        'error': f"Unknown broker: {broker_name}"
                    }
                broker_detected = broker_name
            else:
                broker_profile = detect_broker_format(df)
                broker_detected = broker_profile.name if broker_profile else None
            
            # Build validation response
            # Replace NaN values with None for JSON serialization
            sample_df = df.head(3).fillna(value='')
            
            result = {
                'valid': broker_profile is not None,
                'broker_detected': broker_detected,
                'broker_display_name': broker_profile.display_name if broker_profile else None,
                'total_rows': len(df),
                'available_columns': list(df.columns),
                'sample_data': sample_df.to_dict('records')
            }
            
            if broker_profile:
                # Map columns
                column_map = map_csv_columns(df, broker_profile)
                result['column_map'] = column_map
                
                # Check required fields
                required_fields = ['symbol', 'action', 'quantity', 'price', 'date']
                missing_fields = [f for f in required_fields if not column_map.get(f)]
                result['missing_fields'] = missing_fields
                result['valid'] = len(missing_fields) == 0
                
                if not result['valid']:
                    result['error'] = f"Missing required columns: {', '.join(missing_fields)}"
            else:
                result['error'] = "Could not auto-detect broker format. Available columns: " + ", ".join(df.columns)
            
            return result
            
        except Exception as e:
            logger.exception("CSV validation failed")
            return {
                'valid': False,
                'error': str(e)
            }
    
    def _format_error(self, error: ImportValidationError) -> Dict[str, Any]:
        """Format validation error for API response"""
        return {
            'message': error.message,
            'row_number': error.row_number,
            'field': error.field
        }
