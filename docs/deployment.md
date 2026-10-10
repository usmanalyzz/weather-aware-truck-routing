# Deployment: Render (Django API) + Vercel (React)

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
