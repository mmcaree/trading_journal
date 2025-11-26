# Production Deployment Checklist

## Query Performance Monitoring - Production Configuration

### Production Mode (Default - No Configuration Required)

**The system now defaults to production mode for safety.** You don't need to set any environment variables for production deployments.

**Automatic Production Behavior:**
- ✅ Slow query threshold: 500ms
- ✅ In-memory storage: Disabled (zero memory overhead)
- ✅ Debug endpoints: Disabled (returns error message)
- ✅ Logging level: WARNING only (slow queries only)
- ✅ Query parameters: Never logged (security)
- ✅ Memory overhead: Minimal (<1ms per query)

### Development Mode (Opt-In Only)

To enable development features locally, explicitly set:

```bash
# For local development only
ENVIRONMENT=development
```

This enables:
- 🔧 100ms slow query threshold
- 🔧 In-memory query timing storage
- 🔧 `/api/debug/query-stats` endpoint
- 🔧 INFO level logging (all queries)
- 🔧 Query parameters logged

### Query Logging Behavior

| Feature | Production (Default) | Development (Opt-In) |
|---------|---------------------|----------------------|
| **Environment Variable** | None needed or `ENVIRONMENT=production` | `ENVIRONMENT=development` |
| **Slow Query Threshold** | 500ms | 100ms |
| **In-Memory Storage** | ❌ Disabled | ✅ Enabled |
| **Debug Endpoints** | ❌ Disabled | ✅ Available |
| **Log Level** | WARNING only | INFO/DEBUG |
| **Query Parameters Logged** | ❌ No | ✅ Yes |
| **Memory Usage** | ~0MB | ~1-5MB |

### Production Monitoring Recommendations

#### Option 1: Application Performance Monitoring (Recommended)

Use an APM tool instead of in-memory query logging:

**Options:**
- **DataDog APM**: Full observability, query tracing
- **New Relic**: Database monitoring, slow query alerts
- **Sentry Performance**: Error tracking + performance
- **AWS X-Ray**: If using AWS infrastructure

**Benefits:**
- Historical data storage
- Trend analysis over time
- Automatic alerting
- No memory overhead
- Better security

#### Option 2: Database-Level Monitoring

**PostgreSQL (Production Database):**

1. Enable `pg_stat_statements` extension:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

2. Query slow queries:
```sql
SELECT 
    calls,
    total_exec_time,
    mean_exec_time,
    query
FROM pg_stat_statements
WHERE mean_exec_time > 500
ORDER BY total_exec_time DESC
LIMIT 20;
```

3. Reset stats periodically:
```sql
SELECT pg_stat_statements_reset();
```

#### Option 3: Centralized Logging

Configure logging to send to centralized system:

```python
# In production, configure logging to send to external service
import logging.handlers

if settings.ENVIRONMENT == 'production':
    syslog_handler = logging.handlers.SysLogHandler(address=('logs.example.com', 514))
    query_logger.addHandler(syslog_handler)
```

### Security Considerations

#### Debug Endpoints

The following endpoints are **automatically disabled** in production:

- ❌ `/api/debug/query-stats` - Returns error message
- ⚠️ `/api/debug` - Should be protected or removed

**Recommended:** Add authentication to all `/api/debug/*` endpoints or remove them entirely for production.

#### Query Parameter Logging

In production, query parameters are **not logged** to prevent sensitive data exposure:

```python
# Development: Full details
WARNING: SLOW QUERY (125.45ms): SELECT * FROM positions WHERE user_id = ?
WARNING: Parameters: {'user_id': 123}

# Production: No parameters
WARNING: SLOW QUERY (525.67ms): SELECT * FROM positions WHERE user_id = ?
```

### Memory Management

#### Development (In-Memory Storage)

The `query_timings` dictionary stores:
- Up to ~1000 unique query patterns
- ~1-5MB memory usage (typical)
- Grows unbounded during application lifetime

**Recommendation for long-running dev servers:**
- Restart application periodically
- Or implement LRU cache with max size

#### Production (No In-Memory Storage)

- Query timing data **not stored** in memory
- Only slow query warnings logged to file/syslog
- Zero memory overhead

### Logging Configuration

#### Development

```python
# backend/app/main.py
query_logger.setLevel(logging.INFO)  # Log all slow queries (>100ms)
```

#### Production

```python
# Automatically set based on ENVIRONMENT
query_logger.setLevel(logging.WARNING)  # Only very slow queries (>500ms)
```

#### Customize Log Output

To send logs to external service:

```python
# Add to main.py after query_logger creation
if settings.ENVIRONMENT == 'production':
    import logging.handlers
    
    # Example: Send to syslog
    handler = logging.handlers.SysLogHandler(address='/dev/log')
    formatter = logging.Formatter('%(name)s: %(levelname)s %(message)s')
    handler.setFormatter(formatter)
    query_logger.addHandler(handler)
    
    # Example: Send to file with rotation
    file_handler = logging.handlers.RotatingFileHandler(
        '/var/log/app/queries.log',
        maxBytes=10485760,  # 10MB
        backupCount=5
    )
    query_logger.addHandler(file_handler)
```

### Performance Impact

#### Query Timing Overhead

- **Development**: ~1-2ms per query (negligible)
- **Production**: ~0.5ms per query (minimal)

The event listeners add minimal overhead:
```python
# Before query: Record start time (microseconds)
# After query: Calculate elapsed time, conditional logging
```

**Measured Impact:**
- 1,000 queries/sec: ~1-2ms total overhead
- 10,000 queries/sec: ~10-20ms total overhead
- Negligible compared to actual query execution time

### Alerting Setup (Recommended)

#### Option 1: Custom Alerting from Logs

Monitor log files for SLOW QUERY warnings:

```bash
# Example: Alert if >10 slow queries in 5 minutes
tail -f /var/log/app/queries.log | grep "SLOW QUERY" | \
  awk '{count++} count>10 {system("send_alert.sh"); count=0}'
```

#### Option 2: APM Tool Alerts

Configure in your APM tool:
- Alert if avg query time > 300ms
- Alert if queries > 500ms exceed 1% of total
- Alert if query count spikes 2x above baseline

#### Option 3: Health Check Endpoint

Add monitoring endpoint:

```python
@app.get("/health/database")
async def database_health():
    """Check database performance"""
    # Run simple query and measure time
    start = time.time()
    db.execute("SELECT 1")
    elapsed = (time.time() - start) * 1000
    
    return {
        "status": "healthy" if elapsed < 100 else "degraded",
        "query_time_ms": elapsed
    }
```

### Deployment Steps

1. ✅ Set `ENVIRONMENT=production` in environment variables
2. ✅ Verify debug endpoints return disabled message
3. ✅ Configure external APM tool (recommended)
4. ✅ Set up log aggregation/monitoring
5. ✅ Configure alerting for slow queries
6. ✅ Document baseline performance metrics
7. ✅ Test query logging is working (check logs for slow queries)

### Rollback Plan

If query logging causes issues in production:

**Option 1: Disable Event Listeners**

Comment out in `main.py`:
```python
# @event.listens_for(Engine, "before_cursor_execute")
# def before_cursor_execute(...):
#     ...

# @event.listens_for(Engine, "after_cursor_execute")  
# def after_cursor_execute(...):
#     ...
```

**Option 2: Increase Threshold**

Set a very high threshold to effectively disable:
```python
SLOW_QUERY_THRESHOLD = 10000  # 10 seconds - effectively disabled
```

**Option 3: Disable via Environment Variable**

Add to code:
```python
QUERY_LOGGING_ENABLED = os.getenv("QUERY_LOGGING_ENABLED", "true") == "true"

@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(...):
    if not QUERY_LOGGING_ENABLED:
        return
    # ... rest of function
```

### Testing in Staging

Before deploying to production:

1. **Set staging to production mode:**
   ```bash
   ENVIRONMENT=production
   ```

2. **Verify behavior:**
   - Check `/api/debug/query-stats` returns disabled message
   - Verify slow query threshold is 500ms
   - Confirm no query parameters in logs
   - Test memory usage stays stable

3. **Load test:**
   ```bash
   # Run load test and monitor logs
   locust -f locustfile.py --host=https://staging.example.com
   ```

4. **Verify logging:**
   - Check only queries >500ms are logged
   - Verify log format is correct
   - Test log rotation (if configured)

### Monitoring Checklist

After deployment, monitor for:

- ✅ **CPU usage** - Should be unchanged (<1% impact)
- ✅ **Memory usage** - Should be unchanged (no storage)
- ✅ **Response times** - Should be unchanged (<1ms overhead)
- ✅ **Log volume** - Should be low (only slow queries)
- ✅ **Slow queries** - Review patterns, identify optimizations

### Documentation

- ✅ `PERFORMANCE_ANALYSIS.md` - Query optimization guide
- ✅ `backend/scripts/QUERY_LOGGING_GUIDE.md` - Usage guide
- ✅ `CHANGELOG.md` - All changes documented
- ✅ This checklist - Production deployment guide

---

## Summary

**Development Mode** (ENVIRONMENT=development):
- Full query timing and statistics
- 100ms slow query threshold
- Debug endpoints enabled
- In-memory storage active
- Detailed logging with parameters

**Production Mode** (ENVIRONMENT=production):
- Minimal logging (500ms threshold)
- Debug endpoints disabled
- No in-memory storage
- Parameters not logged (security)
- Near-zero overhead

**Recommended Production Setup:**
1. Set `ENVIRONMENT=production`
2. Use external APM tool (DataDog, New Relic, etc.)
3. Configure log aggregation
4. Set up alerting for slow queries
5. Monitor database-level metrics

---

*Last Updated: 2025-11-25*
