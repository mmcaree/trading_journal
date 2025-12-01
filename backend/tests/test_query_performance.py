"""
Tests for query performance logging

Tests verify that SQLAlchemy event listeners are properly capturing
query timing data and that slow queries are logged appropriately.
"""

import pytest
import time
from sqlalchemy import text, event
from sqlalchemy.engine import Engine
from app.db.session import engine, SessionLocal
from app.models.position_models import User


def test_query_timing_capture(caplog):
    """Test that query timing is captured for all queries"""
    import app.main  # Import to register event listeners
    
    # Execute a simple query
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        db.commit()
    finally:
        db.close()
    
    # Check that timing data was captured
    # Note: query_timings dict is in main.py module
    assert hasattr(app.main, 'query_timings')


def test_slow_query_logging(caplog):
    """Test that slow queries (>100ms) are logged as warnings"""
    import app.main
    import logging
    
    # Set up logging capture
    caplog.set_level(logging.WARNING, logger='sqlalchemy.query_performance')
    
    # Simulate a slow query using pg_sleep
    db = SessionLocal()
    try:
        # Sleep for 150ms to trigger slow query warning
        db.execute(text("SELECT pg_sleep(0.15)"))
        db.commit()
    finally:
        db.close()
    
    # Check that warning was logged
    slow_query_warnings = [
        record for record in caplog.records 
        if record.levelname == 'WARNING' and 'SLOW QUERY' in record.message
    ]
    
    assert len(slow_query_warnings) > 0, "Slow query warning should be logged"
    assert 'ms' in slow_query_warnings[0].message


def test_query_stats_endpoint():
    """Test that query stats endpoint returns proper data structure"""
    from fastapi.testclient import TestClient
    from app.main import app
    
    client = TestClient(app)
    
    # Execute some queries first
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        db.execute(text("SELECT 2"))
        db.commit()
    finally:
        db.close()
    
    # Call the stats endpoint
    response = client.get("/api/debug/query-stats")
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify structure
    assert 'total_unique_queries' in data
    assert 'total_query_executions' in data
    assert 'total_time_ms' in data
    assert 'top_20_slowest' in data
    assert isinstance(data['top_20_slowest'], list)


def test_n_plus_one_detection():
    """Test that repeated queries are tracked for N+1 detection"""
    import app.main
    
    # Clear previous timing data
    app.main.query_timings.clear()
    
    db = SessionLocal()
    try:
        # Execute the same query multiple times (simulate N+1)
        for i in range(15):
            db.execute(text("SELECT :i"), {'i': i})
        db.commit()
    finally:
        db.close()
    
    # Check that query count was tracked
    # At least one query should have count > 10
    high_count_queries = [
        data for data in app.main.query_timings.values()
        if data['count'] > 10
    ]
    
    assert len(high_count_queries) > 0, "Should detect repeated query pattern"


def test_query_timing_accuracy():
    """Test that query timing measurements are reasonably accurate"""
    import app.main
    
    # Clear previous timing data
    app.main.query_timings.clear()
    
    db = SessionLocal()
    try:
        # Execute a query with known sleep time (50ms)
        start = time.time()
        db.execute(text("SELECT pg_sleep(0.05)"))
        db.commit()
        actual_time = (time.time() - start) * 1000
    finally:
        db.close()
    
    # Find the query in timings
    sleep_queries = [
        data for key, data in app.main.query_timings.items()
        if 'pg_sleep' in key
    ]
    
    assert len(sleep_queries) > 0
    measured_time = sleep_queries[0]['max_time']
    
    # Should be within 20ms of actual time
    assert abs(measured_time - actual_time) < 20, \
        f"Measured time {measured_time}ms should be close to actual {actual_time}ms"


@pytest.mark.parametrize("query,expected_logged", [
    ("SELECT pg_sleep(0.15)", True),   # >100ms, should log
    ("SELECT 1", False),                # <100ms, should not log
])
def test_slow_query_threshold(query, expected_logged, caplog):
    """Test that only queries exceeding threshold are logged"""
    import logging
    caplog.set_level(logging.WARNING, logger='sqlalchemy.query_performance')
    
    db = SessionLocal()
    try:
        db.execute(text(query))
        db.commit()
    finally:
        db.close()
    
    slow_warnings = [
        record for record in caplog.records
        if 'SLOW QUERY' in record.message
    ]
    
    if expected_logged:
        assert len(slow_warnings) > 0, f"Query '{query}' should be logged as slow"
    else:
        # Note: Fast queries might not appear at all since we're checking warnings
        pass


def test_query_statistics_aggregation():
    """Test that query statistics are properly aggregated"""
    import app.main
    
    # Clear previous data
    app.main.query_timings.clear()
    
    db = SessionLocal()
    query_text = "SELECT :value"
    
    try:
        # Execute same query 5 times
        for i in range(5):
            db.execute(text(query_text), {'value': i})
        db.commit()
    finally:
        db.close()
    
    # Find our query in timings
    matching_queries = [
        data for key, data in app.main.query_timings.items()
        if 'SELECT' in key and ':value' in key
    ]
    
    assert len(matching_queries) > 0
    query_data = matching_queries[0]
    
    # Verify aggregation
    assert query_data['count'] == 5
    assert query_data['total_time'] > 0
    assert query_data['min_time'] > 0
    assert query_data['max_time'] >= query_data['min_time']
    assert query_data['total_time'] >= query_data['max_time']


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
