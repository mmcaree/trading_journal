#!/usr/bin/env python3
"""
Datetime utilities for the application.
Provides timezone-aware datetime functions to replace deprecated utc_now()
"""

from datetime import datetime, timezone


def utc_now() -> datetime:
    """
    Get current UTC datetime (timezone-aware).
    
    Replaces the deprecated utc_now() with the recommended 
    datetime.now(datetime.UTC) approach.
    
    Returns:
        datetime: Current UTC datetime with timezone information
    """
    return datetime.now(timezone.utc)


def utc_from_timestamp(timestamp: float) -> datetime:
    """
    Create a timezone-aware UTC datetime from a timestamp.
    
    Args:
        timestamp: Unix timestamp
        
    Returns:
        datetime: UTC datetime with timezone information
    """
    return datetime.fromtimestamp(timestamp, tz=timezone.utc)


def to_utc_naive(dt: datetime) -> datetime:
    """
    Convert a timezone-aware datetime to naive UTC datetime.
    
    This is useful when working with databases that expect naive datetimes
    but you want to ensure they're in UTC.
    
    Args:
        dt: Timezone-aware datetime
        
    Returns:
        datetime: Naive datetime in UTC
    """
    if dt.tzinfo is None:
        # Already naive, assume it's UTC
        return dt
    
    # Convert to UTC and make naive
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def from_utc_naive(dt: datetime) -> datetime:
    """
    Convert a naive UTC datetime to timezone-aware UTC datetime.
    
    Args:
        dt: Naive datetime (assumed to be UTC)
        
    Returns:
        datetime: Timezone-aware UTC datetime
    """
    if dt.tzinfo is not None:
        # Already timezone-aware
        return dt
    
    # Add UTC timezone info
    return dt.replace(tzinfo=timezone.utc)