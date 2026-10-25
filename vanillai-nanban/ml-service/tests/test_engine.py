from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import engine
from app.main import app

client = TestClient(app)
LABELS = {"Clear", "Partly Cloudy", "Cloudy", "Fog", "Drizzle", "Rain", "Snow", "Thunderstorm"}


def synth(hours=168, end=None, noise=0.3, seed=1, gap=None):
    """Chennai-like diurnal cycle: warmest ~15:00, humid and rainy at night."""
    rng = np.random.default_rng(seed)
    end = end or datetime(2026, 10, 24, 12, tzinfo=timezone.utc)
    rows = []
    for i in range(hours):
        t = end - timedelta(hours=hours - 1 - i)
        phase = np.sin(2 * np.pi * (t.hour - 9) / 24)
        temp = 28 + 5 * phase + rng.normal(0, noise)
        hum = 70 - 18 * phase + rng.normal(0, 2)
        wind = 12 + 4 * phase + rng.normal(0, 0.8)
        cond = "Rain" if hum > 82 else ("Clear" if phase > 0.3 else "Cloudy")
        rows.append({"time": t.isoformat(), "temperature": temp, "humidity": hum,
                     "wind_speed": wind, "precipitation": 1.0 if cond == "Rain" else 0.0, "condition": cond})
    if gap:
        rows = [r for i, r in enumerate(rows) if not (gap[0] <= i < gap[1])]
    return rows


def points(rows):
    return [engine.Point(datetime.fromisoformat(r["time"]), r["temperature"], r["humidity"],
                         r["wind_speed"], r["precipitation"], r["condition"]) for r in rows]


def true_temp(t):
    return 28 + 5 * np.sin(2 * np.pi * (t.hour - 9) / 24)


def test_learns_the_daily_cycle():
    res = engine.predict(points(synth()), [3, 6, 12, 24, 48])
    assert [p["hours_ahead"] for p in res["predictions"]] == [3, 6, 12, 24, 48]
    errs = [abs(p["predicted_temp"] - true_temp(datetime.fromisoformat(p["predicted_for"].replace("Z", "+00:00"))))
            for p in res["predictions"]]
    assert float(np.mean(errs)) < 1.5, errs        # noise-free truth is a clean sinusoid


def test_beats_naive_persistence_at_12h():
    rows = synth()
    res = engine.predict(points(rows), [12])
    p = res["predictions"][0]
    t = datetime.fromisoformat(p["predicted_for"].replace("Z", "+00:00"))
    persistence = rows[-1]["temperature"]
    assert abs(p["predicted_temp"] - true_temp(t)) < abs(persistence - true_temp(t))


def test_output_contract():
    res = engine.predict(points(synth()), [6, 24])
    assert res["model"]["training_samples"] > 50
    assert res["model"]["mae_temp"] is not None and res["model"]["mae_temp"] < 3
    for p in res["predictions"]:
        assert p["predicted_condition"] in LABELS
        assert 0.05 <= p["confidence_score"] <= 0.95
        assert p["predicted_for"].endswith("Z")


def test_confidence_not_higher_for_further_horizons_on_average():
    res = engine.predict(points(synth(noise=1.0)), [3, 48])
    near, far = res["predictions"]
    assert far["confidence_score"] <= near["confidence_score"] + 0.05


def test_less_history_means_less_confidence():
    full = engine.predict(points(synth(168)), [6])["predictions"][0]["confidence_score"]
    short = engine.predict(points(synth(60)), [6])["predictions"][0]["confidence_score"]
    assert short < full


def test_too_little_history_is_rejected():
    with pytest.raises(engine.InsufficientHistory):
        engine.predict(points(synth(24)), [6])


def test_small_gap_is_interpolated_large_gap_uses_latest_segment():
    ok = engine.predict(points(synth(168, gap=(80, 83))), [6])
    assert ok["predictions"]
    with pytest.raises(engine.InsufficientHistory):          # 20h hole leaves only 30 usable hours
        engine.predict(points(synth(168, gap=(118, 138))), [6])


def test_missing_fields_do_not_break_it():
    rows = synth()
    for r in rows[::5]:
        r["humidity"] = None
        r["wind_speed"] = None
        r["condition"] = None
    assert engine.predict(points(rows), [6])["predictions"]


def test_is_deterministic():
    a = engine.predict(points(synth()), [6, 24])
    b = engine.predict(points(synth()), [6, 24])
    assert a == b


# ---------------------------------------------------------------- HTTP layer

def test_api_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_api_predict_ok():
    r = client.post("/predict", json={"history": synth(), "horizons": [3, 24]})
    assert r.status_code == 200
    assert len(r.json()["predictions"]) == 2


def test_api_rejects_short_history_with_422():
    r = client.post("/predict", json={"history": synth(20), "horizons": [3]})
    assert r.status_code == 422


def test_api_rejects_bad_horizons():
    assert client.post("/predict", json={"history": synth(), "horizons": [0]}).status_code == 422
    assert client.post("/predict", json={"history": synth(), "horizons": [500]}).status_code == 422
    assert client.post("/predict", json={"history": synth(), "horizons": []}).status_code == 422


def test_api_rejects_garbage():
    assert client.post("/predict", json={"history": "nope"}).status_code == 422
