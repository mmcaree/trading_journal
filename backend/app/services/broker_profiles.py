"""
Broker Profile System for Universal CSV Import

Defines broker-specific configurations for parsing trade history CSVs from different brokers.
Each broker has different column names, date formats, and transaction type notations.
"""

from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field
from datetime import datetime
import re
import pandas as pd


@dataclass
class BrokerProfile:
    """Configuration profile for a specific broker's CSV export format"""
    
    name: str
    display_name: str
    
    # Column mapping: TradeJournal field -> List of possible broker column names
    column_mappings: Dict[str, List[str]]
    
    # Date format strings to try (in order of priority)
    date_formats: List[str]
    
    # Action/transaction type mapping: broker value -> BUY/SELL
    action_mappings: Dict[str, str]
    
    # Signature columns that uniquely identify this broker
    signature_columns: List[str]
    
    # Optional custom parser for complex fields (like options notation)
    options_parser: Optional[Callable[[str], Dict[str, Any]]] = None
    
    # Currency handling
    default_currency: str = "USD"
    
    # Price cleaning (remove $, commas, etc.)
    price_cleaners: List[Callable[[str], float]] = field(default_factory=list)
    
    def __post_init__(self):
        """Set default price cleaners if none provided"""
        if not self.price_cleaners:
            self.price_cleaners = [
                lambda x: float(str(x).replace('$', '').replace(',', '')) if x else 0.0
            ]


def clean_currency_value(value: Any) -> float:
    """Remove currency symbols and convert to float"""
    if pd.isna(value) or value == '' or value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    # Remove $, commas, spaces, parentheses (for negatives)
    cleaned = str(value).replace('$', '').replace(',', '').replace(' ', '').strip()
    # Handle parentheses notation for negative numbers
    if cleaned.startswith('(') and cleaned.endswith(')'):
        cleaned = '-' + cleaned[1:-1]
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def parse_date_flexible(date_str: Any, formats: List[str]) -> Optional[datetime]:
    """Try multiple date formats until one works"""
    if pd.isna(date_str) or not date_str:
        return None
    
    date_str = str(date_str).strip()
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except (ValueError, TypeError):
            continue
    
    # Last resort: try pandas date parser
    try:
        return pd.to_datetime(date_str)
    except:
        return None


# ============================================================================
# BROKER PROFILE DEFINITIONS
# ============================================================================

WEBULL_USA_PROFILE = BrokerProfile(
    name="webull_usa",
    display_name="Webull (USA)",
    column_mappings={
        "symbol": ["Symbol", "symbol", "Ticker"],
        "action": ["Side", "side", "Action", "action", "Transaction Type"],
        "quantity": ["Total Qty", "Filled", "Quantity", "quantity", "Qty", "qty", "Shares", "shares"],
        "price": ["Avg Price", "Price", "price", "Filled Price", "Trade Price"],
        "date": ["Filled Time", "Placed Time", "Date", "date", "Trade Date", "Time"],
        "status": ["Status", "status", "Order Status"],
        "order_type": ["Time-in-Force", "Order Type", "Type", "order_type"],
        "description": ["Name", "name", "Security Name"],
    },
    date_formats=[
        "%Y-%m-%d %H:%M:%S",  # 2024-01-15 09:30:00
        "%Y-%m-%d",            # 2024-01-15
        "%m/%d/%Y %H:%M:%S",   # 01/15/2024 09:30:00
        "%m/%d/%Y",            # 01/15/2024
    ],
    action_mappings={
        "BUY": "BUY",
        "SELL": "SELL",
        "Buy": "BUY",
        "Sell": "SELL",
        "buy": "BUY",
        "sell": "SELL",
    },
    signature_columns=["Name", "Side", "Filled Time", "Time-in-Force"],
    default_currency="USD"
)

WEBULL_AUSTRALIA_PROFILE = BrokerProfile(
    name="webull_au",
    display_name="Webull (Australia)",
    column_mappings={
        "symbol": ["Symbol", "symbol"],
        "name": ["Name", "name"],
        "currency": ["Currency", "currency"],
        "type": ["Type", "type"],
        "action": ["Buy/Sell", "BUY/SELL", "Side", "Action"],
        "quantity": ["Quantity", "quantity", "Qty"],
        "price": ["Trade Price", "Price", "price"],
        "date": ["Trade Date", "Date", "date"],
        "time": ["Time", "time"],
        "gross_amount": ["Gross Amount", "Total"],
        "net_amount": ["Net Amount", "Net"],
        "commission": ["Comm/Fee/Tax", "Commission", "Fee"],
        "gst": ["GST", "Tax"],
        "exchange": ["Exchange", "exchange"],
    },
    date_formats=[
        "%Y-%m-%d",            # 2024-01-15
        "%d/%m/%Y",            # 15/01/2024 (Australian format)
        "%m/%d/%Y",            # 01/15/2024
        "%Y-%m-%d %H:%M:%S",   # 2024-01-15 09:30:00
    ],
    action_mappings={
        "BUY": "BUY",
        "SELL": "SELL",
        "Buy": "BUY",
        "Sell": "SELL",
        "B": "BUY",
        "S": "SELL",
    },
    signature_columns=["Symbol", "Name", "Currency", "Buy/Sell", "Trade Date"],
    default_currency="AUD"
)

ROBINHOOD_PROFILE = BrokerProfile(
    name="robinhood",
    display_name="Robinhood",
    column_mappings={
        "symbol": ["Symbol", "Instrument", "symbol"],
        "action": ["Trans Code", "Side", "Activity Type", "Type"],
        "quantity": ["Quantity", "Qty", "quantity", "Shares"],
        "price": ["Price", "price", "Average Price"],
        "date": ["Activity Date", "Date", "Trans Date", "Process Date"],
        "description": ["Description", "description"],
        "amount": ["Amount", "amount"],
    },
    date_formats=[
        "%Y-%m-%d",            # 2024-01-15
        "%m/%d/%Y",            # 01/15/2024
        "%b %d, %Y",           # Jan 15, 2024
    ],
    action_mappings={
        "Buy": "BUY",
        "Sell": "SELL",
        "BUY": "BUY",
        "SELL": "SELL",
        "B": "BUY",
        "S": "SELL",
        "BOUGHT": "BUY",
        "SOLD": "SELL",
    },
    signature_columns=["Activity Date", "Process Date", "Trans Code"],
    default_currency="USD"
)

TD_AMERITRADE_PROFILE = BrokerProfile(
    name="td_ameritrade",
    display_name="TD Ameritrade",
    column_mappings={
        "symbol": ["Symbol", "symbol", "Instrument"],
        "action": ["Transaction", "Action", "Type"],
        "quantity": ["Qty", "Quantity", "Shares"],
        "price": ["Price", "Exec Price", "Trade Price"],
        "date": ["Date", "Execute Date", "Trade Date"],
        "amount": ["Amount", "Net Amount"],
        "commission": ["Commission", "Comm"],
        "description": ["Description", "Desc"],
    },
    date_formats=[
        "%m/%d/%Y",            # 01/15/2024
        "%m/%d/%y",            # 01/15/24
        "%Y-%m-%d",            # 2024-01-15
        "%m/%d/%Y %H:%M:%S",   # 01/15/2024 09:30:00
    ],
    action_mappings={
        "BOUGHT": "BUY",
        "SOLD": "SELL",
        "BUY": "BUY",
        "SELL": "SELL",
        "B": "BUY",
        "S": "SELL",
        "BOT": "BUY",
        "SLD": "SELL",
    },
    signature_columns=["Date", "Transaction", "Symbol", "Qty", "Price"],
    default_currency="USD"
)

INTERACTIVE_BROKERS_PROFILE = BrokerProfile(
    name="interactive_brokers",
    display_name="Interactive Brokers (IBKR)",
    column_mappings={
        "symbol": ["Symbol", "Instrument", "Ticker"],
        "action": ["Buy/Sell", "Action", "Code"],
        "quantity": ["Shares", "Quantity", "Qty"],
        "price": ["T. Price", "Price", "Trade Price", "Exec Price"],
        "date": ["Date/Time", "Date", "Trade Date"],
        "commission": ["Comm/Fee", "Commission"],
        "proceeds": ["Proceeds", "Amount"],
        "currency": ["Currency", "Curr"],
    },
    date_formats=[
        "%Y-%m-%d %H:%M:%S",   # 2024-01-15 09:30:00
        "%Y-%m-%d, %H:%M:%S",  # 2024-01-15, 09:30:00
        "%Y-%m-%d",            # 2024-01-15
        "%m/%d/%Y",            # 01/15/2024
    ],
    action_mappings={
        "B": "BUY",
        "S": "SELL",
        "BUY": "BUY",
        "SELL": "SELL",
        "BOT": "BUY",
        "SLD": "SELL",
    },
    signature_columns=["Instrument", "Buy/Sell", "Shares", "T. Price"],
    default_currency="USD"
)

ETRADE_PROFILE = BrokerProfile(
    name="etrade",
    display_name="E*TRADE",
    column_mappings={
        "symbol": ["Symbol", "Security", "Ticker"],
        "action": ["TransactionType", "Transaction Type", "Action", "Type"],
        "quantity": ["Quantity", "Qty", "Shares"],
        "price": ["Price", "Execution Price", "Trade Price"],
        "date": ["TransactionDate", "Transaction Date", "Trade Date", "Date"],
        "amount": ["Amount", "Principal"],
        "commission": ["Commission", "Fee"],
        "description": ["SecurityDescription", "Security Description", "Description", "Desc"],
    },
    date_formats=[
        "%m/%d/%Y",            # 01/15/2024
        "%Y-%m-%d",            # 2024-01-15
        "%b %d, %Y",           # Jan 15, 2024
    ],
    action_mappings={
        "Bought": "BUY",
        "Sold": "SELL",
        "BUY": "BUY",
        "SELL": "SELL",
        "B": "BUY",
        "S": "SELL",
        "Purchase": "BUY",
        "Sale": "SELL",
    },
    signature_columns=["CUSIPNumber", "TransactionDate", "TransactionType", "SecurityType"],
    default_currency="USD"
)

FIDELITY_PROFILE = BrokerProfile(
    name="fidelity",
    display_name="Fidelity",
    column_mappings={
        "symbol": ["Symbol", "Ticker"],
        "action": ["Action", "Transaction", "Type"],
        "quantity": ["Quantity", "Qty", "Shares"],
        "price": ["Price", "Trade Price", "Price ($)"],
        "date": ["Run Date", "Trade Date", "Date"],
        "amount": ["Amount", "Amount ($)"],
        "commission": ["Commission", "Fees"],
        "settlement_date": ["Settlement Date"],
        "description": ["Security Description", "Security"],
    },
    date_formats=[
        "%m/%d/%Y",            # 01/15/2024
        "%m/%d/%y",            # 01/15/24
        "%Y-%m-%d",            # 2024-01-15
    ],
    action_mappings={
        "YOU BOUGHT": "BUY",
        "YOU SOLD": "SELL",
        "BUY": "BUY",
        "SELL": "SELL",
        "B": "BUY",
        "S": "SELL",
        "BOUGHT": "BUY",
        "SOLD": "SELL",
    },
    signature_columns=["Run Date", "Settlement Date", "Account", "Security Description"],
    default_currency="USD"
)

CHARLES_SCHWAB_PROFILE = BrokerProfile(
    name="charles_schwab",
    display_name="Charles Schwab",
    column_mappings={
        "symbol": ["Symbol", "Ticker"],
        "action": ["Action", "Type"],
        "quantity": ["Quantity", "Qty"],
        "price": ["Price", "Trade Price", "Price $"],
        "date": ["Date", "Trade Date"],
        "amount": ["Amount", "Total"],
        "commission": ["Fees & Comm", "Fees & Commissions", "Commission"],
        "description": ["Description"],
    },
    date_formats=[
        "%m/%d/%Y as of %m/%d/%Y",  # 01/15/2024 as of 01/17/2024
        "%m/%d/%Y",                  # 01/15/2024
        "%Y-%m-%d",                  # 2024-01-15
    ],
    action_mappings={
        "Buy": "BUY",
        "Sell": "SELL",
        "BUY": "BUY",
        "SELL": "SELL",
        "B": "BUY",
        "S": "SELL",
    },
    signature_columns=["Fees & Comm", "Description", "Date"],
    default_currency="USD"
)


# ============================================================================
# BROKER REGISTRY
# ============================================================================

ALL_BROKER_PROFILES = [
    WEBULL_USA_PROFILE,
    WEBULL_AUSTRALIA_PROFILE,
    ROBINHOOD_PROFILE,
    TD_AMERITRADE_PROFILE,
    INTERACTIVE_BROKERS_PROFILE,
    ETRADE_PROFILE,
    FIDELITY_PROFILE,
    CHARLES_SCHWAB_PROFILE,
]

BROKER_PROFILES_BY_NAME = {
    profile.name: profile for profile in ALL_BROKER_PROFILES
}


# ============================================================================
# BROKER DETECTION
# ============================================================================

def detect_broker_format(df: pd.DataFrame) -> Optional[BrokerProfile]:
    """
    Auto-detect broker from CSV column headers.
    
    Uses signature columns to identify the most likely broker format.
    Returns None if no confident match found.
    """
    if df is None or df.empty:
        return None
    
    # Normalize column names for comparison (case-insensitive)
    csv_columns = set(col.strip() for col in df.columns)
    csv_columns_lower = set(col.lower() for col in csv_columns)
    
    best_match = None
    best_score = 0
    
    for profile in ALL_BROKER_PROFILES:
        # Calculate match score based on signature columns
        signature_matches = 0
        for sig_col in profile.signature_columns:
            # Check exact match (case-insensitive)
            if sig_col.lower() in csv_columns_lower:
                signature_matches += 1
            # Check if any mapped column exists
            else:
                for field, possible_names in profile.column_mappings.items():
                    if sig_col in possible_names:
                        for possible_name in possible_names:
                            if possible_name.lower() in csv_columns_lower:
                                signature_matches += 0.5  # Partial credit
                                break
                        break
        
        # Calculate match percentage
        if len(profile.signature_columns) > 0:
            match_score = signature_matches / len(profile.signature_columns)
        else:
            match_score = 0
        
        # Update best match if this is better
        if match_score > best_score:
            best_score = match_score
            best_match = profile
    
    # Return match if confidence is high enough (>= 60%)
    if best_score >= 0.6:
        return best_match
    
    return None


def get_broker_profile(broker_name: str) -> Optional[BrokerProfile]:
    """Get broker profile by name"""
    return BROKER_PROFILES_BY_NAME.get(broker_name)


def list_all_brokers() -> List[Dict[str, str]]:
    """List all supported brokers"""
    return [
        {
            "name": profile.name,
            "display_name": profile.display_name,
            "default_currency": profile.default_currency,
        }
        for profile in ALL_BROKER_PROFILES
    ]


# ============================================================================
# CSV COLUMN MAPPING
# ============================================================================

def find_column_in_df(df: pd.DataFrame, possible_names: List[str]) -> Optional[str]:
    """
    Find the first matching column name in DataFrame (case-insensitive).
    
    Returns the actual column name from the DataFrame.
    """
    csv_columns = {col.strip(): col for col in df.columns}
    csv_columns_lower = {col.lower(): col for col in csv_columns.keys()}
    
    for possible_name in possible_names:
        # Try exact match (case-insensitive)
        if possible_name.lower() in csv_columns_lower:
            actual_col = csv_columns_lower[possible_name.lower()]
            return csv_columns[actual_col]
    
    return None


def map_csv_columns(df: pd.DataFrame, broker_profile: BrokerProfile) -> Dict[str, Optional[str]]:
    """
    Map CSV columns to TradeJournal fields using broker profile.
    
    Returns dict: {trade_journal_field: actual_csv_column_name}
    """
    column_map = {}
    
    for field, possible_names in broker_profile.column_mappings.items():
        actual_column = find_column_in_df(df, possible_names)
        column_map[field] = actual_column
    
    return column_map


def generate_csv_template(broker_profile: BrokerProfile) -> str:
    """
    Generate a CSV template for a specific broker format.
    
    Returns CSV string with headers and sample data.
    """
    # Use first column name from each mapping as the template header
    headers = []
    for field in ["symbol", "action", "quantity", "price", "date"]:
        if field in broker_profile.column_mappings:
            headers.append(broker_profile.column_mappings[field][0])
    
    # Add optional columns
    for field in ["commission", "status", "order_type"]:
        if field in broker_profile.column_mappings:
            headers.append(broker_profile.column_mappings[field][0])
    
    # Create sample data
    if broker_profile.name == "webull_au":
        sample_rows = [
            "AAPL,Apple Inc,USD,Stock,2024-01-15,09:30:00,BUY,100,150.00,15000.00,14995.00,5.00,0.50,NASDAQ",
            "TSLA,Tesla Inc,USD,Stock,2024-01-20,14:00:00,SELL,50,200.00,10000.00,9995.00,5.00,0.50,NASDAQ",
        ]
    elif broker_profile.name == "td_ameritrade":
        sample_rows = [
            "01/15/2024,BOUGHT,AAPL,100,$150.00",
            "01/20/2024,SOLD,AAPL,50,$155.00",
        ]
    elif broker_profile.name == "interactive_brokers":
        sample_rows = [
            "AAPL,B,100,150.00,2024-01-15 09:30:00",
            "AAPL,S,50,155.00,2024-01-20 14:00:00",
        ]
    else:
        # Generic sample data
        sample_rows = [
            "AAPL,BUY,100,150.00,2024-01-15",
            "AAPL,SELL,50,155.00,2024-01-20",
        ]
    
    # Combine headers and sample data
    csv_content = ",".join(headers) + "\n"
    csv_content += "\n".join(sample_rows)
    
    return csv_content
