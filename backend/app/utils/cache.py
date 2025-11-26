"""
Redis caching utility with decorators and invalidation strategies

Features:
- Automatic cache key generation
- TTL management
- Cache invalidation
- Graceful degradation (works without Redis)
- Cache hit/miss tracking
"""
import json
import logging
import hashlib
from functools import wraps
from typing import Optional, Callable, Any, Union
from datetime import timedelta
from redis.exceptions import RedisError

from app.db.redis import get_redis_client, is_redis_available

logger = logging.getLogger(__name__)

# Cache statistics
cache_stats = {
    'hits': 0,
    'misses': 0,
    'errors': 0,
    'invalidations': 0
}

# Default TTL values (in seconds)
TTL_SHORT = 300      # 5 minutes - for frequently changing data
TTL_MEDIUM = 1800    # 30 minutes - for position data
TTL_LONG = 3600      # 1 hour - for analytics
TTL_VERY_LONG = 7200 # 2 hours - for rarely changing data

class CacheKeyGenerator:
    """Generate consistent cache keys"""
    
    @staticmethod
    def generate(prefix: str, *args, **kwargs) -> str:
        """
        Generate a cache key from prefix and arguments
        
        Example: cache:positions:user:123:status:open
        """
        parts = [prefix]
        
        # Add positional arguments
        for arg in args:
            if arg is not None:
                parts.append(str(arg))
        
        # Add keyword arguments (sorted for consistency)
        for key in sorted(kwargs.keys()):
            value = kwargs[key]
            if value is not None:
                parts.append(f"{key}:{value}")
        
        key = ":".join(parts)
        
        # If key is too long, hash it
        if len(key) > 200:
            key_hash = hashlib.md5(key.encode()).hexdigest()
            return f"{prefix}:hash:{key_hash}"
        
        return key
    
    @staticmethod
    def pattern(prefix: str) -> str:
        """Generate pattern for bulk invalidation"""
        return f"{prefix}:*"


def cached(
    prefix: str,
    ttl: int = TTL_MEDIUM,
    key_builder: Optional[Callable] = None
):
    """
    Decorator to cache function results in Redis
    
    Args:
        prefix: Cache key prefix (e.g., 'positions', 'analytics')
        ttl: Time to live in seconds
        key_builder: Optional custom function to build cache key from function args
        
    Usage:
        @cached(prefix='position', ttl=TTL_MEDIUM)
        def get_position(position_id: int):
            return db.query(Position).get(position_id)
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            # Skip cache if Redis unavailable
            if not is_redis_available():
                logger.debug(f"Redis unavailable, bypassing cache for {func.__name__}")
                return func(*args, **kwargs)
            
            redis_client = get_redis_client()
            
            # Generate cache key
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                cache_key = CacheKeyGenerator.generate(prefix, *args, **kwargs)
            
            try:
                # Try to get from cache
                cached_value = redis_client.get(cache_key)
                
                if cached_value is not None:
                    cache_stats['hits'] += 1
                    logger.debug(f"Cache HIT: {cache_key}")
                    return json.loads(cached_value)
                
                # Cache miss - execute function
                cache_stats['misses'] += 1
                logger.debug(f"Cache MISS: {cache_key}")
                result = func(*args, **kwargs)
                
                # Store in cache if result is serializable
                if result is not None:
                    try:
                        redis_client.setex(
                            cache_key,
                            ttl,
                            json.dumps(result, default=str)
                        )
                        logger.debug(f"Cache SET: {cache_key} (TTL: {ttl}s)")
                    except (TypeError, ValueError) as e:
                        logger.warning(f"Cannot cache result for {cache_key}: {e}")
                
                return result
                
            except RedisError as e:
                cache_stats['errors'] += 1
                logger.error(f"Redis error in {func.__name__}: {e}")
                # Gracefully degrade - return function result without caching
                return func(*args, **kwargs)
        
        return wrapper
    return decorator


class CacheInvalidator:
    """Handle cache invalidation"""
    
    @staticmethod
    def invalidate_key(key: str) -> bool:
        """Invalidate a specific cache key"""
        if not is_redis_available():
            return False
        
        redis_client = get_redis_client()
        try:
            deleted = redis_client.delete(key)
            if deleted:
                cache_stats['invalidations'] += 1
                logger.debug(f"Cache INVALIDATE: {key}")
            return deleted > 0
        except RedisError as e:
            logger.error(f"Error invalidating cache key {key}: {e}")
            return False
    
    @staticmethod
    def invalidate_pattern(pattern: str) -> int:
        """
        Invalidate all keys matching a pattern
        
        Example: invalidate_pattern('positions:user:123:*')
        """
        if not is_redis_available():
            return 0
        
        redis_client = get_redis_client()
        try:
            keys = redis_client.keys(pattern)
            if keys:
                deleted = redis_client.delete(*keys)
                cache_stats['invalidations'] += deleted
                logger.debug(f"Cache INVALIDATE PATTERN: {pattern} ({deleted} keys)")
                return deleted
            return 0
        except RedisError as e:
            logger.error(f"Error invalidating pattern {pattern}: {e}")
            return 0
    
    @staticmethod
    def invalidate_user_positions(user_id: int):
        """Invalidate all position caches for a user"""
        patterns = [
            f"position:user:{user_id}:*",
            f"positions:user:{user_id}:*",
            f"analytics:user:{user_id}:*",
            f"performance:user:{user_id}:*"
        ]
        total = 0
        for pattern in patterns:
            total += CacheInvalidator.invalidate_pattern(pattern)
        logger.info(f"Invalidated {total} cache keys for user {user_id}")
        return total
    
    @staticmethod
    def invalidate_position(position_id: int, user_id: Optional[int] = None):
        """Invalidate caches for a specific position"""
        patterns = [
            f"position:{position_id}:*",
            f"position:*:{position_id}:*",
        ]
        
        if user_id:
            patterns.extend([
                f"positions:user:{user_id}:*",
                f"analytics:user:{user_id}:*"
            ])
        
        total = 0
        for pattern in patterns:
            total += CacheInvalidator.invalidate_pattern(pattern)
        
        logger.info(f"Invalidated {total} cache keys for position {position_id}")
        return total
    
    @staticmethod
    def clear_all_cache() -> bool:
        """Clear entire cache (use with caution!)"""
        if not is_redis_available():
            return False
        
        redis_client = get_redis_client()
        try:
            redis_client.flushdb()
            logger.warning("⚠️  Cleared entire Redis cache")
            return True
        except RedisError as e:
            logger.error(f"Error clearing cache: {e}")
            return False


def get_cache_stats() -> dict:
    """Get cache performance statistics"""
    total_requests = cache_stats['hits'] + cache_stats['misses']
    hit_rate = (cache_stats['hits'] / total_requests * 100) if total_requests > 0 else 0
    
    return {
        'hits': cache_stats['hits'],
        'misses': cache_stats['misses'],
        'errors': cache_stats['errors'],
        'invalidations': cache_stats['invalidations'],
        'total_requests': total_requests,
        'hit_rate_percent': round(hit_rate, 2),
        'redis_available': is_redis_available()
    }


def reset_cache_stats():
    """Reset cache statistics"""
    cache_stats['hits'] = 0
    cache_stats['misses'] = 0
    cache_stats['errors'] = 0
    cache_stats['invalidations'] = 0
