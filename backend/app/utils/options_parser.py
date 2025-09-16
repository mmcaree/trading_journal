"""
Options Symbol Parser for Backend
Parses options symbols in the format: TICKER + YYMMDD + C/P + STRIKE_PRICE
Example: INTC250926C00030000 = INTC, Sep 26 2025, Call, $30 strike
"""

import re
from datetime import datetime
from typing import Optional, Dict, Any

def is_options_symbol(symbol: str) -> bool:
    """
    Checks if a symbol is an options symbol
    Options symbols typically have a format like: TICKER + YYMMDD + C/P + STRIKE
    """
    if not symbol or len(symbol) < 15:
        return False
    
    # Look for pattern: letters + 6 digits (date) + C/P + 8 digits (strike)
    options_pattern = r'^[A-Z]+\d{6}[CP]\d{8}$'
    return bool(re.match(options_pattern, symbol))

def parse_options_symbol(symbol: str) -> Dict[str, Any]:
    """
    Parses an options symbol into its components
    Format: TICKER + YYMMDD + C/P + STRIKE_PRICE (8 digits)
    Example: INTC250926C00030000
    
    Returns dict with:
    - is_options: bool
    - ticker: str
    - expiration_date: datetime (if options)
    - option_type: str ('call' or 'put') (if options)
    - strike_price: float (if options)
    """
    
    if not is_options_symbol(symbol):
        return {
            'is_options': False,
            'ticker': symbol,
            'expiration_date': None,
            'option_type': None,
            'strike_price': None
        }

    try:
        # Find where the date starts (6 digits followed by C/P)
        match = re.match(r'^([A-Z]+)(\d{6})([CP])(\d{8})$', symbol)
        
        if not match:
            return {
                'is_options': False,
                'ticker': symbol,
                'expiration_date': None,
                'option_type': None,
                'strike_price': None
            }

        ticker, date_str, option_type_char, strike_price_str = match.groups()
        
        # Parse date (YYMMDD format)
        year = 2000 + int(date_str[:2])
        month = int(date_str[2:4])
        day = int(date_str[4:6])
        expiration_date = datetime(year, month, day)
        
        # Parse option type
        option_type = 'call' if option_type_char == 'C' else 'put'
        
        # Parse strike price (8 digits representing dollars and cents)
        # Example: 00030000 = $30.00, 00300000 = $300.00
        strike_price = int(strike_price_str) / 1000.0
        
        return {
            'is_options': True,
            'ticker': ticker,
            'expiration_date': expiration_date,
            'option_type': option_type,
            'strike_price': strike_price
        }
        
    except (ValueError, IndexError) as e:
        print(f"Error parsing options symbol {symbol}: {e}")
        return {
            'is_options': False,
            'ticker': symbol,
            'expiration_date': None,
            'option_type': None,
            'strike_price': None
        }

def convert_options_price(contract_price: float) -> float:
    """
    Converts options contract price to actual dollar value
    Options contracts are quoted per share but represent 100 shares
    Example: $0.07 per contract = $7.00 actual value
    """
    return contract_price * 100.0

def convert_to_contract_price(actual_price: float) -> float:
    """
    Converts actual dollar value back to options contract price
    Example: $7.00 actual value = $0.07 per contract
    """
    return actual_price / 100.0

def format_options_display(ticker: str, expiration_date: datetime, option_type: str, strike_price: float) -> str:
    """
    Formats options info for display
    """
    expiration_str = expiration_date.strftime('%b %d %y')
    type_str = 'C' if option_type == 'call' else 'P'
    strike_str = f'${strike_price:.0f}' if strike_price == int(strike_price) else f'${strike_price:.2f}'
    
    return f"{ticker} {expiration_str} {strike_str}{type_str}"