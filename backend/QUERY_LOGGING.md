# Query Performance Logging

## Production-First Design

This system defaults to **production mode** for safety. No environment variables needed for deployment!

## Default Behavior (Production Mode)

When you deploy or run the application normally:

```bash
# Just run normally - production mode is automatic
python -m uvicorn app.main:app
```

**Automatic Production Settings:**
- ✅ 500ms slow query threshold
- ✅ WARNING level logging (slow queries only)
- ✅ No in-memory storage (zero memory overhead)
- ✅ Debug endpoints disabled
- ✅ Query parameters never logged (security)

## Development Mode (Opt-In)

To enable debugging features locally:

```bash
# Set environment variable
export ENVIRONMENT=development  # Linux/Mac
$env:ENVIRONMENT="development"  # PowerShell

# Then run
python -m uvicorn app.main:app --reload
```

**Development Features:**
- 🔧 100ms slow query threshold
- 🔧 INFO level logging (all queries)
- 🔧 In-memory query statistics
- 🔧 `/api/debug/query-stats` endpoint enabled
- 🔧 Query parameters logged for debugging

## Why Production-First?

**Problem Solved:** No more accidentally deploying with debug features enabled!

- ❌ **Before**: Had to remember to set `ENVIRONMENT=production` for every deployment
- ✅ **Now**: Production mode is the default - nothing to configure
- ✅ **Benefit**: Safe by default, explicit opt-in for debugging

## Quick Reference

| Mode | Trigger | Use Case |
|------|---------|----------|
| **Production** | No env var (default) | Deployments, staging, production |
| **Development** | `ENVIRONMENT=development` | Local debugging, optimization work |

## Documentation

- **Quick Start**: `backend/scripts/QUERY_LOGGING_GUIDE.md`
- **Production Guide**: `PRODUCTION_CHECKLIST.md`
- **Performance Analysis**: `PERFORMANCE_ANALYSIS.md`

## Analysis Script

The analysis script only works in development mode:

```bash
# 1. Enable development mode
export ENVIRONMENT=development

# 2. Run your app and generate traffic
python -m uvicorn app.main:app --reload

# 3. Run analysis
python scripts/analyze_queries.py --format markdown --output report.md
```

## Deployment

**Railway, AWS, Docker, etc.:**
- Just deploy normally
- No environment variables needed
- System automatically uses production mode
- Monitor slow queries in your logs

**Optional:** Add APM tool (DataDog, New Relic, Sentry) for advanced monitoring
