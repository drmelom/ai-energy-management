"""API contract + full pipeline ground truth through the HTTP layer. Offline (rules/template providers)."""
from __future__ import annotations

import pytest

from tests.conftest import wait_run


def test_health_reports_offline_providers(client):
    r = client.get("/health").json()
    assert r["status"] == "ok" and r["readings"] == 4032
    assert r["providers"] == {"decision": "rules", "explanation": "template"}


def test_login(client):
    assert client.post("/auth/login", json={"username": "admin", "password": "nope"}).status_code == 401
    r = client.post("/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200 and r.json()["token"] == "demo-token"


def test_error_shape_and_request_id(client):
    r = client.get("/meters/M-999", headers={"X-Request-ID": "abc123"})
    assert r.status_code == 404 and r.headers["X-Request-ID"] == "abc123"
    assert r.json()["error"] == {"code": "METER_NOT_FOUND", "message": "No existe el medidor 'M-999'.",
                                 "details": {"meter_id": "M-999"}, "request_id": "abc123"}


def test_meters_before_any_run(client):
    r = client.get("/meters").json()
    assert r["total"] == 12 and r["analysis_run_id"] is None
    m109 = next(i for i in r["items"] if i["meter_id"] == "M-109")
    assert m109["status"] == "UNKNOWN" and m109["anomaly"] is None
    assert m109["variation_pct"] == pytest.approx(110.5, abs=0.5)


def test_readings_daily_with_baseline(client):
    r = client.get("/meters/M-109/readings", params={"resolution": "daily", "include_baseline": "true"}).json()
    assert r["resolution"] == "daily" and len(r["points"]) == 14
    last = r["points"][-1]
    assert last["consumption_kwh"] == pytest.approx(2207.6, abs=1) and last["deviation_pct"] == pytest.approx(110.5, abs=0.5)
    hourly = client.get("/meters/M-109/readings", params={"from": "2026-09-12T14:00:00", "to": "2026-09-12T15:00:00", "include_baseline": "true"}).json()
    assert len(hourly["points"]) == 2 and hourly["points"][0]["baseline_kwh"] > 0
    assert client.get("/meters/M-109/readings", params={"from": "2026-09-13", "to": "2026-09-12"}).status_code == 400


def test_events(client):
    assert len(client.get("/events").json()["items"]) == 4
    ev = client.get("/meters/M-106/events").json()["items"]
    assert len(ev) == 1 and ev[0]["type"] == "SCHEDULED_OUTAGE"
    assert len(client.get("/events", params={"type": "UNKNOWN"}).json()["items"]) == 1


def test_anomalies_empty_before_run(client):
    r = client.get("/anomalies").json()
    assert r["total"] == 0 and r["run_id"] is None
    assert client.get("/anomalies", params={"run_id": "nope"}).status_code == 404


# ---------------- the full pipeline, through the API ----------------

@pytest.fixture(scope="module")
def completed_run(client):
    r = client.post("/ai/analyze", json={"force_refresh": True})
    assert r.status_code == 202
    body = r.json()
    assert body["reused"] is False
    return wait_run(client, body["analysis_id"])


def test_run_completes_all_seven_stages(completed_run):
    run = completed_run
    assert run["status"] == "COMPLETED" and run["error"] is None
    assert [s["key"] for s in run["stages"]] == ["readings", "baseline", "detection", "correlation", "events", "explanation", "recommendation"]
    assert all(s["status"] == "done" and s["finished_at"] for s in run["stages"])
    assert run["stages"][0]["detail"].startswith("4.032 lecturas")
    assert run["summary"]["headline"] == "4 anomalías detectadas, 2 requieren atención prioritaria"
    assert run["providers"] == {"decision": "rules", "explanation": "template"}


def test_ground_truth_ranking(client, completed_run):
    r = client.get("/anomalies").json()
    assert r["run_id"] == completed_run["id"] and r["total"] == 4
    got = [(a["meter_id"], a["type"], a["severity"], a["priority"], a["rank"]) for a in r["items"]]
    assert got[0][:4] == ("M-109", "REAL_ANOMALY", "HIGH", True)
    assert got[1][:4] == ("M-112", "DATA_QUALITY", "HIGH", True)
    assert got[2][:4] == ("M-104", "EXPLAINABLE_ANOMALY", "MEDIUM", False)
    assert got[3][:4] == ("M-106", "FALSE_POSITIVE", "LOW", False)
    assert [g[4] for g in got] == [1, 2, 3, 4]
    assert all(a["reason"] and a["recommended_action"] for a in r["items"])
    assert all(a["providers"] == {"decision": "rules", "explanation": "template"} for a in r["items"])


def test_anomaly_detail_has_evidence_and_meta(client, completed_run):
    top = client.get("/anomalies").json()["items"][0]
    d = client.get(f"/anomalies/{top['id']}").json()
    assert d["window"]["hours"] == 58
    kinds = {e["kind"] for e in d["evidence"]}
    assert {"CONSUMPTION_DEVIATION", "POWER_FACTOR_DROP", "NO_EXPLAINING_EVENT"} <= kinds
    assert d["events_matched"][0]["relation"] == "reported_no_explanation"
    assert d["ai_meta"]["decision_provider"] == "rules" and "jev:no_api_key" in d["ai_meta"]["fallback_notes"]
    assert client.get("/anomalies/99999").status_code == 404


def test_meter_status_and_filters_after_run(client, completed_run):
    r = client.get("/meters", params={"sort": "severity"}).json()
    assert r["analysis_run_id"] == completed_run["id"]
    assert [i["meter_id"] for i in r["items"][:2]] == ["M-109", "M-112"]
    by = {i["meter_id"]: i["status"] for i in r["items"]}
    assert by["M-109"] == "CRITICAL" and by["M-112"] == "CRITICAL" and by["M-104"] == "WARNING" and by["M-106"] == "NORMAL"
    assert client.get("/meters", params={"status": "CRITICAL"}).json()["total"] == 2
    assert client.get("/meters", params={"search": "109"}).json()["total"] == 1
    top = client.get("/meters", params={"sort": "consumption", "order": "desc"}).json()["items"][0]
    assert top["meter_id"] == "M-104"


def test_meter_detail(client, completed_run):
    d = client.get("/meters/M-109").json()
    assert d["status"] == "CRITICAL" and len(d["baseline"]["hourly"]) == 24 and d["events_count"] == 1
    assert d["anomalies"][0]["type"] == "REAL_ANOMALY" and d["stats"]["min_power_factor"] < 0.75
    assert "current_a" in d["baseline"]["hourly"][0]


def test_dashboard(client, completed_run):
    d = client.get("/dashboard/summary").json()
    assert d["meters"]["by_status"] == {"NORMAL": 9, "WARNING": 1, "CRITICAL": 2, "UNKNOWN": 0}
    assert d["consumption"]["total_kwh"] == pytest.approx(155250.8, abs=1)
    assert d["anomalies"]["total"] == 4 and d["anomalies"]["priority"] == 2 and d["anomalies"]["open"] == 4
    assert d["last_analysis"]["headline"].startswith("4 anomalías")
    assert d["ai_mode"] == {"decision": "rules", "explanation": "template"}


def test_patch_status_and_carry_over(client, completed_run):
    top = client.get("/anomalies").json()["items"][0]
    r = client.patch(f"/anomalies/{top['id']}", json={"status": "ACKNOWLEDGED"})
    assert r.status_code == 200 and r.json()["status"] == "ACKNOWLEDGED"
    assert client.patch(f"/anomalies/{top['id']}", json={"status": "BOGUS"}).status_code == 422
    # a second run keeps the operator's status for the same (meter, type)
    run2 = wait_run(client, client.post("/ai/analyze").json()["analysis_id"])
    assert run2["status"] == "COMPLETED" and run2["id"] != completed_run["id"]
    items = client.get("/anomalies").json()["items"]
    assert items[0]["meter_id"] == "M-109" and items[0]["status"] == "ACKNOWLEDGED"
    assert client.get("/anomalies", params={"status": "OPEN"}).json()["total"] == 3
    assert len(client.get("/ai/analysis", params={"limit": 5}).json()["items"]) >= 2


def test_cached_run_reuses_answers(client, completed_run):
    run = wait_run(client, client.post("/ai/analyze", json={"force_refresh": False}).json()["analysis_id"])
    assert run["force_refresh"] is False
    assert "desde caché" in run["stages"][5]["detail"]
    top = client.get("/anomalies").json()["items"][0]
    assert client.get(f"/anomalies/{top['id']}").json()["ai_meta"]["cached"] == {"decision": True, "explanation": True}
