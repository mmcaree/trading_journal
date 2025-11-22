"""
Validation utilities for input validation across the application.
Contains reusable validators for common patterns.
"""

import re
from typing import Optional, Tuple
from datetime import datetime, timedelta


def validate_email(email: str) -> Tuple[bool, Optional[str]]:
    """
    Validate email address format.
    
    Args:
        email: Email address to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not email or not email.strip():
        return False, "Email is required"
    
    email = email.strip().lower()
    
    # Basic email regex pattern
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    
    if not re.match(email_pattern, email):
        return False, "Invalid email format"
    
    if len(email) > 254:  # RFC 5321
        return False, "Email address too long"
    
    return True, None


def validate_username(username: str) -> Tuple[bool, Optional[str]]:
    """
    Validate username format.
    
    Args:
        username: Username to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not username or not username.strip():
        return False, "Username is required"
    
    username = username.strip()
    
    if len(username) < 3:
        return False, "Username must be at least 3 characters"
    
    if len(username) > 20:
        return False, "Username must be less than 20 characters"
    
    # Only allow alphanumeric and underscores
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return False, "Username can only contain letters, numbers, and underscores"
    
    return True, None


def validate_password(password: str) -> Tuple[bool, Optional[str]]:
    """
    Validate password strength.
    
    Args:
        password: Password to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not password:
        return False, "Password is required"
    
    if len(password) < 6:
        return False, "Password must be at least 6 characters"
    
    if len(password) > 128:
        return False, "Password too long"
    
    return True, None


def validate_time_format(time_str: str) -> Tuple[bool, Optional[str]]:
    """
    Validate time format (HH:MM).
    
    Args:
        time_str: Time string to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not time_str:
        return False, "Time is required"
    
    try:
        datetime.strptime(time_str, "%H:%M")
        return True, None
    except ValueError:
        return False, "Invalid time format. Use HH:MM"


def validate_positive_number(value: float, field_name: str = "Value") -> Tuple[bool, Optional[str]]:
    """
    Validate that a number is positive.
    
    Args:
        value: Number to validate
        field_name: Name of field for error messages
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if value is None:
        return False, f"{field_name} is required"
    
    if value <= 0:
        return False, f"{field_name} must be greater than 0"
    
    return True, None


def validate_non_negative_number(value: float, field_name: str = "Value") -> Tuple[bool, Optional[str]]:
    """
    Validate that a number is non-negative.
    
    Args:
        value: Number to validate
        field_name: Name of field for error messages
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if value is None:
        return False, f"{field_name} is required"
    
    if value < 0:
        return False, f"{field_name} cannot be negative"
    
    return True, None


def validate_percentage(value: float, field_name: str = "Percentage") -> Tuple[bool, Optional[str]]:
    """
    Validate percentage value (0-100).
    
    Args:
        value: Percentage to validate
        field_name: Name of field for error messages
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if value is None:
        return False, f"{field_name} is required"
    
    if value < 0 or value > 100:
        return False, f"{field_name} must be between 0 and 100"
    
    return True, None


def validate_ticker(ticker: str) -> Tuple[bool, Optional[str]]:
    """
    Validate stock ticker symbol.
    
    Args:
        ticker: Ticker symbol to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not ticker or not ticker.strip():
        return False, "Ticker is required"
    
    ticker = ticker.strip().upper()
    
    if len(ticker) < 1 or len(ticker) > 10:
        return False, "Ticker must be 1-10 characters"
    
    # Basic ticker format (letters and numbers)
    if not re.match(r'^[A-Z0-9]+$', ticker):
        return False, "Invalid ticker format"
    
    return True, None


def validate_date_range(start_date: Optional[datetime], end_date: Optional[datetime]) -> Tuple[bool, Optional[str]]:
    """
    Validate date range.
    
    Args:
        start_date: Start date
        end_date: End date
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if start_date and end_date:
        if start_date > end_date:
            return False, "Start date must be before end date"
        
        # Check if date range is reasonable (not more than 10 years)
        if (end_date - start_date).days > 3650:
            return False, "Date range too large (maximum 10 years)"
    
    # Check dates aren't too far in the future
    if start_date and start_date > datetime.now() + timedelta(days=365):
        return False, "Start date too far in future"
    
    if end_date and end_date > datetime.now() + timedelta(days=365):
        return False, "End date too far in future"
    
    return True, None


def validate_shares(shares: int) -> Tuple[bool, Optional[str]]:
    """
    Validate share quantity.
    
    Args:
        shares: Number of shares
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if shares is None:
        return False, "Shares is required"
    
    if shares <= 0:
        return False, "Shares must be greater than 0"
    
    if shares > 1000000:  # Reasonable upper limit
        return False, "Shares value too large"
    
    return True, None


def validate_price(price: float) -> Tuple[bool, Optional[str]]:
    """
    Validate stock price.
    
    Args:
        price: Price value
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if price is None:
        return False, "Price is required"
    
    if price <= 0:
        return False, "Price must be greater than 0"
    
    if price > 1000000:  # Reasonable upper limit
        return False, "Price value too large"
    
    return True, None


def sanitize_string(value: str, max_length: Optional[int] = None) -> str:
    """
    Sanitize string input by removing extra whitespace and optionally truncating.
    
    Args:
        value: String to sanitize
        max_length: Optional maximum length
        
    Returns:
        Sanitized string
    """
    if not value:
        return ""
    
    # Remove extra whitespace
    sanitized = " ".join(value.split())
    
    # Truncate if needed
    if max_length and len(sanitized) > max_length:
        sanitized = sanitized[:max_length].strip()
    
    return sanitized
