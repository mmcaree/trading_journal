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

from app.models import ImportedOrder, ImportBatch, Position, PositionOrder, OrderStatus, OrderSide, Trade, User, InstrumentType, OptionType
from app.services.trade_service import calculate_trade_metrics
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
                            print(f"Processed order {row_num}: {order.symbol} {order.side} {order.quantity} @ {order.placed_time}")
                        
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
            batch_info = self.db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()
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
        
        # Process orders chronologically
        buy_queue = []  # FIFO queue for buy orders
        
        for order in orders:
            if order.side == "Buy":
                self._process_buy_order(position, order, buy_queue, orders)
                
            elif order.side == "Sell":
                trades_created = self._process_sell_order(position, order, buy_queue, account_size)
                results["trades_created"] += trades_created
                
            elif order.side == "Short":
                # Handle short selling (future enhancement)
                pass
            
            # Mark order as processed
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
                    key=lambda x: abs((x.filled_time or x.placed_time - trade.entry_date).total_seconds())
                    if x.filled_time or x.placed_time else float('inf'))
                
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
                    setup_type="imported",
                    strategy="Other",  # Default strategy for imported trades
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
                        setup_type="imported", 
                        strategy="Other",  # Default strategy for imported trades
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