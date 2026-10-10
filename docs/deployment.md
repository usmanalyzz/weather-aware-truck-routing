# Deployment

Two supported setups:
* **A. Vercel for both** (no credit card needed): Django runs as a Vercel Python function.
* **B. Render (Django) + Vercel (React)**: Render's free plan may ask for card verification.

## A. Django API on Vercel (no card)

1. Vercel → **Add New → Project** → import `usmanalyzz/weather-aware-truck-routing` again (a second project).
2. **Project Name:** `weather-truck-routing-api`. **Root Directory:** `backend`. **Application Preset:** *Other*.
   `backend/vercel.json` routes every path to `api/index.py` (Django) and allows 60 s per request.
3. **Environment Variables:**

   | Key | Value |
   |---|---|
   | `DJANGO_SETTINGS_MODULE` | `config.settings.prod` |
   | `DJANGO_SECRET_KEY` | a long random string (e.g. `python3 -c "import secrets;print(secrets.token_urlsafe(50))"`) |
   | `ALLOWED_HOSTS` | `.vercel.app` |
   | `HERE_API_KEY` | your HERE key |
   | `CORS_ALLOWED_ORIGINS` | your frontend URL, e.g. `https://weather-aware-truck-routing.vercel.app` |
4. **Deploy**, then open `https://<api-project>.vercel.app/api/health` → `{"status":"ok"}`.
5. In the **frontend** project, set `VITE_API_BASE_URL=https://<api-project>.vercel.app/api` and **Redeploy**.

> Serverless trade-off: the weather cache and rate budget live in memory per warm function instance. Vercel reuses
> warm instances for normal traffic, so they work well for a demo. Cold instances start empty, and Open-Meteo "busy"
> handling remains the safety net. Unlike Render's free plan, nothing sleeps for 30–60 s.

## B. Render (Django API) + Vercel (React)

Do the backend first, because the frontend needs its URL.

## 1. Backend on Render

1. Sign in at <https://render.com> with GitHub.
2. **New → Blueprint**, pick `usmanalyzz/weather-aware-truck-routing`. Render reads `render.yaml` and creates
   the service `weather-truck-routing-api` (Python 3.12, `rootDir: backend`, gunicorn, health check `/api/health`).
3. When prompted for the variables marked `sync: false`:
   * `HERE_API_KEY`: your HERE key.
   * `CORS_ALLOWED_ORIGINS`: leave as `https://placeholder.vercel.app` for now. You'll update it in step 3.
   `DJANGO_SECRET_KEY` is generated automatically and `ALLOWED_HOSTS` is preset to `.onrender.com`.
4. **Apply**, then wait for the deploy to show **Live**.
5. Check: open `https://<service>.onrender.com/api/health` → `{"status":"ok"}`.

> One gunicorn worker with 8 threads is intentional: the in-memory cache is per process, so the heatmap request reuses
> the plan cached by the same process instead of calling HERE again. The work is I/O-bound, so threads give the concurrency.

## 2. Frontend on Vercel

1. Sign in at <https://vercel.com> with GitHub → **Add New → Project** → import the repo.
2. **Root Directory:** `frontend`. The framework (Vite), build command and output come from `vercel.json`.
3. **Environment Variables:** `VITE_API_BASE_URL` = `https://<service>.onrender.com/api` (no trailing slash).
4. **Deploy**, then copy the production URL, e.g. `https://weather-aware-truck-routing.vercel.app`.

## 3. Connect them

1. Render → service → **Environment** → set `CORS_ALLOWED_ORIGINS` to the exact Vercel URL (https, no trailing slash).
   To allow several origins, separate them with commas.
2. Save. Render redeploys automatically.

## 4. Verify the hosted app

* [ ] `https://<service>.onrender.com/api/health` returns `{"status":"ok"}`.
* [ ] Open the Vercel URL. Typing "Chicago" shows suggestions, so geocoding works through the API.
* [ ] Plan Chicago, IL → Denver, CO, departing tomorrow, 42,000 lb, 25 mi. Routes, the recommendation and checkpoints
      appear, followed by the corridor overlay.
* [ ] Drag the slider and press play. The overlay changes smoothly.
* [ ] Open the browser dev tools Network tab: no requests go to `hereapi.com`, so the key stays server-side.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Cannot reach the server" on first use | Render free tier was asleep; wait ~30–60 s and retry (the app pings `/api/health` on load). |
| Browser console shows a CORS error | `CORS_ALLOWED_ORIGINS` must match the Vercel URL exactly (scheme, no trailing slash). |
| `ROUTING_UNAVAILABLE` / `GEOCODING_UNAVAILABLE` | `HERE_API_KEY` missing or wrong in Render → Environment; check the service logs. |
| `400 Bad Request` from Render for every request | `ALLOWED_HOSTS` must include `.onrender.com` (or your custom domain). |
| Heatmap shows "unavailable" but routes work | Open-Meteo throttled; the plan is unaffected. Try again later. |

Before recording the Loom, open the app once to wake the backend.
