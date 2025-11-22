from fastapi import APIRouter
from . import users, auth, analytics, debug, positions_v2, position_images

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["authentication"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(positions_v2.router, prefix="/v2/positions", tags=["positions-v2"])
router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
router.include_router(debug.router, prefix="/debug", tags=["debug"])
router.include_router(position_images.router, prefix="/position-images", tags=["position-images"])
