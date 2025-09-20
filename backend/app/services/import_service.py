#!/usr/bin/env python3
"""
CSV Import Service for trade data
"""

import csv
import pandas as pd
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc

from app.models import ImportedOrder, ImportBatch, Position, PositionOrder, OrderStatus, OrderSide, Trade, User, InstrumentType, OptionType, TradeEntry, PartialExit
from app.services.trade_service import calculate_trade_metrics
from app.utils.options_parser import parse_options_symbol
from app.db.session import get_db
from app.utils.options_parser import parse_options_symbol, convert_options_price

class TradeImportService:
    
    def __init__(self, db: Session):
        self.db = db
    
    def parse_datetime(self, date_str: str) -> Optional[datetime]:
        """Parse datetime string from CSV"""
        if not date_str or date_str.strip() == "":
            return None
        
        try:
            # Format: "09/11/2025 09:48:06 EDT"
            # Remove timezone suffix for parsing
            clean_date = date_str.replace(" EDT", "").replace(" EST", "")
            return datetime.strptime(clean_date, "%m/%d/%Y %H:%M:%S")
        except ValueError:
            return None
    
    def parse_price(self, price_str: str) -> Optional[float]:
        """Parse price string, handling special cases"""
        if not price_str or price_str.strip() == "":
            return None
        
        # Remove @ symbol if present (indicates limit price)
        clean_price = price_str.replace("@", "")
        try:
            return float(clean_price)
        except ValueError:
            return None
    
    def import_csv_file(self, user_id: int, file_path: str, filename: str = None) -> ImportBatch:
        """Import CSV file and return import batch"""
        
        batch_id = str(uuid.uuid4())
        if not filename:
            filename = file_path.split("/")[-1]
        
        # Create import batch
        import_batch = ImportBatch(
            user_id=user_id,
            batch_id=batch_id,
            filename=filename,
            created_at=datetime.utcnow()
        )
        
        orders_imported = []
        stats = {
            "filled": 0,
            "pending": 0, 
            "cancelled": 0,
            "failed": 0
        }
        
        try:
            # Read all rows first, then process in reverse order (oldest to newest)
            all_rows = []
            with open(file_path, 'r', encoding='utf-8') as file:
                csv_reader = csv.DictReader(file)
                all_rows = list(csv_reader)
            
            # Process rows in reverse order (bottom to top = oldest to newest)
            print(f"Processing {len(all_rows)} rows in chronological order (oldest first)")
            print(f"Date range: {all_rows[-1].get('Placed Time', 'Unknown')} to {all_rows[0].get('Placed Time', 'Unknown')}")
            
            for row_num, row in enumerate(reversed(all_rows), 1):
                try:
                    # Parse order data
                    order = self._parse_order_row(row, user_id, batch_id)
                    if order:
                        orders_imported.append(order)
                        stats[order.status.lower()] += 1
                        if row_num <= 5 or row_num % 50 == 0:  # Log first 5 and every 50th order
                            print(f"Processed order {row_num}: {order.symbol} {order.side} {order.filled_qty} @ {order.placed_time}")
                        
                except Exception as e:
                    print(f"Error parsing row {row_num}: {e}")
                    continue
            
            # Update batch statistics
            import_batch.total_orders = len(orders_imported)
            import_batch.filled_orders = stats["filled"]
            import_batch.pending_orders = stats["pending"] 
            import_batch.cancelled_orders = stats["cancelled"]
            import_batch.failed_orders = stats["failed"]
            
            # Save to database
            self.db.add(import_batch)
            self.db.add_all(orders_imported)
            self.db.commit()
            
            return import_batch
            
        except Exception as e:
            self.db.rollback()
            raise Exception(f"Failed to import CSV: {str(e)}")
    
    def _parse_order_row(self, row: Dict[str, str], user_id: int, batch_id: str) -> Optional[ImportedOrder]:
        """Parse a single CSV row into an ImportedOrder"""
        
        try:
            # Parse required fields
            symbol = row.get("Symbol", "").strip()
            side = row.get("Side", "").strip()
            status = row.get("Status", "").strip()
            
            if not all([symbol, side, status]):
                return None
            
            # Parse quantities
            filled_qty = int(row.get("Filled", 0) or 0)
            total_qty = int(row.get("Total Qty", 0) or 0)
            
            # Parse pricing
            price = self.parse_price(row.get("Price", ""))
            avg_price = self.parse_price(row.get("Avg Price", ""))
            
            # Parse timestamps
            placed_time = self.parse_datetime(row.get("Placed Time", ""))
            filled_time = self.parse_datetime(row.get("Filled Time", ""))
            
            if not placed_time:
                return None
            
            order = ImportedOrder(
                user_id=user_id,
                company_name=row.get("Name", "").strip(),
                symbol=symbol,
                side=side,
                status=status,
                filled_qty=filled_qty,
                total_qty=total_qty,
                price=price,
                avg_price=avg_price,
                time_in_force=row.get("Time-in-Force", "").strip(),
                placed_time=placed_time,
                filled_time=filled_time,
                import_batch_id=batch_id,
                original_data=str(row)
            )
            
            return order
            
        except Exception as e:
            print(f"Error parsing order row: {e}")
            return None
    
    def process_orders_to_positions(self, user_id: int, batch_id: str = None, account_size: float = 10000) -> Dict[str, Any]:
        """Process imported orders into positions and trades"""
        
        # Get batch information to determine if this is an options import
        batch_info = None
        is_options_import = False
        if batch_id:
            batch_info = self.db.query(ImportBatch).filter(ImportBatch.batch_id == batch_id).first()
            if batch_info and batch_info.filename:
                is_options_import = 'options' in batch_info.filename.lower()
        
        # Get orders to process
        query = self.db.query(ImportedOrder).filter(
            ImportedOrder.user_id == user_id,
            ImportedOrder.processed == False
        )
        
        if batch_id:
            query = query.filter(ImportedOrder.import_batch_id == batch_id)
        
        # Process filled orders and cancelled stop losses (for risk analysis)
        from sqlalchemy import and_
        orders = query.filter(
            ImportedOrder.status.in_(["Filled", "Pending", "Open", "Working"]) |
            and_(ImportedOrder.status == "Cancelled", ImportedOrder.side == "Sell")  # Cancelled sell orders (likely stops)
        ).order_by(
            # Sort by filled_time if available, otherwise placed_time
            ImportedOrder.filled_time.asc().nullslast(),
            ImportedOrder.placed_time.asc()
        ).all()
        
        results = {
            "positions_created": 0,
            "positions_updated": 0, 
            "trades_created": 0,
            "orders_processed": 0
        }
        
        # Group orders by symbol for processing
        symbol_orders = {}
        for order in orders:
            if order.symbol not in symbol_orders:
                symbol_orders[order.symbol] = []
            symbol_orders[order.symbol].append(order)
        
        # Process each symbol
        for symbol, symbol_order_list in symbol_orders.items():
            # Ensure orders are sorted chronologically within each symbol by filled_time
            symbol_order_list.sort(key=lambda x: x.filled_time or x.placed_time)
            
            symbol_results = self._process_symbol_orders(user_id, symbol, symbol_order_list, account_size)
            
            results["positions_created"] += symbol_results["positions_created"]
            results["positions_updated"] += symbol_results["positions_updated"]
            results["trades_created"] += symbol_results["trades_created"]
            results["orders_processed"] += symbol_results["orders_processed"]
        
        self.db.commit()
        return results
    
    def _process_symbol_orders(self, user_id: int, symbol: str, orders: List[ImportedOrder], account_size: float = 10000) -> Dict[str, int]:
        """Process all orders for a specific symbol using FIFO matching"""
        
        results = {
            "positions_created": 0,
            "positions_updated": 0,
            "trades_created": 0, 
            "orders_processed": 0
        }
        
        # Get or create position for this symbol
        position = self.db.query(Position).filter(
            Position.user_id == user_id,
            Position.symbol == symbol,
            Position.is_open == True
        ).first()
        
        if not position:
            # Create new position
            position = Position(
                user_id=user_id,
                symbol=symbol,
                company_name=orders[0].company_name,
                quantity=0,
                avg_cost_basis=0.0,
                total_cost=0.0,
                realized_pnl=0.0,
                unrealized_pnl=0.0,
                opened_at=orders[0].placed_time,
                last_updated=datetime.utcnow()
            )
            self.db.add(position)
            self.db.flush()  # Flush to get the position ID
            results["positions_created"] = 1
        else:
            # Ensure existing position has proper default values
            if position.realized_pnl is None:
                position.realized_pnl = 0.0
            if position.unrealized_pnl is None:
                position.unrealized_pnl = 0.0
            if position.total_cost is None:
                position.total_cost = 0.0
            if position.quantity is None:
                position.quantity = 0
        
        # Process orders chronologically with sophisticated position tracking
        trades_created = self._process_chronological_orders_simple(position, orders, account_size)
        results["trades_created"] = trades_created
        
        # Mark all orders as processed
        for order in orders:
            order.processed = True
            results["orders_processed"] += 1
        
        # Update position
        position.last_updated = datetime.utcnow()
        if position.quantity == 0:
            position.is_open = False
            position.closed_at = datetime.utcnow()
        
        # Detect and update stop losses for completed trades retroactively
        stop_loss_updates = self._detect_retroactive_stop_losses(position.user_id, orders, account_size)
        if stop_loss_updates:
            # Update existing trades with detected stop losses
            for trade_id, stop_loss_price in stop_loss_updates.items():
                # Find and update the trade by ID
                trade = self.db.query(Trade).filter(Trade.id == trade_id).first()
                
                if trade:
                    # Update trade with stop loss
                    trade.stop_loss = stop_loss_price
                    
                    # Recalculate risk metrics now that we have stop loss
                    if trade.entry_price and trade.position_size:
                        metrics = self._calculate_imported_trade_metrics(
                            entry_price=trade.entry_price,
                            exit_price=trade.exit_price,
                            stop_loss=stop_loss_price,
                            take_profit=trade.take_profit,
                            position_size=trade.position_size,
                            trade_type=trade.trade_type,
                            account_size=account_size
                        )
                        
                        # Update risk calculations
                        trade.risk_per_share = metrics["risk_per_share"]
                        trade.total_risk = metrics["total_risk"]
                        trade.risk_reward_ratio = metrics["risk_reward_ratio"]
                    
                    results["stop_losses_detected"] = results.get("stop_losses_detected", 0) + 1
        
        results["positions_updated"] = 1
        return results
    
    def _detect_stop_loss_price(self, buy_order: ImportedOrder, all_orders: List[ImportedOrder]) -> Optional[float]:
        """
        Detect stop loss price by finding sell orders placed at the same time as the buy order
        with a price lower than the buy price.
        """
        if not buy_order.placed_time or not buy_order.avg_price:
            return None
            
        # Look for sell orders placed within a small time window of the buy order
        time_window_minutes = 5  # 5 minute window to account for slight timing differences
        buy_time = buy_order.placed_time
        
        potential_stop_losses = []
        
        for order in all_orders:
            # Must be a sell order for the same symbol
            if (order.side != "Sell" or 
                order.symbol != buy_order.symbol or 
                not order.placed_time or 
                not order.price):
                continue
                
            # Check if placed around the same time (within time window)
            time_diff = abs((order.placed_time - buy_time).total_seconds() / 60)
            if time_diff > time_window_minutes:
                continue
                
            # Stop loss should be at a price lower than buy price (for long positions)
            if order.price < buy_order.avg_price:
                potential_stop_losses.append({
                    'price': order.price,
                    'time_diff': time_diff,
                    'order': order
                })
        
        if not potential_stop_losses:
            return None
            
        # Return the stop loss with the smallest time difference (closest in time)
        closest_stop_loss = min(potential_stop_losses, key=lambda x: x['time_diff'])
        return closest_stop_loss['price']
    
    def _detect_retroactive_stop_losses(self, user_id: int, all_orders: List[ImportedOrder], account_size: float = 10000) -> Dict[int, float]:
        """
        Detect stop losses for already-completed trades by analyzing buy-sell order pairs.
        Returns a mapping of trade IDs to stop loss prices.
        """
        stop_loss_map = {}
        
        # Get all existing trades created from this import batch that don't have stop losses
        existing_trades = self.db.query(Trade).filter(
            Trade.user_id == user_id,
            Trade.setup_type == "imported",
            Trade.stop_loss.is_(None)
        ).all()
        
        if not existing_trades:
            return stop_loss_map
            
        # For each trade without a stop loss, try to find the original buy order
        for trade in existing_trades:
            # Find the buy order that matches this trade's entry
            # Look for buy orders with matching symbol, similar price, and sufficient quantity
            buy_orders = [order for order in all_orders 
                         if (order.side == "Buy" and 
                             order.symbol == trade.ticker and
                             order.avg_price and abs(order.avg_price - trade.entry_price) < 0.01 and
                             order.filled_qty and order.filled_qty >= trade.position_size)]
            
            if buy_orders:
                # Use the buy order with closest time to trade entry date
                closest_buy_order = min(buy_orders, 
                    key=lambda x: abs(((x.filled_time or x.placed_time) - trade.entry_date).total_seconds())
                    if (x.filled_time or x.placed_time) else float('inf'))
                
                if closest_buy_order.placed_time or closest_buy_order.filled_time:
                    stop_loss_price = self._detect_stop_loss_price(closest_buy_order, all_orders)
                    
                    if stop_loss_price:
                        stop_loss_map[trade.id] = stop_loss_price
                        print(f"Detected retroactive stop loss for {trade.ticker} trade ID {trade.id}: ${stop_loss_price:.2f}")
        
        return stop_loss_map
    
    def _calculate_imported_trade_metrics(self, entry_price: float, exit_price: float, stop_loss: float, 
                                        take_profit: float, position_size: float, trade_type: str = "LONG", 
                                        account_size: float = 10000):
        """Calculate trade metrics for imported trades with account size for risk calculations"""
        
        # Create a temporary trade-like object for metrics calculation
        class TempTrade:
            def __init__(self):
                self.entry_price = entry_price
                self.stop_loss = stop_loss
                self.take_profit = take_profit
                self.position_size = position_size
                self.trade_type = trade_type.lower()
        
        temp_trade = TempTrade()
        
        try:
            metrics = calculate_trade_metrics(temp_trade)
            
            # Add risk percentage calculation based on account size
            if metrics["total_risk"] is not None and account_size > 0:
                metrics["risk_percentage"] = (metrics["total_risk"] / account_size) * 100
            else:
                metrics["risk_percentage"] = None
                
            return metrics
        except Exception as e:
            print(f"Error calculating trade metrics: {e}")
            return {
                "position_value": position_size * entry_price,
                "risk_per_share": None,
                "total_risk": None,
                "risk_reward_ratio": None,
                "risk_percentage": None
            }

    def _process_buy_order(self, position: Position, order: ImportedOrder, buy_queue: List[Dict], all_orders: List[ImportedOrder] = None):
        """Process a buy order, adding to position and buy queue"""
        
        if order.filled_qty > 0 and order.avg_price:
            # Detect stop loss price if available
            stop_loss_price = None
            if all_orders:
                stop_loss_price = self._detect_stop_loss_price(order, all_orders)
            # Add to FIFO buy queue for later sell matching
            buy_queue.append({
                "order_id": order.id,
                "quantity": order.filled_qty,
                "price": order.avg_price,
                "date": order.filled_time or order.placed_time,
                "stop_loss": stop_loss_price
            })
            
            # Update position
            old_total_cost = position.total_cost or 0.0
            old_quantity = position.quantity or 0
            
            new_cost = order.filled_qty * order.avg_price
            position.total_cost = old_total_cost + new_cost
            position.quantity = old_quantity + order.filled_qty
            
            # Recalculate average cost basis
            if position.quantity > 0:
                position.avg_cost_basis = (position.total_cost or 0.0) / position.quantity
            
            # Create position order link
            if position.id is not None:
                pos_order = PositionOrder(
                    position_id=position.id,
                    imported_order_id=order.id,
                    quantity_contribution=order.filled_qty,
                    cost_contribution=new_cost
                )
                self.db.add(pos_order)
            else:
                # If position doesn't have ID yet, flush to get it
                print(f"Position ID is None, flushing to get ID for symbol {position.symbol}")
                self.db.flush()
                if position.id is not None:
                    pos_order = PositionOrder(
                        position_id=position.id,
                        imported_order_id=order.id,
                        quantity_contribution=order.filled_qty,
                        cost_contribution=new_cost
                    )
                    self.db.add(pos_order)
                else:
                    print(f"ERROR: Position ID is still None after flush for symbol {position.symbol}")
    
    def _process_sell_order(self, position: Position, order: ImportedOrder, buy_queue: List[Dict], account_size: float = 10000) -> int:
        """Process a sell order using FIFO matching against buy queue"""
        
        trades_created = 0
        
        # Handle filled orders normally
        if order.filled_qty > 0 and order.avg_price:
            remaining_to_sell = order.filled_qty
            
            # Check if we have enough buy orders to match this sell
            total_available = sum(entry["quantity"] for entry in buy_queue)
            
            if total_available < remaining_to_sell:
                # This might be a short sale or position transfer
                # Log the issue and skip for now
                print(f"WARNING: Sell order for {remaining_to_sell} {position.symbol} @ ${order.avg_price:.2f} "
                      f"but only {total_available} shares available in buy queue. Skipping.")
                return 0
            
            # Match against buy queue using FIFO
            while remaining_to_sell > 0 and buy_queue:
                buy_entry = buy_queue[0]
                
                # Determine quantities
                sell_qty = min(remaining_to_sell, buy_entry["quantity"])
                buy_price = buy_entry["price"]
                sell_price = order.avg_price
                
                # Calculate P&L
                cost_basis = sell_qty * buy_price
                proceeds = sell_qty * sell_price
                raw_pnl = proceeds - cost_basis
                
                # Parse options symbol first to determine if this is an options trade
                options_info = parse_options_symbol(position.symbol)
                
                # For options, P&L needs to be multiplied by 100 since prices are per contract
                # but represent 100 shares worth of value
                actual_pnl = raw_pnl * 100 if options_info['is_options'] else raw_pnl
                
                print(f"Creating trade: {sell_qty} {position.symbol} @ Buy ${buy_price:.2f} -> Sell ${sell_price:.2f}")
                if options_info['is_options']:
                    print(f"  Options P&L: Raw ${raw_pnl:.2f} -> Actual ${actual_pnl:.2f} (×100)")
                else:
                    print(f"  Stock P&L: ${actual_pnl:.2f}")
                
                # Store the raw prices as they come from the broker (contract prices for options)
                actual_buy_price = buy_price
                actual_sell_price = sell_price
                
                # Calculate trade metrics including risk calculations using actual prices
                stop_loss_price = buy_entry.get("stop_loss")
                metrics_stop_loss = stop_loss_price  # Store raw stop loss price
                
                metrics = self._calculate_imported_trade_metrics(
                    entry_price=actual_buy_price,
                    exit_price=actual_sell_price,
                    stop_loss=metrics_stop_loss,
                    take_profit=None,
                    position_size=sell_qty,
                    trade_type="LONG",
                    account_size=account_size
                )
                
                actual_position_value = metrics["position_value"]
                
                # Create trade record
                trade = Trade(
                    user_id=position.user_id,
                    ticker=options_info['ticker'] if options_info['is_options'] else position.symbol,
                    trade_type="LONG",  # This represents the original position direction
                    status="CLOSED",
                    trade_group_id=str(uuid.uuid4()),  # Generate unique trade group ID
                    
                    # Options fields
                    instrument_type=InstrumentType.OPTIONS if options_info['is_options'] else InstrumentType.STOCK,
                    strike_price=options_info['strike_price'] if options_info['is_options'] else None,
                    expiration_date=options_info['expiration_date'] if options_info['is_options'] else None,
                    option_type=OptionType.CALL if options_info['option_type'] == 'call' else OptionType.PUT if options_info['option_type'] == 'put' else None,
                    
                    position_size=sell_qty,
                    entry_price=actual_buy_price,
                    exit_price=actual_sell_price,
                    entry_date=buy_entry["date"],
                    exit_date=order.filled_time or order.placed_time,
                    profit_loss=actual_pnl,
                    position_value=actual_position_value,
                    entry_notes=f"Auto-generated from import batch{' (Options)' if options_info['is_options'] else ''}",
                    setup_type="Flag",
                    strategy="Breakout",  # Updated strategy for imported trades
                    timeframe=None,  # Not available from imported data
                    stop_loss=stop_loss_price,  # Use detected stop loss price
                    take_profit=None,  # Not available from imported data
                    risk_per_share=metrics["risk_per_share"],  # Now calculated
                    total_risk=metrics["total_risk"],  # Now calculated
                    risk_reward_ratio=metrics["risk_reward_ratio"],  # Now calculated
                    market_conditions=None,  # Not available from imported data
                    mistakes=None,  # Not available from imported data
                    lessons=None,  # Not available from imported data
                    account_balance_snapshot=account_size  # Snapshot the account balance at import time
                )
                
                # Link to imported order
                trade.imported_order_id = order.id
                
                self.db.add(trade)
                trades_created += 1
                
                # Update position
                position.quantity = (position.quantity or 0) - sell_qty
                position.total_cost = (position.total_cost or 0.0) - cost_basis
                position.realized_pnl = (position.realized_pnl or 0.0) + actual_pnl
                
                # Update buy queue
                buy_entry["quantity"] -= sell_qty
                remaining_to_sell -= sell_qty
                
                if buy_entry["quantity"] == 0:
                    buy_queue.pop(0)
            
            # Recalculate average cost basis
            if position.quantity > 0:
                position.avg_cost_basis = (position.total_cost or 0.0) / position.quantity
            else:
                position.avg_cost_basis = 0.0
        
        # Handle pending orders - these indicate remaining open positions
        elif order.status.lower() in ["pending", "open", "working"] and order.total_qty > 0:
            print(f"Found pending sell order for {order.total_qty} {position.symbol} @ ${order.price or 'market'}")
            
            # Check if we have enough remaining shares in buy_queue to create an open trade
            total_available = sum(entry["quantity"] for entry in buy_queue)
            print(f"  Available in buy queue: {total_available} shares")
            print(f"  Buy queue contents: {[(e['quantity'], e['price']) for e in buy_queue]}")
            
            if total_available >= order.total_qty:
                print(f"  ✅ Sufficient shares available. Creating open trade for {order.total_qty} shares")
                
                # Create an open trade for the pending sell order
                # Use FIFO to match against buy orders for the open position
                remaining_to_match = order.total_qty
                open_trade_entries = []
                
                # Collect the buy entries that would match this pending sell
                temp_queue = buy_queue.copy()
                while remaining_to_match > 0 and temp_queue:
                    buy_entry = temp_queue[0]
                    match_qty = min(remaining_to_match, buy_entry["quantity"])
                    
                    open_trade_entries.append({
                        "quantity": match_qty,
                        "entry_price": buy_entry["price"],
                        "entry_date": buy_entry["date"]
                    })
                    
                    print(f"    Matching {match_qty} shares @ ${buy_entry['price']:.2f}")
                    
                    remaining_to_match -= match_qty
                    buy_entry["quantity"] -= match_qty
                    
                    if buy_entry["quantity"] == 0:
                        temp_queue.pop(0)
                
                print(f"  Created {len(open_trade_entries)} open trade entries")
                
                # Create open trade(s) for the matched quantities
                for entry in open_trade_entries:
                    # Parse options symbol if it's an options trade
                    options_info = parse_options_symbol(position.symbol)
                    
                    # Store raw prices as they come from the broker
                    actual_entry_price = entry["entry_price"]
                    actual_position_value = entry["quantity"] * entry["entry_price"]
                    
                    trade = Trade(
                        user_id=position.user_id,
                        ticker=options_info['ticker'] if options_info['is_options'] else position.symbol,
                        trade_type="LONG",
                        status="ACTIVE",  # This is an open position
                        trade_group_id=str(uuid.uuid4()),  # Generate unique trade group ID
                        
                        # Options fields
                        instrument_type=InstrumentType.OPTIONS if options_info['is_options'] else InstrumentType.STOCK,
                        strike_price=options_info['strike_price'] if options_info['is_options'] else None,
                        expiration_date=options_info['expiration_date'] if options_info['is_options'] else None,
                        option_type=OptionType.CALL if options_info['option_type'] == 'call' else OptionType.PUT if options_info['option_type'] == 'put' else None,
                        
                        position_size=entry["quantity"],
                        entry_price=actual_entry_price,
                        exit_price=None,
                        entry_date=entry["entry_date"],
                        exit_date=None,
                        profit_loss=None,
                        position_value=actual_position_value,
                        entry_notes=f"Auto-generated open position from import batch (pending sell @ ${order.price or 'market'}){' (Options)' if options_info['is_options'] else ''}",
                        setup_type="Flag", 
                        strategy="Breakout",  # Updated strategy for imported trades
                        timeframe=None,
                        stop_loss=order.price if order.price else None,  # Use pending sell price as stop loss if available
                        take_profit=None,
                        risk_per_share=None,
                        total_risk=None,
                        risk_reward_ratio=None,
                        market_conditions=None,
                        mistakes=None,
                        lessons=None,
                        account_balance_snapshot=account_size  # Snapshot the account balance at import time
                    )
                    
                    # Link to the pending order
                    trade.imported_order_id = order.id
                    
                    self.db.add(trade)
                    trades_created += 1
                    
                    print(f"    ✅ Created OPEN trade: {entry['quantity']} {position.symbol} @ ${entry['entry_price']:.2f} with stop @ ${order.price or 'market'}")
                
                # Update the actual buy_queue to reflect the consumed entries
                buy_queue[:] = temp_queue
                print(f"  Updated buy queue. Remaining: {sum(e['quantity'] for e in buy_queue)} shares")
            else:
                print(f"  ❌ Insufficient shares in buy queue ({total_available}) for pending sell ({order.total_qty})")
        
        return trades_created
    
    def get_import_summary(self, user_id: int, batch_id: str = None) -> Dict[str, Any]:
        """Get summary of import results"""
        
        query = self.db.query(ImportBatch).filter(ImportBatch.user_id == user_id)
        
        if batch_id:
            batch = query.filter(ImportBatch.batch_id == batch_id).first()
            if not batch:
                return {}
            
            # Get order statistics for this batch
            orders = self.db.query(ImportedOrder).filter(
                ImportedOrder.import_batch_id == batch_id
            ).all()
            
            return {
                "batch_id": batch.batch_id,
                "filename": batch.filename,
                "total_orders": batch.total_orders,
                "filled_orders": batch.filled_orders,
                "pending_orders": batch.pending_orders,
                "cancelled_orders": batch.cancelled_orders,
                "failed_orders": batch.failed_orders,
                "created_at": batch.created_at,
                "completed_at": batch.completed_at
            }
        else:
            # Return summary of all imports
            batches = query.order_by(desc(ImportBatch.created_at)).all()
            
            return {
                "total_batches": len(batches),
                "batches": [{
                    "batch_id": b.batch_id,
                    "filename": b.filename,
                    "total_orders": b.total_orders,
                    "created_at": b.created_at
                } for b in batches[:10]]  # Return last 10 batches
            }
    
    def detect_stop_losses_for_all_trades(self, user_id: int, batch_id: str = None, account_size: float = 10000) -> Dict[str, Any]:
        """
        Comprehensive method to detect stop losses for all imported trades.
        Can be called after import completion to scan all trades for missing stop losses.
        """
        # Get all imported orders for analysis
        query = self.db.query(ImportedOrder).filter(ImportedOrder.user_id == user_id)
        if batch_id:
            query = query.filter(ImportedOrder.batch_id == batch_id)
        
        all_orders = query.order_by(ImportedOrder.placed_time).all()
        
        if not all_orders:
            return {"stop_losses_detected": 0, "trades_updated": 0}
        
        # Get all imported trades without stop losses
        trade_query = self.db.query(Trade).filter(
            Trade.user_id == user_id,
            Trade.setup_type == "imported",
            Trade.stop_loss.is_(None)
        )
        
        if batch_id:
            # Filter trades by import batch (look for trades created around the batch time)
            batch = self.db.query(ImportBatch).filter(
                ImportBatch.user_id == user_id,
                ImportBatch.batch_id == batch_id
            ).first()
            
            if batch:
                # Get trades created within a reasonable timeframe of the batch
                start_time = batch.created_at - timedelta(hours=1)
                end_time = batch.created_at + timedelta(hours=1)
                trade_query = trade_query.filter(
                    Trade.created_at >= start_time,
                    Trade.created_at <= end_time
                )
        
        trades_without_stop_loss = trade_query.all()
        
        if not trades_without_stop_loss:
            return {"stop_losses_detected": 0, "trades_updated": 0}
        
        stop_losses_detected = 0
        trades_updated = 0
        
        print(f"Analyzing {len(trades_without_stop_loss)} trades for stop loss detection...")
        
        # Process each trade
        for trade in trades_without_stop_loss:
            # Find matching buy orders for this trade
            matching_buy_orders = [
                order for order in all_orders
                if (order.side == "Buy" and
                    order.symbol == trade.ticker and
                    order.avg_price and abs(order.avg_price - trade.entry_price) < 0.01 and
                    order.filled_qty and order.filled_qty >= trade.position_size)
            ]
            
            if matching_buy_orders:
                # Find the closest buy order by time
                closest_buy_order = min(matching_buy_orders,
                    key=lambda x: abs(((x.filled_time or x.placed_time) - trade.entry_date).total_seconds())
                    if (x.filled_time or x.placed_time) else float('inf'))
                
                if closest_buy_order.placed_time or closest_buy_order.filled_time:
                    stop_loss_price = self._detect_stop_loss_price(closest_buy_order, all_orders)
                    
                    if stop_loss_price:
                        # Update trade with stop loss
                        trade.stop_loss = stop_loss_price
                        
                        # Recalculate risk metrics now that we have stop loss
                        if trade.entry_price and trade.position_size:
                            metrics = self._calculate_imported_trade_metrics(
                                entry_price=trade.entry_price,
                                exit_price=trade.exit_price,
                                stop_loss=stop_loss_price,
                                take_profit=trade.take_profit,
                                position_size=trade.position_size,
                                trade_type=trade.trade_type,
                                account_size=account_size
                            )
                            
                            # Update risk calculations
                            trade.risk_per_share = metrics["risk_per_share"]
                            trade.total_risk = metrics["total_risk"]
                            trade.risk_reward_ratio = metrics["risk_reward_ratio"]
                        
                        stop_losses_detected += 1
                        trades_updated += 1
                        print(f"Updated {trade.ticker} (ID: {trade.id}) with stop loss: ${stop_loss_price:.2f} and risk metrics")
        
        # Commit the updates
        self.db.commit()
        
        return {
            "stop_losses_detected": stop_losses_detected,
            "trades_updated": trades_updated,
            "total_trades_analyzed": len(trades_without_stop_loss)
        }

    def _process_chronological_orders(self, position: Position, orders: List[ImportedOrder], account_size: float = 10000) -> int:
        """
        Process orders chronologically with sophisticated position tracking.
        
        Rules:
        1. Track buy/sell/short orders chronologically
        2. New trade_group_id when position goes to zero and opens again
        3. Sub-positions (TradeEntry) for each add with individual stop losses
        4. FIFO exits from highest stop loss sub-position first
        5. Special case: sell immediately after add comes from that add
        """
        from app.models.models import Trade, TradeEntry, PartialExit
        import uuid
        
        trades_created = 0
        current_position = None  # Current active Trade record
        sub_positions = []  # List of TradeEntry records for current position
        current_trade_group_id = None
        net_shares = 0  # Running total of shares (positive = long, negative = short)
        
        print(f"\n=== Processing {len(orders)} {position.symbol} orders chronologically ===")
        
        for i, order in enumerate(orders):
            if not order.filled_qty or order.filled_qty <= 0:
                continue
                
            print(f"\nOrder {i+1}: {order.side} {order.filled_qty} @ ${order.avg_price} on {order.filled_time}")
            print(f"  Net shares before: {net_shares}")
            
            if order.side == "Buy":
                if net_shares < 0:  # Covering a short position
                    cover_qty = min(order.filled_qty, abs(net_shares))
                    remaining_qty = order.filled_qty - cover_qty
                    
                    if cover_qty > 0:
                        # Cover short position
                        self._process_short_cover(current_position, sub_positions, cover_qty, order, account_size)
                        net_shares += cover_qty
                        print(f"  Covered {cover_qty} short shares, net_shares now: {net_shares}")
                    
                    if remaining_qty > 0:
                        # Remaining qty opens new long position
                        if net_shares == 0:  # Position fully covered, start new long
                            current_trade_group_id = str(uuid.uuid4())
                            current_position, sub_positions = self._start_new_position(
                                position, remaining_qty, order, current_trade_group_id, "LONG", account_size
                            )
                            trades_created += 1
                        else:
                            # Add to existing long position
                            self._add_to_position(current_position, sub_positions, remaining_qty, order)
                        
                        net_shares += remaining_qty
                        print(f"  Added {remaining_qty} long shares, net_shares now: {net_shares}")
                        
                else:  # Adding to long position or starting new long
                    if net_shares == 0:  # Starting new long position
                        current_trade_group_id = str(uuid.uuid4())
                        current_position, sub_positions = self._start_new_position(
                            position, order.filled_qty, order, current_trade_group_id, "LONG", account_size
                        )
                        trades_created += 1
                    else:
                        # Add to existing long position
                        self._add_to_position(current_position, sub_positions, order.filled_qty, order)
                    
                    net_shares += order.filled_qty
                    print(f"  Added {order.filled_qty} long shares, net_shares now: {net_shares}")
            
            elif order.side == "Sell":
                if net_shares > 0:  # Selling from long position
                    sell_qty = min(order.filled_qty, net_shares)
                    remaining_qty = order.filled_qty - sell_qty
                    
                    if sell_qty > 0:
                        # Check if this sell is immediately after an add (special case)
                        is_immediate_after_add = (i > 0 and 
                                                orders[i-1].side == "Buy" and 
                                                order.filled_time and orders[i-1].filled_time and
                                                (order.filled_time - orders[i-1].filled_time).total_seconds() < 300)  # 5 min window
                        
                        self._process_long_sell(current_position, sub_positions, sell_qty, order, account_size, is_immediate_after_add)
                        net_shares -= sell_qty
                        print(f"  Sold {sell_qty} long shares, net_shares now: {net_shares}")
                    
                    if remaining_qty > 0 and net_shares == 0:
                        # Remaining qty opens new short position
                        current_trade_group_id = str(uuid.uuid4())
                        current_position, sub_positions = self._start_new_position(
                            position, remaining_qty, order, current_trade_group_id, "SHORT", account_size
                        )
                        trades_created += 1
                        net_shares -= remaining_qty
                        print(f"  Opened {remaining_qty} short shares, net_shares now: {net_shares}")
                        
                else:  # Adding to short position or starting new short
                    if net_shares == 0:  # Starting new short position
                        current_trade_group_id = str(uuid.uuid4())
                        current_position, sub_positions = self._start_new_position(
                            position, order.filled_qty, order, current_trade_group_id, "SHORT", account_size
                        )
                        trades_created += 1
                    else:
                        # Add to existing short position
                        self._add_to_position(current_position, sub_positions, order.filled_qty, order)
                    
                    net_shares -= order.filled_qty
                    print(f"  Added {order.filled_qty} short shares, net_shares now: {net_shares}")
            
            elif order.side == "Short":
                # Handle short selling
                if net_shares > 0:  # Selling from long position first
                    sell_qty = min(order.filled_qty, net_shares)
                    remaining_qty = order.filled_qty - sell_qty
                    
                    if sell_qty > 0:
                        self._process_long_sell(current_position, sub_positions, sell_qty, order, account_size, False)
                        net_shares -= sell_qty
                        print(f"  Sold {sell_qty} long shares via short, net_shares now: {net_shares}")
                    
                    if remaining_qty > 0:
                        # Remaining qty opens new short position
                        current_trade_group_id = str(uuid.uuid4())
                        current_position, sub_positions = self._start_new_position(
                            position, remaining_qty, order, current_trade_group_id, "SHORT", account_size
                        )
                        trades_created += 1
                        net_shares -= remaining_qty
                        print(f"  Opened {remaining_qty} short shares, net_shares now: {net_shares}")
                        
                else:  # Adding to short position or starting new short
                    if net_shares == 0:  # Starting new short position
                        current_trade_group_id = str(uuid.uuid4())
                        current_position, sub_positions = self._start_new_position(
                            position, order.filled_qty, order, current_trade_group_id, "SHORT", account_size
                        )
                        trades_created += 1
                    else:
                        # Add to existing short position
                        self._add_to_position(current_position, sub_positions, order.filled_qty, order)
                    
                    net_shares -= order.filled_qty
                    print(f"  Added {order.filled_qty} short shares, net_shares now: {net_shares}")
        
        # Close position if net_shares is 0, otherwise mark as active
        if net_shares == 0 and current_position:
            current_position.status = "CLOSED"
            # Calculate final profit from all partial exits
            partial_exits = self.db.query(PartialExit).filter(PartialExit.trade_id == current_position.id).all()
            if partial_exits:
                current_position.profit_loss = sum(exit.profit_loss for exit in partial_exits if exit.profit_loss)
                if current_position.position_value:
                    current_position.profit_loss_percent = (current_position.profit_loss / current_position.position_value) * 100
            print(f"  ✅ Position closed, final P&L: ${current_position.profit_loss}")
        elif current_position:
            current_position.status = "ACTIVE"
            print(f"  📈 Position remains active with {net_shares} net shares")
        
        self.db.commit()
        print(f"=== Completed processing, created {trades_created} trades ===\n")
        
        return trades_created

    def _start_new_position(self, position: Position, qty: int, order: ImportedOrder, trade_group_id: str, 
                           direction: str, account_size: float) -> tuple:
        """Start a new position with the first sub-position"""
        from app.models.models import Trade, TradeEntry
        
        # Parse options info
        options_info = parse_options_symbol(position.symbol)
        
        # Detect stop loss
        stop_loss_price = self._detect_stop_loss_price(order, [order])  # Pass single order for now
        
        # Calculate metrics
        metrics = self._calculate_imported_trade_metrics(
            entry_price=order.avg_price,
            exit_price=None,
            stop_loss=stop_loss_price,
            take_profit=None,
            position_size=qty,
            trade_type=direction,
            account_size=account_size
        )
        
        # Create main trade record
        trade = Trade(
            user_id=position.user_id,
            ticker=options_info['ticker'] if options_info['is_options'] else position.symbol,
            trade_type=direction,
            status="ACTIVE",
            trade_group_id=trade_group_id,
            
            # Options fields
            instrument_type=InstrumentType.OPTIONS if options_info['is_options'] else InstrumentType.STOCK,
            strike_price=options_info['strike_price'] if options_info['is_options'] else None,
            expiration_date=options_info['expiration_date'] if options_info['is_options'] else None,
            option_type=OptionType.CALL if options_info['option_type'] == 'call' else OptionType.PUT if options_info['option_type'] == 'put' else None,
            
            position_size=qty,
            entry_price=order.avg_price,
            entry_date=order.filled_time or order.placed_time,
            position_value=metrics["position_value"],
            setup_type="imported",
            strategy="Breakout",
            stop_loss=stop_loss_price,
            risk_per_share=metrics["risk_per_share"],
            total_risk=metrics["total_risk"],
            risk_reward_ratio=metrics["risk_reward_ratio"],
            account_balance_snapshot=account_size,
            imported_order_id=order.id
        )
        
        self.db.add(trade)
        self.db.flush()  # Get trade ID
        
        # Create first sub-position (TradeEntry)
        trade_entry = TradeEntry(
            trade_id=trade.id,
            shares=qty,
            entry_price=order.avg_price,
            entry_date=order.filled_time or order.placed_time,
            stop_loss=stop_loss_price,
            notes=f"Initial position: {direction} {qty} @ ${order.avg_price}"
        )
        
        self.db.add(trade_entry)
        self.db.flush()
        
        sub_positions = [trade_entry]
        
        print(f"  🆕 Started new {direction} position: Trade ID {trade.id}, Group {trade_group_id[:8]}")
        print(f"     Sub-position: {qty} @ ${order.avg_price}, Stop: ${stop_loss_price or 'None'}")
        
        return trade, sub_positions

    def _add_to_position(self, trade: 'Trade', sub_positions: list, qty: int, order: ImportedOrder):
        """Add to existing position with new sub-position"""
        from app.models.models import TradeEntry
        
        # Detect stop loss for this add
        stop_loss_price = self._detect_stop_loss_price(order, [order])
        
        # Create new sub-position
        trade_entry = TradeEntry(
            trade_id=trade.id,
            shares=qty,
            entry_price=order.avg_price,
            entry_date=order.filled_time or order.placed_time,
            stop_loss=stop_loss_price,
            notes=f"Add to position: {qty} @ ${order.avg_price}"
        )
        
        self.db.add(trade_entry)
        self.db.flush()
        
        sub_positions.append(trade_entry)
        
        # Update main trade record
        old_total_qty = trade.position_size
        old_total_value = trade.position_value or 0
        
        new_total_qty = old_total_qty + qty
        new_add_value = qty * order.avg_price
        new_total_value = old_total_value + new_add_value
        
        # Update weighted average entry price
        trade.entry_price = new_total_value / new_total_qty
        trade.position_size = new_total_qty
        trade.position_value = new_total_value
        
        print(f"  ➕ Added to position: +{qty} @ ${order.avg_price}, Stop: ${stop_loss_price or 'None'}")
        print(f"     Total position: {new_total_qty} @ avg ${trade.entry_price:.4f}")

    def _process_long_sell(self, trade: 'Trade', sub_positions: list, qty: int, order: ImportedOrder, 
                          account_size: float, is_immediate_after_add: bool):
        """Process selling from long position using FIFO with highest stop loss first"""
        from app.models.models import PartialExit
        
        remaining_to_sell = qty
        
        if is_immediate_after_add and sub_positions:
            # Special case: sell immediately after add comes from that add (last sub-position)
            last_sub = sub_positions[-1]
            if last_sub.shares >= remaining_to_sell:
                print(f"    🎯 Immediate sell after add: {remaining_to_sell} from last add @ ${last_sub.entry_price}")
                self._process_sub_position_exit(trade, last_sub, remaining_to_sell, order, account_size)
                remaining_to_sell = 0
            else:
                # Sell all from last add, then continue with FIFO
                print(f"    🎯 Immediate sell after add: {last_sub.shares} from last add @ ${last_sub.entry_price}")
                self._process_sub_position_exit(trade, last_sub, last_sub.shares, order, account_size)
                remaining_to_sell -= last_sub.shares
        
        # Continue with FIFO from highest stop loss
        while remaining_to_sell > 0 and sub_positions:
            # Sort by stop loss descending (highest first), then by entry date
            sub_positions.sort(key=lambda x: (x.stop_loss or 0, x.entry_date), reverse=True)
            
            # Find first sub-position with shares > 0
            active_sub_positions = [sp for sp in sub_positions if sp.shares > 0]
            if not active_sub_positions:
                print(f"    ⚠️  No active sub-positions with shares > 0, breaking FIFO loop")
                break
                
            sub_pos = active_sub_positions[0]
            exit_qty = min(remaining_to_sell, sub_pos.shares)
            
            print(f"    📤 FIFO exit: {exit_qty} from sub-position @ ${sub_pos.entry_price}, Stop: ${sub_pos.stop_loss or 'None'}")
            
            self._process_sub_position_exit(trade, sub_pos, exit_qty, order, account_size)
            remaining_to_sell -= exit_qty
            
            # Remove empty sub-positions from tracking list
            sub_positions[:] = [sp for sp in sub_positions if sp.shares > 0]

    def _process_short_cover(self, trade: 'Trade', sub_positions: list, qty: int, order: ImportedOrder, 
                            account_size: float):
        """Process covering short position using FIFO"""
        from app.models.models import PartialExit
        
        remaining_to_cover = qty
        
        # Use FIFO for short covering (oldest first)
        while remaining_to_cover > 0 and sub_positions:
            sub_positions.sort(key=lambda x: x.entry_date)  # Oldest first
            
            # Find first sub-position with shares > 0
            active_sub_positions = [sp for sp in sub_positions if sp.shares > 0]
            if not active_sub_positions:
                print(f"    ⚠️  No active sub-positions with shares > 0, breaking cover loop")
                break
                
            sub_pos = active_sub_positions[0]
            cover_qty = min(remaining_to_cover, sub_pos.shares)
            
            print(f"    📤 Cover short: {cover_qty} from sub-position @ ${sub_pos.entry_price}")
            
            self._process_sub_position_exit(trade, sub_pos, cover_qty, order, account_size)
            remaining_to_cover -= cover_qty
            
            # Remove empty sub-positions from tracking list
            sub_positions[:] = [sp for sp in sub_positions if sp.shares > 0]

    def _process_sub_position_exit(self, trade: 'Trade', sub_position: 'TradeEntry', exit_qty: int, 
                                  order: ImportedOrder, account_size: float):
        """Process exit from a specific sub-position"""
        from app.models.models import PartialExit
        
        # Calculate P&L for this partial exit
        entry_price = sub_position.entry_price
        exit_price = order.avg_price
        
        # For long positions: profit = (exit_price - entry_price) * qty
        # For short positions: profit = (entry_price - exit_price) * qty
        if trade.trade_type == "LONG":
            raw_pnl = (exit_price - entry_price) * exit_qty
        else:  # SHORT
            raw_pnl = (entry_price - exit_price) * exit_qty
        
        # Handle options multiplier
        options_info = parse_options_symbol(trade.ticker) if hasattr(trade, 'ticker') else {'is_options': False}
        actual_pnl = raw_pnl * 100 if options_info['is_options'] else raw_pnl
        
        # Create partial exit record
        partial_exit = PartialExit(
            trade_id=trade.id,
            exit_date=order.filled_time or order.placed_time,
            shares_sold=exit_qty,
            exit_price=exit_price,
            profit_loss=actual_pnl,
            notes=f"Partial exit from sub-position @ ${entry_price}"
        )
        
        self.db.add(partial_exit)
        
        # Update sub-position
        sub_position.shares -= exit_qty
        if sub_position.shares <= 0:
            # Remove empty sub-position
            # Note: We don't delete from DB, just remove from tracking list
            sub_position.shares = 0  # Mark as fully exited
        
        # Update main trade
        trade.position_size -= exit_qty
        
        print(f"      💰 Partial exit P&L: ${actual_pnl:.2f} ({exit_qty} × ${exit_price - entry_price:.4f})")
        
        return actual_pnl

    def _process_chronological_orders_simple(self, position: Position, orders: List[ImportedOrder], account_size: float = 10000) -> int:
        """
        Simple chronological processing: match buy-sell pairs for closed trades, track remaining as open positions.
        
        Logic:
        1. Process ticker chronologically (oldest to newest)
        2. Buy + Sell of same qty = closed trade
        3. Short + Buy of same qty = closed trade  
        4. Partial sells/adds = track remaining position
        5. Pending orders = sub-positions with individual stop losses
        """
        from app.models.models import Trade, TradeEntry, PartialExit
        import uuid
        
        # Filter out cancelled orders and sort chronologically
        active_orders = [o for o in orders if o.status.lower() != 'cancelled' and o.filled_qty and o.filled_qty > 0]
        active_orders.sort(key=lambda x: x.filled_time or x.placed_time)
        
        print(f"\n=== Simple Processing {len(active_orders)} {position.symbol} orders ===")
        
        trades_created = 0
        position_stack = []  # Track current position: [(qty, price, date, order), ...]
        
        i = 0
        while i < len(active_orders):
            order = active_orders[i]
            
            print(f"Processing order {i+1}: {order.side} {order.filled_qty} @ ${order.avg_price}")
            
            if order.side == "Buy":
                # Try exact matching with the immediate next order only for efficiency
                immediate_sell = None
                if i + 1 < len(active_orders):
                    next_order = active_orders[i + 1]
                    if (next_order.side == "Sell" and 
                        next_order.filled_qty == order.filled_qty):
                        immediate_sell = {'order': next_order, 'index': i + 1}
                
                if immediate_sell:
                    # Create closed trade for immediate exact match
                    trade = self._create_closed_trade(position, order, immediate_sell['order'], account_size)
                    trades_created += 1
                    # Mark sell as processed by removing it
                    active_orders.pop(immediate_sell['index'])
                    print(f"  ✅ Immediate exact match: {order.filled_qty} shares closed trade")
                else:
                    # Add to position stack for partial sell processing
                    position_stack.append({
                        'type': 'buy',
                        'qty': order.filled_qty,
                        'price': order.avg_price,
                        'date': order.filled_time or order.placed_time,
                        'order': order,
                        'partial_exits': []  # Track partial exits from this buy
                    })
                    print(f"  📈 Added to position stack: {order.filled_qty} shares")
                    
            elif order.side == "Short":
                # Try exact matching with the immediate next order only for efficiency
                immediate_buy = None
                if i + 1 < len(active_orders):
                    next_order = active_orders[i + 1]
                    if (next_order.side == "Buy" and 
                        next_order.filled_qty == order.filled_qty):
                        immediate_buy = {'order': next_order, 'index': i + 1}
                
                if immediate_buy:
                    # Create closed short trade for immediate exact match
                    trade = self._create_closed_short_trade(position, order, immediate_buy['order'], account_size)
                    trades_created += 1
                    # Mark buy as processed by removing it
                    active_orders.pop(immediate_buy['index'])
                    print(f"  ✅ Immediate exact match: {order.filled_qty} shares closed short trade")
                else:
                    # Add to position stack for partial cover processing
                    position_stack.append({
                        'type': 'short',
                        'qty': order.filled_qty,
                        'price': order.avg_price,
                        'date': order.filled_time or order.placed_time,
                        'order': order,
                        'partial_exits': []  # Track partial exits from this short
                    })
                    print(f"  📉 Added to short position stack: {order.filled_qty} shares")
                    
            elif order.side == "Sell":
                # Process sell against position stack (FIFO)
                remaining_to_sell = order.filled_qty
                
                while remaining_to_sell > 0 and position_stack:
                    # Find next buy position to sell from (FIFO)
                    buy_positions = [p for p in position_stack if p['type'] == 'buy' and p['qty'] > 0]
                    if not buy_positions:
                        break
                        
                    buy_pos = buy_positions[0]  # FIFO: oldest first
                    sell_qty = min(remaining_to_sell, buy_pos['qty'])
                    
                    # Always track as partial exit for comprehensive P&L
                    buy_pos['qty'] -= sell_qty
                    
                    # Store the partial sell info for later PartialExit creation
                    if 'partial_exits' not in buy_pos:
                        buy_pos['partial_exits'] = []
                    buy_pos['partial_exits'].append({
                        'qty': sell_qty,
                        'price': order.avg_price,
                        'date': order.filled_time or order.placed_time,
                        'order': order
                    })
                    
                    if buy_pos['qty'] == 0:
                        print(f"  ✅ Fully sold position: {sell_qty} shares (last partial)")
                        # Position fully sold - will be handled in comprehensive closed trade creation
                    else:
                        print(f"  📤 Partial sell: {sell_qty} shares, {buy_pos['qty']} remaining")
                    
                    remaining_to_sell -= sell_qty
                
                if remaining_to_sell > 0:
                    print(f"  ⚠️  Oversell: {remaining_to_sell} shares could not be matched")
            
            i += 1
        
        # Create comprehensive closed trades for fully sold positions
        closed_trades = self._create_comprehensive_closed_trades(position, position_stack, orders, account_size)
        trades_created += closed_trades
        
        # Remove fully sold positions from stack
        position_stack[:] = [p for p in position_stack if p['qty'] > 0]
        
        # Handle remaining position stack + pending orders as open position
        if position_stack or self._has_pending_orders(orders):
            open_trade = self._create_open_position(position, position_stack, orders, account_size)
            if open_trade:
                trades_created += 1
                print(f"  📈 Created open position with {open_trade.position_size} shares")
        
        # Update position table
        self._update_position_table(position, position_stack, orders)
        
        print(f"=== Completed: {trades_created} trades created ===\n")
        return trades_created

    def _create_comprehensive_closed_trades(self, position: Position, position_stack: List[Dict], orders: List[ImportedOrder], account_size: float) -> int:
        """Create comprehensive closed trades for positions that are fully sold (qty = 0)"""
        from app.models.models import Trade, PartialExit
        
        trades_created = 0
        
        # Find all positions that are fully sold (qty = 0) and have partial exits
        fully_sold_positions = [p for p in position_stack if p['qty'] == 0 and p.get('partial_exits')]
        
        for pos in fully_sold_positions:
            partial_exits = pos['partial_exits']
            if not partial_exits:
                continue
                
            # Calculate total quantities and weighted average prices
            original_qty = pos['order'].filled_qty  # Original buy quantity
            total_sold_qty = sum(pe['qty'] for pe in partial_exits)
            entry_price = pos['price']
            
            # Calculate weighted average exit price
            total_exit_value = sum(pe['qty'] * pe['price'] for pe in partial_exits)
            avg_exit_price = total_exit_value / total_sold_qty if total_sold_qty > 0 else 0
            
            # Parse options info
            options_info = parse_options_symbol(position.symbol)
            
            # Calculate comprehensive P&L
            raw_pnl = (avg_exit_price - entry_price) * total_sold_qty
            actual_pnl = raw_pnl * 100 if options_info['is_options'] else raw_pnl
            
            # Detect stop loss from cancelled orders placed after this buy order
            stop_loss_price = self._detect_stop_loss_from_cancelled_orders(position, pos['order'], orders)
            if not stop_loss_price:
                stop_loss_price = self._detect_stop_loss_price(pos['order'], [pos['order']])
            
            # Calculate metrics
            metrics = self._calculate_imported_trade_metrics(
                entry_price=entry_price,
                exit_price=avg_exit_price,
                stop_loss=stop_loss_price,
                take_profit=None,
                position_size=total_sold_qty,
                trade_type="LONG",
                account_size=account_size
            )
            
            # Create comprehensive closed trade
            trade = Trade(
                user_id=position.user_id,
                ticker=options_info['ticker'] if options_info['is_options'] else position.symbol,
                trade_type="LONG",
                status="CLOSED",
                trade_group_id=str(uuid.uuid4()),
                
                # Options fields
                instrument_type=InstrumentType.OPTIONS if options_info['is_options'] else InstrumentType.STOCK,
                strike_price=options_info['strike_price'] if options_info['is_options'] else None,
                expiration_date=options_info['expiration_date'] if options_info['is_options'] else None,
                option_type=OptionType.CALL if options_info['option_type'] == 'call' else OptionType.PUT if options_info['option_type'] == 'put' else None,
                
                position_size=total_sold_qty,
                entry_price=entry_price,
                exit_price=avg_exit_price,
                entry_date=pos['date'],
                exit_date=partial_exits[-1]['date'],  # Last exit date
                profit_loss=actual_pnl,
                position_value=total_sold_qty * entry_price,
                setup_type="imported",
                strategy="Breakout",
                stop_loss=stop_loss_price,
                risk_per_share=metrics["risk_per_share"],
                total_risk=metrics["total_risk"],
                risk_reward_ratio=metrics["risk_reward_ratio"],
                account_balance_snapshot=account_size,
                imported_order_id=pos['order'].id
            )
            
            self.db.add(trade)
            self.db.flush()  # Get trade ID
            
            # Create PartialExit records for each partial sell
            for pe in partial_exits:
                partial_exit_pnl = (pe['price'] - entry_price) * pe['qty']
                if options_info['is_options']:
                    partial_exit_pnl *= 100
                    
                partial_exit = PartialExit(
                    trade_id=trade.id,
                    exit_date=pe['date'],
                    shares_sold=pe['qty'],
                    exit_price=pe['price'],
                    profit_loss=partial_exit_pnl,
                    notes=f"Partial exit: {pe['qty']} @ ${pe['price']:.2f}"
                )
                self.db.add(partial_exit)
            
            trades_created += 1
            print(f"  ✅ Created comprehensive closed trade: {total_sold_qty} shares, P&L: ${actual_pnl:.2f}")
            print(f"     Entry: ${entry_price:.2f}, Avg Exit: ${avg_exit_price:.2f}, {len(partial_exits)} partial exits")
        
        # Close any existing ACTIVE trades for this symbol that shouldn't be active anymore
        if fully_sold_positions:
            self._close_orphaned_active_trades(position)
        
        return trades_created

    def _detect_stop_loss_from_cancelled_orders(self, position: Position, buy_order: ImportedOrder, all_orders: List[ImportedOrder]) -> Optional[float]:
        """Detect stop loss from cancelled sell orders placed chronologically closest after this specific buy order"""
        if not buy_order.placed_time:
            return None
            
        # Find cancelled sell orders placed after this buy order within a reasonable timeframe
        time_window_hours = 24  # Look for stop losses placed within 24 hours of the buy
        
        cancelled_sells = self.db.query(ImportedOrder).filter(
            ImportedOrder.symbol == position.symbol,
            ImportedOrder.side == "Sell",
            ImportedOrder.status.ilike("%cancelled%"),
            ImportedOrder.placed_time > buy_order.placed_time,
            ImportedOrder.placed_time <= buy_order.placed_time + timedelta(hours=time_window_hours),
            ImportedOrder.price.isnot(None),
            ImportedOrder.price < buy_order.avg_price  # Stop loss should be below buy price
        ).order_by(ImportedOrder.placed_time.asc()).all()  # Closest in time first
        
        if cancelled_sells:
            # Return the first (chronologically closest) cancelled sell after this buy
            return cancelled_sells[0].price
        
        return None

    def _calculate_weighted_stop_loss_for_position(self, position_stack_entry: Dict, all_orders: List[ImportedOrder]) -> Optional[float]:
        """Calculate weighted average stop loss for a position with multiple adds"""
        # For comprehensive closed trades, we need to consider all the partial exits
        # and find the appropriate stop loss for the overall position
        
        # Get the buy order for this position entry
        buy_order = position_stack_entry['order']
        
        # Find stop loss for this specific buy
        stop_loss = self._detect_stop_loss_from_cancelled_orders(
            self.db.query(Position).filter(Position.symbol == buy_order.symbol).first(),
            buy_order, 
            all_orders
        )
        
        return stop_loss

    def _close_orphaned_active_trades(self, position: Position):
        """Close any ACTIVE trades for this symbol that should no longer be active"""
        active_trades = self.db.query(Trade).filter(
            Trade.ticker == position.symbol,
            Trade.user_id == position.user_id,
            Trade.status == "ACTIVE"
        ).all()
        
        for trade in active_trades:
            print(f"  🔒 Closing orphaned ACTIVE trade: {trade.id} ({trade.position_size} shares)")
            trade.status = "CLOSED"
            # Set exit details if not already set
            if not trade.exit_price or not trade.profit_loss:
                # Use the most recent market data or set to break-even
                trade.exit_price = trade.entry_price
                trade.profit_loss = 0.0
                trade.exit_date = datetime.utcnow()

    def _find_matching_sell(self, orders: List[ImportedOrder], start_idx: int, buy_qty: int) -> Optional[Dict]:
        """Find the next sell order that matches the buy quantity"""
        for i in range(start_idx, len(orders)):
            order = orders[i]
            if order.side == "Sell" and order.filled_qty == buy_qty:
                return {'order': order, 'index': i}
        return None

    def _find_matching_buy(self, orders: List[ImportedOrder], start_idx: int, short_qty: int) -> Optional[Dict]:
        """Find the next buy order that matches the short quantity"""
        for i in range(start_idx, len(orders)):
            order = orders[i]
            if order.side == "Buy" and order.filled_qty == short_qty:
                return {'order': order, 'index': i}
        return None

    def _create_closed_trade(self, position: Position, buy_order: ImportedOrder, sell_order: ImportedOrder, 
                           account_size: float, qty: int = None) -> Trade:
        """Create a closed trade from buy-sell pair"""
        from app.models.models import Trade
        
        actual_qty = qty or buy_order.filled_qty
        buy_price = buy_order.avg_price
        sell_price = sell_order.avg_price
        
        # Parse options info
        options_info = parse_options_symbol(position.symbol)
        
        # Calculate P&L
        raw_pnl = (sell_price - buy_price) * actual_qty
        actual_pnl = raw_pnl * 100 if options_info['is_options'] else raw_pnl
        
        # Detect stop loss
        stop_loss_price = self._detect_stop_loss_price(buy_order, [buy_order, sell_order])
        
        # Calculate metrics
        metrics = self._calculate_imported_trade_metrics(
            entry_price=buy_price,
            exit_price=sell_price,
            stop_loss=stop_loss_price,
            take_profit=None,
            position_size=actual_qty,
            trade_type="LONG",
            account_size=account_size
        )
        
        trade = Trade(
            user_id=position.user_id,
            ticker=options_info['ticker'] if options_info['is_options'] else position.symbol,
            trade_type="LONG",
            status="CLOSED",
            trade_group_id=str(uuid.uuid4()),
            
            # Options fields
            instrument_type=InstrumentType.OPTIONS if options_info['is_options'] else InstrumentType.STOCK,
            strike_price=options_info['strike_price'] if options_info['is_options'] else None,
            expiration_date=options_info['expiration_date'] if options_info['is_options'] else None,
            option_type=OptionType.CALL if options_info['option_type'] == 'call' else OptionType.PUT if options_info['option_type'] == 'put' else None,
            
            position_size=actual_qty,
            entry_price=buy_price,
            exit_price=sell_price,
            entry_date=buy_order.filled_time or buy_order.placed_time,
            exit_date=sell_order.filled_time or sell_order.placed_time,
            profit_loss=actual_pnl,
            position_value=actual_qty * buy_price,
            setup_type="imported",
            strategy="Breakout",
            stop_loss=stop_loss_price,
            risk_per_share=metrics["risk_per_share"],
            total_risk=metrics["total_risk"],
            risk_reward_ratio=metrics["risk_reward_ratio"],
            account_balance_snapshot=account_size
        )
        
        self.db.add(trade)
        self.db.flush()
        return trade

    def _create_closed_short_trade(self, position: Position, short_order: ImportedOrder, buy_order: ImportedOrder, 
                                 account_size: float) -> Trade:
        """Create a closed short trade from short-buy pair"""
        from app.models.models import Trade
        
        qty = short_order.filled_qty
        short_price = short_order.avg_price
        cover_price = buy_order.avg_price
        
        # Parse options info
        options_info = parse_options_symbol(position.symbol)
        
        # Calculate P&L (short profits when price goes down)
        raw_pnl = (short_price - cover_price) * qty
        actual_pnl = raw_pnl * 100 if options_info['is_options'] else raw_pnl
        
        trade = Trade(
            user_id=position.user_id,
            ticker=options_info['ticker'] if options_info['is_options'] else position.symbol,
            trade_type="SHORT",
            status="CLOSED",
            trade_group_id=str(uuid.uuid4()),
            
            # Options fields
            instrument_type=InstrumentType.OPTIONS if options_info['is_options'] else InstrumentType.STOCK,
            strike_price=options_info['strike_price'] if options_info['is_options'] else None,
            expiration_date=options_info['expiration_date'] if options_info['is_options'] else None,
            option_type=OptionType.CALL if options_info['option_type'] == 'call' else OptionType.PUT if options_info['option_type'] == 'put' else None,
            
            position_size=qty,
            entry_price=short_price,
            exit_price=cover_price,
            entry_date=short_order.filled_time or short_order.placed_time,
            exit_date=buy_order.filled_time or buy_order.placed_time,
            profit_loss=actual_pnl,
            position_value=qty * short_price,
            setup_type="imported",
            strategy="Breakout",
            account_balance_snapshot=account_size
        )
        
        self.db.add(trade)
        self.db.flush()
        return trade

    def _has_pending_orders(self, orders: List[ImportedOrder]) -> bool:
        """Check if there are any pending orders for this symbol"""
        return any(order.status.lower() in ['pending', 'open', 'working'] for order in orders)

    def _create_open_position(self, position: Position, position_stack: List[Dict], 
                            all_orders: List[ImportedOrder], account_size: float) -> Optional[Trade]:
        """Create an open position from remaining position stack and pending orders"""
        if not position_stack and not self._has_pending_orders(all_orders):
            return None
            
        from app.models.models import Trade, TradeEntry
        
        # Calculate net position from stack
        net_long_shares = sum(p['qty'] for p in position_stack if p['type'] == 'buy')
        net_short_shares = sum(p['qty'] for p in position_stack if p['type'] == 'short')
        
        if net_long_shares == 0 and net_short_shares == 0:
            return None
            
        # Determine position type and shares
        if net_long_shares > 0:
            trade_type = "LONG"
            total_shares = net_long_shares
            # Calculate weighted average entry price
            total_value = sum(p['qty'] * p['price'] for p in position_stack if p['type'] == 'buy')
            avg_entry_price = total_value / net_long_shares if net_long_shares > 0 else 0
        else:
            trade_type = "SHORT"
            total_shares = net_short_shares
            # Calculate weighted average entry price
            total_value = sum(p['qty'] * p['price'] for p in position_stack if p['type'] == 'short')
            avg_entry_price = total_value / net_short_shares if net_short_shares > 0 else 0
        
        # Parse options info
        options_info = parse_options_symbol(position.symbol)
        
        # Create main trade record
        trade = Trade(
            user_id=position.user_id,
            ticker=options_info['ticker'] if options_info['is_options'] else position.symbol,
            trade_type=trade_type,
            status="ACTIVE",
            trade_group_id=str(uuid.uuid4()),
            
            # Options fields
            instrument_type=InstrumentType.OPTIONS if options_info['is_options'] else InstrumentType.STOCK,
            strike_price=options_info['strike_price'] if options_info['is_options'] else None,
            expiration_date=options_info['expiration_date'] if options_info['is_options'] else None,
            option_type=OptionType.CALL if options_info['option_type'] == 'call' else OptionType.PUT if options_info['option_type'] == 'put' else None,
            
            position_size=total_shares,
            entry_price=avg_entry_price,
            entry_date=min(p['date'] for p in position_stack) if position_stack else None,
            position_value=total_shares * avg_entry_price,
            setup_type="imported",
            strategy="Breakout",
            account_balance_snapshot=account_size
        )
        
        self.db.add(trade)
        self.db.flush()
        
        # Create TradeEntry records for each position in stack
        for pos in position_stack:
            if pos['qty'] > 0:
                # Find pending sell orders that might be stop losses for this entry
                stop_loss = self._find_stop_loss_for_entry(pos, all_orders)
                
                trade_entry = TradeEntry(
                    trade_id=trade.id,
                    shares=pos['qty'],
                    entry_price=pos['price'],
                    entry_date=pos['date'],
                    stop_loss=stop_loss,
                    notes=f"Open position: {pos['type']} {pos['qty']} @ ${pos['price']}"
                )
                self.db.add(trade_entry)
                
                # Create PartialExit records for any partial sells from this position
                if 'partial_exits' in pos:
                    for partial_exit in pos['partial_exits']:
                        # Calculate P&L for this partial exit
                        entry_price = pos['price']
                        exit_price = partial_exit['price']
                        exit_qty = partial_exit['qty']
                        
                        # Handle long vs short P&L calculation
                        if trade_type == "LONG":
                            raw_pnl = (exit_price - entry_price) * exit_qty
                        else:  # SHORT
                            raw_pnl = (entry_price - exit_price) * exit_qty
                        
                        # Handle options multiplier
                        actual_pnl = raw_pnl * 100 if options_info['is_options'] else raw_pnl
                        
                        partial_exit_record = PartialExit(
                            trade_id=trade.id,
                            exit_date=partial_exit['date'],
                            shares_sold=exit_qty,
                            exit_price=exit_price,
                            profit_loss=actual_pnl,
                            notes=f"Partial exit from open position @ ${entry_price}"
                        )
                        self.db.add(partial_exit_record)
                        
                        print(f"    📤 Created PartialExit: {exit_qty} shares @ ${exit_price}, P&L: ${actual_pnl:.2f}")
        
        return trade

    def _find_stop_loss_for_entry(self, position_entry: Dict, all_orders: List[ImportedOrder]) -> Optional[float]:
        """Find pending sell orders that could be stop losses for this position entry"""
        # Look for pending sell orders placed around the same time as the buy
        for order in all_orders:
            if (order.status.lower() in ['pending', 'open', 'working'] and 
                order.side == "Sell" and 
                order.price and order.price < position_entry['price']):
                return order.price
        return None

    def _update_position_table(self, position: Position, position_stack: List[Dict], all_orders: List[ImportedOrder]):
        """Update the Position table for the Positions page"""
        
        # Calculate net position
        net_long_shares = sum(p['qty'] for p in position_stack if p['type'] == 'buy')
        net_short_shares = sum(p['qty'] for p in position_stack if p['type'] == 'short')
        
        # Calculate total bought/sold for better position tracking
        total_bought = sum(p['qty'] + sum(pe['qty'] for pe in p.get('partial_exits', [])) 
                          for p in position_stack if p['type'] == 'buy')
        total_sold = sum(sum(pe['qty'] for pe in p.get('partial_exits', [])) 
                        for p in position_stack if p['type'] == 'buy')
        
        if net_long_shares > 0:
            # Long position - calculate weighted average of remaining shares
            remaining_positions = [p for p in position_stack if p['type'] == 'buy' and p['qty'] > 0]
            if remaining_positions:
                total_value = sum(p['qty'] * p['price'] for p in remaining_positions)
                position.quantity = net_long_shares
                position.avg_cost_basis = total_value / net_long_shares
                position.total_cost = total_value
                position.is_open = True
                
                print(f"    📊 Position summary: {total_bought} bought, {total_sold} sold, {net_long_shares} remaining")
            
        elif net_short_shares > 0:
            # Short position  
            remaining_positions = [p for p in position_stack if p['type'] == 'short' and p['qty'] > 0]
            if remaining_positions:
                total_value = sum(p['qty'] * p['price'] for p in remaining_positions)
                position.quantity = -net_short_shares  # Negative for short
                position.avg_cost_basis = total_value / net_short_shares
                position.total_cost = total_value
                position.is_open = True
            
        else:
            # No open position
            position.quantity = 0
            position.is_open = False
            position.closed_at = datetime.utcnow()
        
        position.last_updated = datetime.utcnow()