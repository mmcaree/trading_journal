from fastapi import FastAPI, APIRouter, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from app.api.routes import router as api_router
from app.core.config import settings
from app.models.position_models import Base
from app.db.session import engine
from app.utils.exceptions import AppException, ErrorResponse, NotFoundException, UnauthorizedException
import datetime
import os
import mimetypes
import traceback
import logging
import time
from sqlalchemy import event
from sqlalchemy.engine import Engine

# Configure MIME types for JavaScript modules.
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')

# Configure query logging
query_logger = logging.getLogger('sqlalchemy.query_performance')

# Set logging level based on environment
# In production, only log warnings (slow queries >100ms)
# Query logging - production mode by default
# Production (default): WARNING level, 500ms threshold, minimal logging
# Development (opt-in): INFO level, 100ms threshold, full statistics
# Set ENVIRONMENT=development to enable detailed query monitoring
query_logger.setLevel(logging.INFO if settings.ENVIRONMENT == 'development' else logging.WARNING)

# Store query timing data (in-memory - for development mode only)
# In production, use external APM tools (DataDog, New Relic, Sentry)
query_timings = {}

# Slow query threshold in milliseconds
SLOW_QUERY_THRESHOLD = 100 if settings.ENVIRONMENT == 'development' else 500

@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """
    Event listener that runs before each SQL query execution.
    Records the start time for query timing.
    """
    conn.info.setdefault('query_start_time', []).append(time.time())
    query_logger.debug(f"Query starting: {statement[:100]}...")

@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """
    Event listener that runs after each SQL query execution.
    Calculates query duration and logs slow queries.
    
    In production: Only logs queries exceeding 500ms
    In development: Logs queries exceeding 100ms
    """
    total_time = time.time() - conn.info['query_start_time'].pop(-1)
    total_ms = total_time * 1000
    
    # Store timing data for analysis (development mode only)
    if settings.ENVIRONMENT == 'development':
        query_key = statement[:200]  # Use first 200 chars as key
        if query_key not in query_timings:
            query_timings[query_key] = {
                'count': 0,
                'total_time': 0,
                'min_time': float('inf'),
                'max_time': 0,
                'statement': statement
            }
        
        query_timings[query_key]['count'] += 1
        query_timings[query_key]['total_time'] += total_ms
        query_timings[query_key]['min_time'] = min(query_timings[query_key]['min_time'], total_ms)
        query_timings[query_key]['max_time'] = max(query_timings[query_key]['max_time'], total_ms)
    
    # Log slow queries as warnings
    if total_ms > SLOW_QUERY_THRESHOLD:
        query_logger.warning(
            f"SLOW QUERY ({total_ms:.2f}ms): {statement[:200]}..."
        )
        if settings.ENVIRONMENT == 'development':
            query_logger.warning(f"Parameters: {parameters}")
    else:
        query_logger.debug(f"Query completed in {total_ms:.2f}ms")

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SwingTrader API", description="Trading journal API inspired by swing trading strategies")

# Add GZip compression middleware for better performance
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Configure CORS - use the cors_origins_list property
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/debug")
async def debug_endpoint():
    """Debug endpoint to verify API is functioning and CORS is configured correctly"""
    return {
        "status": "ok",
        "message": "API is running correctly",
        "timestamp": str(datetime.datetime.now()),
        "database_url": settings.DATABASE_URL[:20] + "..." if settings.DATABASE_URL else "Not set",
        "cors_settings": {
            "allow_origins": settings.cors_origins_list,
            "allow_credentials": True,
            "allow_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        },
        "static_files": os.path.exists(os.path.join(os.path.dirname(__file__), "..", "static")),
        "secret_key_set": bool(settings.SECRET_KEY and settings.SECRET_KEY != "development_secret_key")
    }

@app.get("/api/debug/query-stats")
async def query_stats_endpoint():
    """
    Debug endpoint to view query timing statistics.
    Shows top 20 slowest queries and N+1 query patterns.
    
    ⚠️ DEVELOPMENT ONLY - Automatically disabled in production
    """
    # Only available in development mode
    if settings.ENVIRONMENT != 'development':
        return {
            "error": "Query stats only available in development mode",
            "message": "Set ENVIRONMENT=development to enable. Use APM tools for production monitoring."
        }
    
    if not query_timings:
        return {
            "message": "No queries recorded yet",
            "total_queries": 0
        }
    
    # Calculate statistics
    stats = []
    for query_key, data in query_timings.items():
        avg_time = data['total_time'] / data['count']
        stats.append({
            'query': query_key,
            'count': data['count'],
            'total_time_ms': round(data['total_time'], 2),
            'avg_time_ms': round(avg_time, 2),
            'min_time_ms': round(data['min_time'], 2),
            'max_time_ms': round(data['max_time'], 2),
        })
    
    # Sort by total time (biggest bottlenecks)
    stats.sort(key=lambda x: x['total_time_ms'], reverse=True)
    
    # Identify potential N+1 patterns (same query executed many times)
    n_plus_one_suspects = [s for s in stats if s['count'] > 10 and s['avg_time_ms'] > 10]
    
    return {
        "total_unique_queries": len(stats),
        "total_query_executions": sum(s['count'] for s in stats),
        "total_time_ms": round(sum(s['total_time_ms'] for s in stats), 2),
        "top_20_slowest": stats[:20],
        "n_plus_one_suspects": n_plus_one_suspects[:10],
        "queries_over_100ms": len([s for s in stats if s['max_time_ms'] > 100])
    }

# Include API routers FIRST (before static files)
app.include_router(api_router, prefix="/api")

# Include new v2 position routes
from app.api.routes.positions_v2 import router as positions_v2_router, journal_router
app.include_router(positions_v2_router, prefix="/api/v2")
app.include_router(journal_router, prefix="/api/v2")

# Include admin routes with error handling
try:
    from app.api.routes.admin import router as admin_router
    app.include_router(admin_router, prefix="/api/admin")
    print("REAL admin routes loaded successfully")
except Exception as e:
    print(f"CRITICAL: Could not load admin routes: {type(e).__name__}: {e}")
    print(f"Full traceback: {traceback.format_exc()}")
    # Create a minimal fallback admin router
    fallback_admin_router = APIRouter()
    
    @fallback_admin_router.get("/status")
    async def admin_status():
        return {"status": "Admin routes not available", "error": str(e)}
    
    @fallback_admin_router.get("/students")
    async def fallback_students():
        return []  # Return empty array instead of error
    
    @fallback_admin_router.get("/analytics/class-overview")
    async def fallback_analytics():
        return {
            "total_students": 0,
            "active_students": 0,
            "total_positions": 0,
            "open_positions": 0,
            "total_class_pnl": 0,
            "flagged_students": 0,
            "average_pnl_per_student": 0
        }
    
    app.include_router(fallback_admin_router, prefix="/api/admin")
    print("Using FALLBACK admin router - real admin routes failed to load")

# Serve static files (React build) in production
static_path = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_path):
    # Mount assets and static files at specific paths to avoid conflicts
    assets_path = os.path.join(static_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
    
    # Mount favicon and other root files
    app.mount("/static", StaticFiles(directory=static_path), name="static")
    
    # Serve favicon.ico at root
    @app.get("/favicon.ico")
    async def favicon():
        favicon_path = os.path.join(static_path, "favicon.ico")
        if os.path.exists(favicon_path):
            return FileResponse(favicon_path)
        return {"error": "Favicon not found"}
    
    # Serve index.html for root and SPA routes
    @app.get("/")
    async def serve_root():
        """Serve React SPA for root"""
        index_path = os.path.join(static_path, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"error": "Index file not found"}
else:
    # Fallback for development
    @app.get("/")
    async def root():
        return {"message": "Welcome to SwingTrader API - Static files not found"}

    # Catch-all for SPA routing in development
    @app.get("/{full_path:path}")
    async def serve_spa_fallback(full_path: str):        
        return {"error": "Static files not found - run in production mode"}

# Add SPA catch-all route LAST (only in production when static files exist)
if os.path.exists(static_path):
    @app.get("/{full_path:path}")
    async def serve_spa_catchall(full_path: str):
        """Serve React SPA for non-API routes - REGISTERED LAST"""
        # Don't interfere with API routes - they should have been handled already
        if (full_path.startswith("api/") or 
            full_path.startswith("assets/") or 
            full_path.startswith("static/") or
            full_path.startswith("docs") or 
            full_path.startswith("openapi.json")):
            raise NotFoundException("Route")
        
        # Serve index.html for React Router routes
        index_path = os.path.join(static_path, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        raise NotFoundException("Page")

# Global exception handlers
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_response(),
        headers=exc.headers
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    # Handle FastAPI's default HTTPException (like OAuth2PasswordBearer 401)
    # Convert to our standard error format
    error_code = "unauthorized" if exc.status_code == 401 else "http_error"
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": error_code,
            "detail": exc.detail,
            "status_code": exc.status_code
        },
        headers=exc.headers if hasattr(exc, 'headers') and exc.headers else {}
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    import logging
    logging.exception(f"Uncaught exception: {exc}")

    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "detail": "An unexpected error occurred. Please try again later.",
            "status_code": 500
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)