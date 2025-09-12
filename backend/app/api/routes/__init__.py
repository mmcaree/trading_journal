from fastapi import APIRouter

from app.api.routes import trades, users, auth, charts, analytics, debug

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["authentication"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(trades.router, prefix="/trades", tags=["trades"])
router.include_router(charts.router, prefix="/charts", tags=["charts"])
router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
router.include_router(debug.router, prefix="/debug", tags=["debug"])
