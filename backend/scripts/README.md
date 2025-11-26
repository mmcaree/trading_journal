# Backend Scripts

This directory contains utility scripts for database management, analysis, and maintenance.

## Query Performance Analysis

### `analyze_queries.py`
Comprehensive query performance analysis tool that fetches timing data from the running application and generates detailed reports.

**⚠️ Development Only** - Requires application running in development mode (`ENVIRONMENT=development`)

**Usage:**
```bash
# Console output
python analyze_queries.py

# Markdown report
python analyze_queries.py --format markdown --output report.md

# JSON export
python analyze_queries.py --format json --output report.json
```

**Features:**
- Top 10 slowest queries identification
- N+1 query pattern detection
- Optimization recommendations
- Index suggestions
- Multiple output formats

**Requirements:**
- Application must be running on `http://localhost:8000`
- `ENVIRONMENT=development` (query stats disabled in production)
- Install: `pip install requests`

**Documentation:** See `QUERY_LOGGING_GUIDE.md` for detailed usage instructions.

**Production Note:** In production, use APM tools (DataDog, New Relic) instead of this script.

---

## Database Management

### `railway_add_indexes.py`
Adds performance indexes to the Railway production database.

**Usage:**
```bash
python railway_add_indexes.py
```

---

## Other Scripts

Additional scripts for maintenance and database operations can be found in this directory.

---

## Installation

Some scripts require additional dependencies:

```bash
pip install requests  # For analyze_queries.py
```

---

## Documentation

- **Quick Start Guide**: `QUERY_LOGGING_GUIDE.md`
- **Performance Analysis**: `../../PERFORMANCE_ANALYSIS.md`
- **Implementation Details**: `../../QUERY_LOGGING_IMPLEMENTATION.md`
