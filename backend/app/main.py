from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.routes import router as api_router
from app.core.config import settings
from app.models.position_models import Base
from app.models import models  # Import models to register deprecated ones if needed
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
    print("Admin routes loaded successfully")
except ImportError as e:
    print(f"Warning: Could not load admin routes: {e}")
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
    
    # Serve index.html for root and all SPA routes
    @app.get("/")
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str = ""):
        """Serve React SPA for all non-API routes"""
        # Don't interfere with API routes, assets, or docs
        if (full_path.startswith("api/") or 
            full_path.startswith("assets/") or 
            full_path.startswith("static/") or
            full_path.startswith("docs") or 
            full_path.startswith("openapi.json")):
            return {"error": "Not found"}
        
        # Serve index.html for all React Router routes
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
