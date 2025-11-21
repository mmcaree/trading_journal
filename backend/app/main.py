from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.routes import router as api_router
from app.core.config import settings
from app.models.position_models import Base
from app.db.session import engine
import datetime
import os
import mimetypes

# Configure MIME types for JavaScript modules.
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')

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
    print("✅ REAL admin routes loaded successfully")
except Exception as e:
    print(f"❌ CRITICAL: Could not load admin routes: {type(e).__name__}: {e}")
    import traceback
    print(f"❌ Full traceback: {traceback.format_exc()}")
    # Create a minimal fallback admin router
    from fastapi import APIRouter
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
    print("⚠️  Using FALLBACK admin router - real admin routes failed to load")

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
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="API route not found")
        
        # Serve index.html for React Router routes
        index_path = os.path.join(static_path, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Page not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
