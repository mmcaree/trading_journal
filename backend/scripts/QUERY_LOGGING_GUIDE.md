# Query Performance Logging - Quick Start Guide

## Overview

The query performance logging system helps identify slow database queries and optimization opportunities.

**Production-First Design:** The system defaults to production mode with minimal overhead. Development features are opt-in only.

## Quick Start

### Production Mode (Default)

The system automatically runs in production-safe mode:

```bash
cd backend
python -m uvicorn app.main:app

# Automatically uses:
# - 500ms slow query threshold
# - WARNING level logging only
# - No in-memory storage
# - Debug endpoints disabled
```

### Development Mode (For Local Debugging)

To enable development features and analysis tools:

```bash
# 1. Set environment variable
export ENVIRONMENT=development  # Linux/Mac
set ENVIRONMENT=development     # Windows CMD
$env:ENVIRONMENT="development"  # PowerShell

# Or add to .env file
echo "ENVIRONMENT=development" >> .env

# 2. Start application
cd backend
python -m uvicorn app.main:app --reload
```

### Development Features

### Development Features

**1. Generate Some Traffic**

Use the application normally to generate queries:
- Browse positions
- View analytics
- Import CSV data

**2. View Real-Time Stats (Development Only)**

Check current query performance:

```bash
curl http://localhost:8000/api/debug/query-stats | python -m json.tool
```

Or visit in browser: `http://localhost:8000/api/debug/query-stats`

**Note:** This endpoint automatically returns an error in production mode.

**3. Generate Analysis Report (Development Only)**

Run the analysis script:

```bash
# Console output
python backend/scripts/analyze_queries.py

# Save as markdown
python backend/scripts/analyze_queries.py --format markdown --output query_report.md

# Save as JSON
python backend/scripts/analyze_queries.py --format json --output query_report.json
```

## Understanding the Output

### Query Stats API Response

```json
{
  "total_unique_queries": 45,
  "total_query_executions": 234,
  "total_time_ms": 1234.56,
  "top_20_slowest": [
    {
      "query": "SELECT * FROM positions WHERE...",
      "count": 12,
      "total_time_ms": 450.23,
      "avg_time_ms": 37.52,
      "max_time_ms": 125.67
    }
  ],
  "n_plus_one_suspects": [
    {
      "query": "SELECT * FROM events WHERE position_id = ?",
      "count": 50,
      "total_time_ms": 789.12
    }
  ],
  "queries_over_100ms": 3
}
```

**Key Metrics:**
- `total_unique_queries`: Number of different query patterns
- `total_query_executions`: Total times queries were run
- `top_20_slowest`: Queries taking most cumulative time
- `n_plus_one_suspects`: Queries executed many times (potential N+1)
- `queries_over_100ms`: Count of slow queries

### Analysis Report Sections

1. **Summary**: Overall query statistics
2. **Top 10 Slowest**: Biggest time consumers
3. **N+1 Patterns**: Repeated query patterns
4. **Optimization Recommendations**: Specific suggestions

## Common Issues & Solutions

### Issue: High Query Count (N+1 Pattern)

**Symptom**: Same query executed 50+ times

```python
# BAD - Causes N+1
positions = db.query(Position).all()
for pos in positions:
    events = pos.events  # Separate query!
```

**Fix**: Use eager loading

```python
from sqlalchemy.orm import joinedload

positions = db.query(Position)\
    .options(joinedload(Position.events))\
    .all()
```

### Issue: Slow Query (>100ms)

**Symptom**: Query logged as "SLOW QUERY"

**Check**:
1. Is there an index on WHERE clause columns?
2. Are you using SELECT *?
3. Is the query result set too large?

**Fix**: Add appropriate indexes

```sql
CREATE INDEX idx_positions_user_status 
ON positions(user_id, status);
```

### Issue: Many Slow Aggregations

**Symptom**: COUNT/SUM queries taking long

**Fix**: Use database aggregation

```python
# Instead of loading all and counting in Python
from sqlalchemy import func

total = db.query(func.sum(Position.pnl))\
    .filter_by(user_id=user_id)\
    .scalar()
```

## Monitoring in Development

### Watch Logs for Slow Queries

The application automatically logs queries >100ms:

```
WARNING:sqlalchemy.query_performance:SLOW QUERY (125.45ms): SELECT * FROM positions WHERE...
WARNING:sqlalchemy.query_performance:Parameters: {'user_id': 123}
```

### Configure Logging Level

To see all queries (including fast ones):

```python
# In main.py, change:
query_logger.setLevel(logging.DEBUG)  # Instead of INFO
```

## Production Considerations

⚠️ **Important**: The current implementation stores query timing in-memory.

### For Production:

1. **Disable or Sample**: Only log slow queries, not all queries
2. **External Storage**: Send metrics to APM tool (DataDog, New Relic)
3. **Memory Management**: Clear `query_timings` dict periodically
4. **Security**: Protect `/api/debug/*` endpoints

### Example Production Config:

```python
# Only log very slow queries in production
SLOW_QUERY_THRESHOLD = 500  # ms
if total_ms > SLOW_QUERY_THRESHOLD:
    query_logger.warning(f"SLOW QUERY ({total_ms:.2f}ms)")
```

## Testing

Run the query performance tests:

```bash
cd backend
python -m pytest tests/test_query_performance.py -v
```

## Next Steps

1. ✅ Run analysis on your application
2. ✅ Identify top 3 slowest queries
3. ✅ Check for N+1 patterns
4. ✅ Add recommended indexes
5. ✅ Re-run analysis and compare

## Resources

- Full documentation: `PERFORMANCE_ANALYSIS.md`
- SQLAlchemy Performance: https://docs.sqlalchemy.org/en/14/faq/performance.html
- PostgreSQL Optimization: https://www.postgresql.org/docs/current/performance-tips.html

## Troubleshooting

### No queries showing up?

- Make sure you've used the application to generate queries
- Check that event listeners are registered (they run on import)
- Verify the API is actually running

### Analysis script fails?

```bash
# Check if API is accessible
curl http://localhost:8000/api/debug

# Install requests if missing
pip install requests
```

### Want to reset statistics?

Restart the application - query timings are in-memory only.

## Example Workflow

```bash
# 1. Start application
cd backend
python -m uvicorn app.main:app --reload

# 2. Use the app (browse, import data, etc.)

# 3. Check for slow queries in logs
# Look for "SLOW QUERY" warnings

# 4. Generate report
python scripts/analyze_queries.py --format markdown --output perf_report.md

# 5. Review report and implement fixes

# 6. Re-run to measure improvement
python scripts/analyze_queries.py
```
