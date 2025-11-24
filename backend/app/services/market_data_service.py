"""
Market Data Service - Fetch historical price data for chart visualization
"""

import requests
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from functools import lru_cache

logger = logging.getLogger(__name__)


class MarketDataService:
    """Service for fetching historical market data"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        # Using Alpha Vantage as default (you can switch to Yahoo Finance or others)
        self.base_url = "https://www.alphavantage.co/query"
    
    def get_historical_prices(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Fetch historical daily prices for a symbol within date range
        
        Returns list of dicts with: { date, open, high, low, close, volume }
        """
        try:
            # Convert to cache-friendly string format for caching
            start_str = start_date.strftime("%Y-%m-%d")
            end_str = end_date.strftime("%Y-%m-%d")
            
            # Alpha Vantage approach
            if self.api_key:
                return self._fetch_alpha_vantage_cached(symbol, start_str, end_str)
            else:
                # Fallback to Yahoo Finance (no API key needed)
                return self._fetch_yahoo_finance_cached(symbol, start_str, end_str)
                
        except Exception as e:
            logger.error(f"Error fetching historical data for {symbol}: {e}")
            return []
    
    @lru_cache(maxsize=100)
    def _fetch_yahoo_finance_cached(
        self,
        symbol: str,
        start_date_str: str,
        end_date_str: str
    ) -> List[Dict[str, Any]]:
        """Cached wrapper for Yahoo Finance fetch"""
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
        return self._fetch_yahoo_finance(symbol, start_date, end_date)
    
    @lru_cache(maxsize=100)
    def _fetch_alpha_vantage_cached(
        self,
        symbol: str,
        start_date_str: str,
        end_date_str: str
    ) -> List[Dict[str, Any]]:
        """Cached wrapper for Alpha Vantage fetch"""
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
        return self._fetch_alpha_vantage(symbol, start_date, end_date)
    
    def _fetch_alpha_vantage(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """Fetch from Alpha Vantage API"""
        try:
            params = {
                "function": "TIME_SERIES_DAILY",
                "symbol": symbol,
                "apikey": self.api_key,
                "outputsize": "full"
            }
            
            response = requests.get(self.base_url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if "Time Series (Daily)" not in data:
                logger.warning(f"No data returned for {symbol}")
                return []
            
            time_series = data["Time Series (Daily)"]
            result = []
            
            for date_str, values in time_series.items():
                date = datetime.strptime(date_str, "%Y-%m-%d")
                
                if start_date <= date <= end_date:
                    result.append({
                        "date": date_str,
                        "open": float(values["1. open"]),
                        "high": float(values["2. high"]),
                        "low": float(values["3. low"]),
                        "close": float(values["4. close"]),
                        "volume": int(values["5. volume"])
                    })
            
            # Sort by date ascending
            result.sort(key=lambda x: x["date"])
            return result
            
        except Exception as e:
            logger.error(f"Alpha Vantage API error for {symbol}: {e}")
            return []
    
    def _fetch_yahoo_finance(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Fetch from Yahoo Finance using their unofficial API
        No API key needed - completely free!
        """
        try:
            # Convert dates to timestamps
            start_ts = int(start_date.timestamp())
            end_ts = int(end_date.timestamp())
            
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
            params = {
                "period1": start_ts,
                "period2": end_ts,
                "interval": "1d",
                "includePrePost": "false",
                "events": "div,splits"
            }
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            
            response = requests.get(url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # Check for errors in response
            if "chart" not in data:
                logger.error(f"No chart data in response for {symbol}")
                return []
            
            if "error" in data["chart"] and data["chart"]["error"]:
                logger.error(f"Yahoo Finance error for {symbol}: {data['chart']['error']}")
                return []
            
            if "result" not in data["chart"] or not data["chart"]["result"]:
                logger.error(f"No result data for {symbol}")
                return []
            
            chart_data = data["chart"]["result"][0]
            
            # Validate required fields
            if "timestamp" not in chart_data:
                logger.error(f"No timestamp data for {symbol}")
                return []
            
            if "indicators" not in chart_data or "quote" not in chart_data["indicators"]:
                logger.error(f"No quote data for {symbol}")
                return []
            
            timestamps = chart_data["timestamp"]
            quotes = chart_data["indicators"]["quote"][0]
            
            result = []
            for i, ts in enumerate(timestamps):
                # Skip entries with null values
                if (quotes["open"][i] is None or 
                    quotes["high"][i] is None or 
                    quotes["low"][i] is None or 
                    quotes["close"][i] is None):
                    continue
                
                date = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
                result.append({
                    "date": date,
                    "open": float(quotes["open"][i]),
                    "high": float(quotes["high"][i]),
                    "low": float(quotes["low"][i]),
                    "close": float(quotes["close"][i]),
                    "volume": int(quotes["volume"][i] or 0)
                })
            
            logger.info(f"Successfully fetched {len(result)} data points for {symbol}")
            return result
            
        except Exception as e:
            logger.error(f"Yahoo Finance API error for {symbol}: {str(e)}", exc_info=True)
            return []
    
    def get_position_chart_data(
        self,
        symbol: str,
        opened_at: datetime,
        closed_at: Optional[datetime] = None,
        days_before: int = 7,
        days_after: int = 7
    ) -> Dict[str, Any]:
        """
        Get chart data for a position including context days before/after
        
        Returns:
        {
            "symbol": "AAPL",
            "entry_date": "2024-01-15",
            "exit_date": "2024-02-20" or None,
            "entry_price": 150.25,
            "exit_price": 155.75 or None,
            "price_data": [...],
            "date_range": {
                "start": "2024-01-08",
                "end": "2024-02-27"
            }
        }
        """
        start_date = opened_at - timedelta(days=days_before)
        end_date = (closed_at or datetime.now()) + timedelta(days=days_after)
        
        price_data = self.get_historical_prices(symbol, start_date, end_date)
        
        return {
            "symbol": symbol,
            "entry_date": opened_at.strftime("%Y-%m-%d"),
            "exit_date": closed_at.strftime("%Y-%m-%d") if closed_at else None,
            "price_data": price_data,
            "date_range": {
                "start": start_date.strftime("%Y-%m-%d"),
                "end": end_date.strftime("%Y-%m-%d")
            }
        }


# For backwards compatibility and easy import
def get_market_data_service(api_key: Optional[str] = None) -> MarketDataService:
    """Factory function to create market data service"""
    return MarketDataService(api_key)
