from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

DATA = Path(__file__).resolve().parents[1] / "data"


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    db = tmp_path_factory.mktemp("db") / "test.db"
    settings = Settings(_env_file=None, app_env="test", database_url=f"sqlite:///{db.as_posix()}", data_dir=DATA,
                        openrouter_api_key=None, jev_api_key=None, log_level="WARNING")
    with TestClient(create_app(settings)) as c:
        yield c


def wait_run(client: TestClient, run_id: str, timeout: float = 60) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = client.get(f"/ai/analysis/{run_id}").json()
        if r["status"] in ("COMPLETED", "FAILED"):
            return r
        time.sleep(0.1)
    raise TimeoutError(run_id)
