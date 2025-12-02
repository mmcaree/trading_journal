"""
Quick test script to validate caching functionality.
Tests both with and without Redis available.
"""
import sys
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add app to path
sys.path.insert(0, 'c:/Users/mmcar/Desktop/Dev/TradeJournal/backend')

from app.core.config import settings
from app.models.position_models import User, TradingPosition
from app.services.position_service import PositionService
from app.utils.cache import get_cache_stats, CacheInvalidator
from app.db.redis import is_redis_available

def test_caching():
    """Test position caching with real database"""
    print("\n" + "="*60)
    print("REDIS CACHING TEST")
    print("="*60)
    
    # Check Redis availability
    redis_status = "✅ AVAILABLE" if is_redis_available() else "⚠️ NOT AVAILABLE (graceful mode)"
    print(f"\nRedis Status: {redis_status}")
    
    # Create database session
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # Get first user and position for testing
        user = db.query(User).first()
        if not user:
            print("❌ No users found - cannot test")
            return
            
        position = db.query(TradingPosition).filter_by(user_id=user.id).first()
        if not position:
            print("❌ No positions found - cannot test")
            return
            
        print(f"\nTest User: {user.email}")
        print(f"Test Position ID: {position.id}")
        
        # Create service
        service = PositionService(db)
        
        # Clear cache stats and any existing cache
        from app.utils.cache import cache_stats
        cache_stats['hits'] = 0
        cache_stats['misses'] = 0
        cache_stats['errors'] = 0
        CacheInvalidator.invalidate_position(position.id, user.id)
        
        print("\n" + "-"*60)
        print("TEST 1: First Request (should be cache MISS)")
        print("-"*60)
        
        start = time.time()
        result1 = service.get_position(position.id, include_events=True)
        time1 = (time.time() - start) * 1000
        
        print(f"✓ Position retrieved: {result1.ticker}")
        print(f"✓ Response time: {time1:.2f}ms")
        
        stats1 = get_cache_stats()
        print(f"✓ Cache stats: {stats1}")
        
        print("\n" + "-"*60)
        print("TEST 2: Second Request (should be cache HIT if Redis available)")
        print("-"*60)
        
        start = time.time()
        result2 = service.get_position(position.id, include_events=True)
        time2 = (time.time() - start) * 1000
        
        print(f"✓ Position retrieved: {result2.ticker}")
        print(f"✓ Response time: {time2:.2f}ms")
        
        stats2 = get_cache_stats()
        print(f"✓ Cache stats: {stats2}")
        
        # Calculate improvement
        if time1 > 0:
            improvement = ((time1 - time2) / time1) * 100
            print(f"\n⚡ Speed improvement: {improvement:.1f}%")
        
        print("\n" + "-"*60)
        print("TEST 3: Cache Invalidation")
        print("-"*60)
        
        CacheInvalidator.invalidate_position(position.id, user.id)
        print("✓ Cache invalidated")
        
        start = time.time()
        result3 = service.get_position(position.id, include_events=True)
        time3 = (time.time() - start) * 1000
        
        print(f"✓ Position retrieved: {result3.ticker}")
        print(f"✓ Response time: {time3:.2f}ms")
        
        stats3 = get_cache_stats()
        print(f"✓ Cache stats: {stats3}")
        
        print("\n" + "-"*60)
        print("TEST 4: Get Multiple Positions (user cache)")
        print("-"*60)
        
        # Clear user cache
        CacheInvalidator.invalidate_user_positions(user.id)
        
        start = time.time()
        positions1 = service.get_user_positions(user.id)
        time_first = (time.time() - start) * 1000
        
        print(f"✓ Retrieved {len(positions1)} positions")
        print(f"✓ Response time: {time_first:.2f}ms")
        
        start = time.time()
        positions2 = service.get_user_positions(user.id)
        time_second = (time.time() - start) * 1000
        
        print(f"✓ Retrieved {len(positions2)} positions (cached)")
        print(f"✓ Response time: {time_second:.2f}ms")
        
        if time_first > 0:
            improvement = ((time_first - time_second) / time_first) * 100
            print(f"\n⚡ Speed improvement: {improvement:.1f}%")
        
        # Final stats
        print("\n" + "="*60)
        print("FINAL CACHE STATISTICS")
        print("="*60)
        final_stats = get_cache_stats()
        print(f"Total Requests: {final_stats['hits'] + final_stats['misses']}")
        print(f"Cache Hits: {final_stats['hits']}")
        print(f"Cache Misses: {final_stats['misses']}")
        print(f"Hit Rate: {final_stats.get('hit_rate_percent', 0):.1f}%")
        print(f"Errors: {final_stats['errors']}")
        
        if is_redis_available():
            if final_stats.get('hit_rate_percent', 0) >= 50:
                print("\n✅ SUCCESS: Cache hit rate >= 50%")
            else:
                print("\n⚠️ WARNING: Cache hit rate < 50%")
        else:
            print("\n✅ SUCCESS: Graceful degradation working (no Redis)")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_caching()
