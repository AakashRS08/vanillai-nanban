"""FastAPI wrapper around the prediction engine. Only the Spring Boot backend should call this."""
from __future__ import annotations

from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import engine

app = FastAPI(title="Vanillai Nanban prediction service", version="1.0.0")


class HistoryPoint(BaseModel):
    time: datetime
    temperature: float | None = None
    humidity: float | None = None
    wind_speed: float | None = None
    precipitation: float | None = None
    condition: str | None = Field(default=None, max_length=50)


class PredictRequest(BaseModel):
    history: list[HistoryPoint] = Field(max_length=2000)
    horizons: list[int] = Field(default=[3, 6, 12, 24], min_length=1, max_length=16)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/predict")
def predict(req: PredictRequest) -> dict:
    if any(h < 1 or h > 72 for h in req.horizons):
        raise HTTPException(status_code=422, detail="horizons must be between 1 and 72 hours")
    points = [engine.Point(p.time, p.temperature, p.humidity, p.wind_speed, p.precipitation, p.condition)
              for p in req.history]
    try:
        return engine.predict(points, req.horizons)
    except engine.InsufficientHistory as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
