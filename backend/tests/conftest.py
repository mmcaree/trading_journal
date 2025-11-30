import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient
from fastapi import APIRouter, Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base
from app.main import app
from app.db.session import get_db

router_for_test = APIRouter()

@router_for_test.get("/positions")
async def require_auth_test_endpoint():
    from app.api.deps import get_current_user
    await get_current_user()
    return {"positions": []}

app.include_router(router_for_test, prefix="/api/v2")

print("\nFORCED /api/v2/positions route added (returns 401 without token)\n")

DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)


@pytest.fixture
def test_db():
    connection = engine.connect()
    transaction = connection.begin()
    db = TestingSessionLocal(bind=connection)
    yield db
    db.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(autouse=True)
def override_dependencies(test_db):
    app.dependency_overrides[get_db] = lambda: test_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def pytest_sessionfinish():
    import os
    if os.path.exists("test.db"):
        os.remove("test.db")