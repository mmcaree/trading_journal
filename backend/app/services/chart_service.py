"""
Chart data service for fetching stock price data and generating chart data
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import yfinance as yf
import pandas as pd
from fastapi import HTTPException
import time
import random


class ChartDataService:
    """Service for fetching and processing stock chart data with rate limiting"""
    
    _last_request_time = 0
    _min_request_interval = 0.3  # Minimum seconds between requests (reduced from 1.0)
    
    @staticmethod
    def _rate_limit():
        """Ensure we don't make requests too quickly"""
        current_time = time.time()
        time_since_last = current_time - ChartDataService._last_request_time
        
        if time_since_last < ChartDataService._min_request_interval:
            sleep_time = ChartDataService._min_request_interval - time_since_last
            # Add small random delay to avoid synchronized requests
            sleep_time += random.uniform(0.05, 0.15)  # Reduced random delay
            print(f"Rate limiting: sleeping for {sleep_time:.2f} seconds")
            time.sleep(sleep_time)
        
        ChartDataService._last_request_time = time.time()
    
    @staticmethod
    def get_chart_data(
        ticker: str,
        entry_date: datetime,
        exit_date: Optional[datetime] = None,
        days_before: int = 45  # Increased to ensure sufficient data for 20-period SMAs + buffer
    ) -> Dict:
        """
        Fetch chart data for a trade with entry/exit markers
        
        Args:
            ticker: Stock symbol
            entry_date: Trade entry date
            exit_date: Trade exit date (optional)
            days_before: Number of days before entry to include
        
        Returns:
            Dictionary containing OHLCV data and trade markers
        """
        try:
            # Apply rate limiting
            ChartDataService._rate_limit()
            
            # Calculate date range
            start_date = entry_date - timedelta(days=days_before)
            
            # If trade is still open, use current date
            # If closed, use exit date + 5 days for daily charts (or current date if sooner)
            if exit_date:
                today = datetime.now().date()
                exit_date_only = exit_date.date()
                
                # Add 5 days past exit (or until today, whichever is sooner)
                if exit_date_only < today:
                    # For daily charts, extend 5 days past exit (or until today)
                    max_end_date = exit_date + timedelta(days=5)
                    current_date_dt = datetime.combine(today, datetime.min.time())
                    end_date = min(max_end_date, current_date_dt)
                    print(f"Exit date {exit_date_only} is before today {today}, extending to {end_date.date()} (5 days or current date)")
                else:
                    end_date = exit_date
                    print(f"Exit date {exit_date_only} is today or future, not extending past exit date")
            else:
                end_date = datetime.now()
                print(f"Trade still open, using current date {end_date.date()}")
            
            # Get different timeframes
            chart_data = {
                'ticker': ticker,
                'entry_date': entry_date.isoformat(),
                'exit_date': exit_date.isoformat() if exit_date else None,
                'timeframes': {}
            }
            
            print(f"Fetching chart data for {ticker}")
            
            # Start with daily data (most reliable and always available)
            daily_data = ChartDataService._fetch_timeframe_data_safe(
                ticker, start_date, end_date, '1d'
            )
            
            # Check if we have data more safely
            try:
                has_daily_data = not daily_data.empty
                print(f"Daily data empty check: {has_daily_data}")
            except Exception as empty_check_error:
                print(f"Error checking if daily_data is empty: {empty_check_error}")
                print(f"Daily data type: {type(daily_data)}")
                has_daily_data = len(daily_data) > 0 if hasattr(daily_data, '__len__') else False
            
            if has_daily_data:
                try:
                    chart_data['timeframes']['1d'] = ChartDataService._format_ohlcv_data(daily_data)
                    print(f"Daily data: {len(daily_data)} records")
                except Exception as format_error:
                    print(f"Error formatting daily data: {format_error}")
                    print(f"Daily data columns: {daily_data.columns.tolist()}")
                    print(f"Daily data index type: {type(daily_data.index)}")
            
            # Only try other timeframes if we have daily data (indicates ticker is valid)
            if not has_daily_data:
                print(f"No daily data found for {ticker}, skipping other timeframes")
                return chart_data
            
            # Try hourly data (with rate limiting)
            ChartDataService._rate_limit()
            hourly_data = ChartDataService._fetch_timeframe_data_safe(
                ticker, start_date, end_date, '1h'
            )
            if not hourly_data.empty:
                chart_data['timeframes']['1h'] = ChartDataService._format_ohlcv_data(hourly_data)
                print(f"Hourly data: {len(hourly_data)} records")
            
            # Try 5-minute data (with rate limiting) 
            ChartDataService._rate_limit()
            minute_data_5m = ChartDataService._fetch_timeframe_data_safe(
                ticker, start_date, end_date, '5m'
            )
            if not minute_data_5m.empty:
                chart_data['timeframes']['5m'] = ChartDataService._format_ohlcv_data(minute_data_5m)
                print(f"5-minute data: {len(minute_data_5m)} records")
            
            # Try 1-minute data (with rate limiting)
            ChartDataService._rate_limit()
            minute_data_1m = ChartDataService._fetch_timeframe_data_safe(
                ticker, start_date, end_date, '1m'
            )
            if not minute_data_1m.empty:
                chart_data['timeframes']['1m'] = ChartDataService._format_ohlcv_data(minute_data_1m)
                print(f"1-minute data: {len(minute_data_1m)} records")
            
            return chart_data
            
        except Exception as e:
            print(f"Error in get_chart_data for {ticker}: {str(e)}")
            # Return empty structure with error info instead of raising exception
            return {
                "ticker": ticker,
                "entry_date": entry_date.isoformat(),
                "exit_date": exit_date.isoformat() if exit_date else None,
                "timeframes": {},
                "error": str(e)
            }
    
    @staticmethod
    def _fetch_timeframe_data_safe(ticker_symbol: str, start_date: datetime, end_date: datetime, interval: str) -> pd.DataFrame:
        """Safely fetch data for a specific timeframe with comprehensive error handling"""
        try:
            print(f"Fetching {interval} data for {ticker_symbol}")
            
            # Calculate how old the trade is for intraday data decisions
            current_date = datetime.now().date()
            entry_date_only = start_date.date()
            days_since_entry = (current_date - entry_date_only).days
            
            # Calculate the period needed based on date range
            date_diff = (end_date - start_date).days
            
            # Map date ranges to periods that yfinance accepts
            if date_diff <= 7:
                period = "1mo"
            elif date_diff <= 30:
                period = "3mo"
            elif date_diff <= 90:
                period = "6mo"
            elif date_diff <= 365:
                period = "1y"
            elif date_diff <= 730:
                period = "2y"
            else:
                period = "5y"
            
            # For intraday data, use shorter periods as they have limitations
            if interval in ['1m', '5m']:
                period = "7d"  # Very limited history for minute data
            elif interval == '1h':
                period = "1mo"  # Limited history for hourly data
            
            print(f"Using period '{period}' for {interval} data")
            
            # Use yf.download() with period parameter (like the successful export script)
            data = yf.download(
                ticker_symbol,
                period=period,
                interval=interval,
                progress=False,  # Crucial - prevents output interference
                auto_adjust=True,
                prepost=False,
                actions=False
            )
            
            if not data.empty:
                # Filter the data to our desired date range - handle timezone-aware vs naive dates
                # Skip date filtering for intraday data if trade is older than data availability
                should_filter = True
                if interval in ['1m', '5m'] and days_since_entry > 5:
                    print(f"Skipping date filter for {interval}: trade is {days_since_entry} days old, using all available data")
                    should_filter = False
                elif interval == '1h' and days_since_entry > 25:
                    print(f"Skipping date filter for {interval}: trade is {days_since_entry} days old, using all available data")
                    should_filter = False
                
                if not should_filter:
                    print(f"Returning all available {interval} data: {len(data)} records")
                    return data
                
                try:
                    # Ensure start_date and end_date are timezone-aware if data.index is timezone-aware
                    if hasattr(data.index, 'tz') and data.index.tz is not None:
                        # Data has timezone info
                        if start_date.tzinfo is None:
                            # Convert naive dates to timezone-aware (assume UTC)
                            import pytz
                            start_date = pytz.utc.localize(start_date)
                            end_date = pytz.utc.localize(end_date)
                    else:
                        # Data is timezone-naive, ensure our dates are too
                        if hasattr(start_date, 'tz_localize'):
                            start_date = start_date.tz_localize(None)
                        if hasattr(end_date, 'tz_localize'):
                            end_date = end_date.tz_localize(None)
                    
                    # Create the mask safely
                    mask = (data.index >= start_date) & (data.index <= end_date)
                    filtered_data = data.loc[mask]
                    
                    print(f"Filtered to {len(filtered_data)} records within date range")
                    return filtered_data
                    
                except Exception as filter_error:
                    print(f"Error filtering data by date: {filter_error}")
                    print(f"Data index type: {type(data.index)}")
                    print(f"Start date type: {type(start_date)}")
                    print(f"End date type: {type(end_date)}")
                    
                    # Fallback: return all data if filtering fails
                    print("Returning unfiltered data as fallback")
                    return data
            else:
                print(f"No data returned for {interval} with period {period}")
                return pd.DataFrame()
                
        except Exception as e:
            print(f"Error fetching {interval} data for {ticker_symbol}: {str(e)}")
            return pd.DataFrame()
    
    @staticmethod
    def _fetch_timeframe_data(stock: yf.Ticker, start_date: datetime, end_date: datetime, interval: str) -> pd.DataFrame:
        """Legacy method - keeping for compatibility"""
        return ChartDataService._fetch_timeframe_data_safe(stock.ticker, start_date, end_date, interval)
    
    @staticmethod
    def _format_ohlcv_data(df: pd.DataFrame) -> List[Dict]:
        """Format pandas DataFrame to JSON-serializable format"""
        if df.empty:
            return []
        
        try:
            # Handle multi-level columns that yfinance sometimes returns
            if df.columns.nlevels > 1:
                print(f"Multi-level columns detected: {df.columns.tolist()}")
                # Flatten the columns - take the first level (Price types)
                df.columns = df.columns.get_level_values(0)
                print(f"Flattened columns: {df.columns.tolist()}")
            
            formatted_data = []
            for index, row in df.iterrows():
                # Handle potential Series ambiguity by explicitly checking for NaN
                timestamp_str = index.isoformat() if hasattr(index, 'isoformat') else str(index)
                
                formatted_data.append({
                    'timestamp': timestamp_str,
                    'open': float(row['Open']) if pd.notna(row['Open']) and row['Open'] is not None else None,
                    'high': float(row['High']) if pd.notna(row['High']) and row['High'] is not None else None,
                    'low': float(row['Low']) if pd.notna(row['Low']) and row['Low'] is not None else None,
                    'close': float(row['Close']) if pd.notna(row['Close']) and row['Close'] is not None else None,
                    'volume': int(row['Volume']) if pd.notna(row['Volume']) and row['Volume'] is not None else None
                })
            
            print(f"Successfully formatted {len(formatted_data)} data points")
            return formatted_data
            
        except Exception as e:
            print(f"Error in _format_ohlcv_data: {str(e)}")
            print(f"DataFrame columns: {df.columns.tolist()}")
            print(f"DataFrame index type: {type(df.index)}")
            print(f"DataFrame shape: {df.shape}")
            print(f"Sample row: {df.iloc[0] if len(df) > 0 else 'No data'}")
            raise
    
    @staticmethod
    def get_current_price(ticker: str) -> Optional[float]:
        """Get current price for a ticker with rate limiting"""
        try:
            ChartDataService._rate_limit()
            
            # Try to get recent data instead of info (which is rate limited more heavily)
            data = yf.download(ticker, period='1d', progress=False)
            if not data.empty:
                return float(data['Close'].iloc[-1])
            
            return None
        except Exception as e:
            print(f"Error getting current price for {ticker}: {str(e)}")
            return None
    
    @staticmethod
    def validate_ticker(ticker: str) -> bool:
        """Validate if ticker exists using rate-limited approach"""
        try:
            print(f"Validating ticker: {ticker}")
            
            # Apply rate limiting
            ChartDataService._rate_limit()
            
            # Use the same yf.download approach that works in export_ticker_data.py
            data = yf.download(ticker, period='5d', progress=False)
            
            if not data.empty:
                print(f"Validation successful for {ticker} - found {len(data)} days of data")
                return True
            else:
                print(f"No data found for {ticker}")
                return False
                
        except Exception as e:
            print(f"Validation error for {ticker}: {str(e)}")
            return False