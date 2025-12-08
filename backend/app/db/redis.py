"""
Redis client setup and connection management
"""
import redis
from redis.exceptions import RedisError
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

# Global Redis client
_redis_client = None

def get_redis_client():
    """
    Get or create Redis client connection.
    Returns None if Redis is unavailable (graceful degradation).
    """
    global _redis_client
    
    if _redis_client is None:
        try:
            _redis_client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30
            )
            # Test connection
            _redis_client.ping()
            logger.info(f"✅ Redis connected successfully: {settings.REDIS_URL}")
        except RedisError as e:
            logger.warning(f"⚠️  Redis unavailable: {e}. Caching disabled - continuing without cache.")
            _redis_client = None
        except RecursionError as e:
            logger.error(f"❌ Redis recursion error (check circular imports): {e}")
            _redis_client = None
        except Exception as e:
            logger.error(f"❌ Redis connection error: {e}")
            _redis_client = None
    
    return _redis_client

def close_redis_connection():
    """Close Redis connection on application shutdown"""
    global _redis_client
    if _redis_client:
        try:
            _redis_client.close()
            logger.info("Redis connection closed")
        except Exception as e:
            logger.error(f"Error closing Redis connection: {e}")
        finally:
            _redis_client = None

def is_redis_available() -> bool:
    """Check if Redis is available"""
    global _redis_client
    
    # If client is None, Redis is not available
    if _redis_client is None:
        return False
    
    # If client exists, verify it's still working
    try:
        _redis_client.ping()
        return True
    except (RedisError, Exception):
        return False
