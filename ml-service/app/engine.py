"""Prediction engine for Vanillai Nanban.

Learns a location's own weather behaviour from its hourly history and forecasts forward.

* Temperature / humidity / wind: one multi-output Ridge model predicts the *change* over the next
  hour from recent lags plus time-of-day harmonics, applied recursively for N hours.
* Condition: a random-forest classifier maps a (temperature, humidity, wind, hour) state to a
  weather condition label, applied to each forecast state.
* Confidence: measured, not invented. A rolling-origin backtest on the most recent history
  (model fitted only on data *before* each test origin) gives the real error at each horizon;
  confidence falls as that error rises, and is scaled down when there is little history.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

MIN_POINTS = 48          # below this the model is not trusted and the caller must fall back
MAX_GAP_HOURS = 6        # larger holes split the series; only the latest contiguous part is used
FULL_HISTORY_HOURS = 168  # one week = "full" confidence in data volume
WET = {"Rain", "Drizzle", "Thunderstorm", "Snow"}


class InsufficientHistory(ValueError):
    pass


@dataclass
class Point:
    time: datetime
    temperature: float | None
    humidity: float | None
    wind_speed: float | None
    precipitation: float | None
    condition: str | None


@dataclass
class Series:
    start: datetime          # first hour (UTC)
    temp: np.ndarray
    hum: np.ndarray
    wind: np.ndarray
    precip: np.ndarray
    cond: list[str | None]

    def __len__(self) -> int:
        return len(self.temp)

    def hour_at(self, idx: int) -> int:
        return (self.start + timedelta(hours=idx)).hour


def _floor_hour(t: datetime) -> datetime:
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)


def build_series(points: list[Point]) -> Series:
    """Hourly grid of the latest contiguous stretch, small gaps linearly interpolated."""
    by_hour: dict[datetime, Point] = {}
    for p in points:
        if p.temperature is None or not np.isfinite(p.temperature):
            continue
        by_hour[_floor_hour(p.time)] = p          # later duplicates win
    if not by_hour:
        raise InsufficientHistory("no usable readings")

    hours = sorted(by_hour)
    seg_start = len(hours) - 1
    for i in range(len(hours) - 1, 0, -1):         # walk back until a gap that is too large
        if (hours[i] - hours[i - 1]).total_seconds() / 3600 > MAX_GAP_HOURS:
            break
        seg_start = i - 1
    hours = hours[seg_start:]

    start, end = hours[0], hours[-1]
    n = int((end - start).total_seconds() // 3600) + 1
    if n < MIN_POINTS:
        raise InsufficientHistory(f"need at least {MIN_POINTS} contiguous hours, have {n}")

    def column(getter, default=None):
        idx = np.array([int((h - start).total_seconds() // 3600) for h in hours])
        vals = np.array([np.nan if getter(by_hour[h]) is None else float(getter(by_hour[h])) for h in hours])
        ok = np.isfinite(vals)
        if not ok.any():
            return np.full(n, default if default is not None else 0.0)
        return np.interp(np.arange(n), idx[ok], vals[ok])

    cond: list[str | None] = [None] * n
    for h in hours:
        cond[int((h - start).total_seconds() // 3600)] = by_hour[h].condition
    last = None                                    # carry labels across interpolated hours
    for i in range(n):
        if cond[i] is None:
            cond[i] = last
        else:
            last = cond[i]

    return Series(start, column(lambda p: p.temperature),
                  np.clip(column(lambda p: p.humidity, 60.0), 0, 100),
                  np.clip(column(lambda p: p.wind_speed, 0.0), 0, None),
                  np.clip(column(lambda p: p.precipitation, 0.0), 0, None), cond)


# --------------------------------------------------------------------------- features

def _lags(n: int) -> tuple[int, ...]:
    return (0, 1, 2, 3, 6, 12, 24) if n >= 96 else (0, 1, 2, 3, 6, 12)


def _features(T, H, W, P, idx: int, next_hour: int, lags: tuple[int, ...]) -> list[float]:
    ang = 2 * np.pi * next_hour / 24
    return ([T[idx - l] for l in lags] + [H[idx - l] for l in (0, 1, 3)] + [W[idx - l] for l in (0, 1)]
            + [P[idx - 2:idx + 1].sum(), np.sin(ang), np.cos(ang)])


def _state_features(t: float, h: float, w: float, hour: int) -> list[float]:
    ang = 2 * np.pi * hour / 24
    return [t, h, w, np.sin(ang), np.cos(ang)]


def _fit_dynamics(s: Series, upto: int, lags: tuple[int, ...]):
    """Fit using only observations with index < upto."""
    first = max(lags)
    X, Y = [], []
    for i in range(first, upto - 1):
        X.append(_features(s.temp, s.hum, s.wind, s.precip, i, s.hour_at(i + 1), lags))
        Y.append([s.temp[i + 1] - s.temp[i], s.hum[i + 1] - s.hum[i], s.wind[i + 1] - s.wind[i]])
    if len(X) < 12:
        raise InsufficientHistory("too few training rows after lagging")
    model = make_pipeline(StandardScaler(), Ridge(alpha=5.0))
    model.fit(np.array(X), np.array(Y))
    return model, len(X)


def _fit_condition(s: Series, upto: int):
    X, y = [], []
    for i in range(upto):
        if s.cond[i] is not None:
            X.append(_state_features(s.temp[i], s.hum[i], s.wind[i], s.hour_at(i)))
            y.append(s.cond[i])
    if not X:
        return None
    clf = RandomForestClassifier(n_estimators=120, max_depth=7, min_samples_leaf=2,
                                 random_state=0, n_jobs=1)
    clf.fit(np.array(X), np.array(y))
    return clf


def _rollout(model, lags, s: Series, origin: int, steps: int):
    """Recursive forecast of (temp, hum, wind) for hours origin+1 .. origin+steps."""
    T = np.concatenate([s.temp[:origin + 1], np.zeros(steps)])
    H = np.concatenate([s.hum[:origin + 1], np.zeros(steps)])
    W = np.concatenate([s.wind[:origin + 1], np.zeros(steps)])
    P = np.concatenate([s.precip[:origin + 1], np.zeros(steps)])
    for k in range(steps):
        i = origin + k
        d = model.predict(np.array([_features(T, H, W, P, i, s.hour_at(i + 1), lags)]))[0]
        T[i + 1] = T[i] + d[0]
        H[i + 1] = float(np.clip(H[i] + d[1], 0, 100))
        W[i + 1] = max(0.0, W[i] + d[2])
        P[i + 1] = 0.0    # future precipitation is not forecast numerically; condition handles it
    return T[origin + 1:], H[origin + 1:], W[origin + 1:]


# --------------------------------------------------------------------------- backtest

def _backtest(s: Series, lags: tuple[int, ...], max_h: int) -> dict[int, float]:
    """Per-horizon mean absolute temperature error, out of sample. Empty if history is too short."""
    n = len(s)
    window = min(72, n // 3)
    test_start = n - window
    if test_start <= max(lags) + 24:
        return {}
    try:
        model, _ = _fit_dynamics(s, test_start, lags)
    except InsufficientHistory:
        return {}
    errs: dict[int, list[float]] = {}
    horizon = min(max_h, 48)
    for origin in range(test_start, n - 6, 6):
        steps = min(horizon, n - 1 - origin)
        pred_t, _, _ = _rollout(model, lags, s, origin, steps)
        for k in range(steps):
            errs.setdefault(k + 1, []).append(abs(pred_t[k] - s.temp[origin + 1 + k]))
    return {h: float(np.mean(v)) for h, v in errs.items() if len(v) >= 2}


def _mae_at(maes: dict[int, float], h: int) -> float | None:
    if not maes:
        return None
    if h in maes:
        return maes[h]
    top = max(maes)
    if h > top:                                   # error grows roughly with sqrt(horizon)
        return maes[top] * float(np.sqrt(h / top))
    lower = [k for k in maes if k < h]
    return maes[max(lower)] if lower else maes[min(maes)]


# --------------------------------------------------------------------------- public API

def predict(points: list[Point], horizons: list[int]) -> dict:
    s = build_series(points)
    n = len(s)
    lags = _lags(n)
    max_h = max(horizons)

    maes = _backtest(s, lags, max_h)
    model, n_train = _fit_dynamics(s, n, lags)
    clf = _fit_condition(s, n)
    pred_t, pred_h, pred_w = _rollout(model, lags, s, n - 1, max_h)

    anchor = s.start + timedelta(hours=n - 1)
    volume = min(1.0, n / FULL_HISTORY_HOURS) ** 0.5
    out = []
    for h in sorted(set(horizons)):
        k = h - 1
        hour = (anchor + timedelta(hours=h)).hour
        cond, proba = "Cloudy", 0.4
        if clf is not None:
            x = np.array([_state_features(pred_t[k], pred_h[k], pred_w[k], hour)])
            p = clf.predict_proba(x)[0]
            j = int(np.argmax(p))
            cond, proba = str(clf.classes_[j]), float(p[j])
        mae = _mae_at(maes, h)
        skill = 0.35 if mae is None else float(np.clip(1.0 - mae / 5.0, 0.05, 0.95))
        conf = float(np.clip((0.7 * skill + 0.3 * proba) * volume, 0.05, 0.95))
        out.append({
            "hours_ahead": h,
            "predicted_for": (anchor + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "predicted_temp": round(float(pred_t[k]), 1),
            "predicted_condition": cond,
            "confidence_score": round(conf, 2),
        })

    valid = [v for h, v in maes.items() if h <= 24]
    return {
        "model": {
            "name": "ridge-dynamics+random-forest-condition",
            "mae_temp": round(float(np.mean(valid)), 2) if valid else None,
            "training_samples": int(n_train),
        },
        "predictions": out,
    }
