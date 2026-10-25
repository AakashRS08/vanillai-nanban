# Vanillai Nanban — AI-Powered Weather Prediction and Chatbot (v2)

## What's new in v2

* **A living sky.** The whole page is a real-time WebGL sky (procedural clouds, sun/moon bloom, stars, rain, snow, fog,
  lightning). Pick a different hour, day or city and the sky *morphs* from sunny to stormy, with a fly-through-the-clouds
  transition on big changes. Falls back to a gradient if WebGL is unavailable; respects "reduce motion".
* **Frosted-glass dashboard**: scrambling headline, giant temperature (°C/°F), wind card, sunrise/sunset arc, air quality + UV,
  7-day curve, and a **time-travel slider** that scrubs the next 48 h (switch between Nanban AI and the provider's forecast).
* **Plan tab**: activity advisor (run, umbrella, laundry, driving, stargazing, picnic) scored from the forecast.
* **Alerts tab**: storm, heavy rain, heat/cold, wind, UV and air-quality warnings, with optional browser notifications
  (sent while the tab is open — this is not background push).
* **Radar tab**: Leaflet map with animated RainViewer rain radar; click anywhere to check that spot.
* **Chat**: voice input and optional read-aloud (browser speech APIs), plus the existing LLM/rule-based answers.
* Optional **ambient weather sound** (WebAudio, off by default), shareable place links, place-local times everywhere.
* Backend: daily forecast, UV, sunrise/sunset, `GET /api/air` (Open-Meteo air quality), place-local time zone.

Full-stack implementation of the capstone report: **React** frontend, **Java 17 / Spring Boot** backend
(JWT, Spring Data JPA), **SQL** database (MySQL; H2 for zero-setup dev) and a **Python / scikit-learn**
prediction microservice (the report's "microservice" option, §2.2 and §5.3).

```
React (Vite) ──REST──▶ Spring Boot ──▶ SQL (users, locations, weather_data, predictions, chat_history)
                          │  ├──▶ Open-Meteo (live weather, geocoding)
                          │  ├──▶ ml-service  (FastAPI + scikit-learn)
                          │  └──▶ LLM API     (chatbot, optional)
```

## Report → code map

| Report module (§5.2) | Where |
|---|---|
| 1 User Management (JWT, salted hashes) | `backend/.../web/AuthController`, `security/*` (BCrypt) |
| 2 Location (search, geolocation, favourites) | `web/LocationController`, `frontend/.../SearchOverlay` |
| 3 Weather Data (fetch, normalise, cache) | `weather/OpenMeteoClient`, `WeatherService` (10-min cache, hourly collector) |
| 4 AI Prediction (history-trained, confidence) | `ml-service/app/engine.py`, `prediction/PredictionService`, `BaselinePredictor` |
| 5 AI Chatbot (context-injected LLM prompt) | `chat/ChatService`, `LlmClient`, `RuleBasedAnswerer` |
| 6 Notification/Alert | `frontend/src/lib/alerts.js`, `AlertsView` (in-app alerts + browser notifications while the tab is open; no server-side push) |
| 7 Admin & Analytics | `admin/AdminController` (counts + measured prediction error), `AdminPanel` |
| 8 Frontend UI | `frontend/src/` |

Database tables and columns follow Appendix 8.3 exactly (UUID keys). Two small additions: `weather_data.precipitation`
(helps the model) and `predictions.created_at` (lets the admin panel compare predictions with what really happened).
`condition` is a reserved word in MySQL, so that column is quoted.

## Run it

**Quickest (no Docker, no MySQL):** three terminals.
```bash
# 1. AI service
cd ml-service && pip install -r requirements.txt && uvicorn app.main:app --port 8000
# 2. Backend (in-memory H2 database)
cd backend && mvn spring-boot:run
# 3. Frontend  → http://localhost:5173
cd frontend && npm install && npm run dev
```

**Everything in Docker (MySQL + all services) → http://localhost:3000**
```bash
cp .env.example .env     # set the passwords and NANBAN_JWT_SECRET (openssl rand -base64 48)
docker compose up --build
```

Optional: set `ANTHROPIC_API_KEY` to power the chatbot with an LLM. Without it the chatbot still works,
answering common questions (rain, temperature, wind, humidity) straight from the weather data, and labels those
answers as such. Set `NANBAN_ADMIN_EMAILS` to give an account the Admin panel.

## How the AI part works (and what it doesn't claim)

* When a place is saved, a week of hourly history is loaded into `weather_data`; an hourly job keeps adding to it.
* `ml-service` trains on that history per request: a Ridge model learns how temperature, humidity and wind
  evolve hour to hour (rolled forward up to 48 h), and a random forest maps those to a weather condition.
* **Confidence is measured**, not made up: a rolling backtest on the most recent days gives the real out-of-sample
  error at each horizon, and confidence falls as that error grows or when there is little history.
* Every AI value is shown next to the weather provider's own value for the same hour — it **supplements** the
  provider, as the report says (§3.4), and the UI never claims it is more accurate.
* If the model service is down or there are fewer than 48 hours of history, the backend falls back to a simple
  statistical estimate (low confidence) and says so in the response.

## Tests

| Part | Command | Status when this was built |
|---|---|---|
| ml-service | `cd ml-service && pip install -r requirements-dev.txt && pytest` | **14 passed** |
| frontend | `cd frontend && npm test && npm run build` | **43 passed, build OK**; every screen was also rendered in headless Chromium (desktop + mobile) against a mock API |
| backend | `cd backend && mvn test` | **Written but not run** — see below |

> **Backend verification gap.** The environment this was generated in blocks Maven Central, so the Spring Boot
> backend could not be compiled or its tests run. It was checked by a syntax-only compile (no syntax errors) and a
> line-by-line review, but expect that the first `mvn test` on your machine may surface a small compile or wiring
> issue. `ApiFlowTest` covers auth, ownership isolation, forecast (ML and fallback), chat, admin and error paths with the
> weather provider and ML service mocked.
> Live calls to Open-Meteo and the LLM were also not exercised for the same network reason.

## Security notes

* Passwords: BCrypt. Login errors never reveal whether an email exists. Every saved-location endpoint checks ownership.
* JWT secret, DB password and LLM key come from environment variables; the app refuses a JWT secret under 32 chars.
  **Change the default dev secret in `application.yml` before deploying.**
* The JWT is kept in `localStorage` (simple SPA approach); move to an httpOnly cookie if you need stronger XSS protection.
* The chatbot prompt tells the model to treat user text as a question, not instructions, and to answer only from supplied data.
* `ml-service` has no authentication and is not published by `docker-compose`; keep it on the private network.
* Weather is requested with the place's own time zone, so all times shown are *the place's* local time, not the viewer's.
* Not verified live: Open-Meteo/LLM calls, map tiles and RainViewer radar (the build environment had no access to them), and the sky was only rendered with a software GPU — real devices adapt resolution automatically but were not measured.
