# Loom walkthrough (target: 8 minutes)

Time is split to match the rubric: about 4 minutes on logic (40 %), 2.5 on UI and map (35 %), and 1.5 on code and docs (15 %).

**Before recording:**
- Open the hosted app once to wake Render.
- Close other tabs.
- Zoom the browser to 110 %.
- Have the GitHub repo open in a second tab.

---

### 0:00 – 0:30 · Intro
- "Hi, I'm Usman. This is my Weather-Aware Truck Routing app, built with **Django REST Framework and React**."
- One sentence: "It compares up to three real truck routes using the forecast at the time the truck reaches each
  checkpoint, applies the weather and load rules, and recommends a route with the reasoning."

### 0:30 – 2:00 · Plan a trip (UI first)
- Type *Chicago*, then *Denver*. Point out that address suggestions come through the Django API, so the HERE key never
  reaches the browser.
- Departure tomorrow morning, **42,000 lb**, checkpoints every **25 mi**. Mention the hint about the 30k/40k load rules.
- Click **Plan routes**. Routes appear first, then the corridor overlay loads separately.
- Read the **recommendation**: name the winning route and read one rationale line aloud.
- Compare the **route cards**: distance, drive time, Severe+ and High miles, average risk, and the risk strip showing
  *where* along the route the risk is.

### 2:00 – 4:30 · The logic (most important)
- Click a risky checkpoint (map or table) and walk through the **details panel**:
  - ETA, and "forecast for the hour ending …": the weather is taken **at the ETA**, not now.
  - Wind/rain/snow values and **which rule fired**, e.g. "Wind + load rule: Severe (42,000 lb load)".
- Show `backend/risk/rules.py` briefly: thresholds exactly as specified; boundaries go to the higher class; the load
  rules; the level is the highest any rule gives.
- Explain **ETAs**: HERE returns travel time per road segment, spread along the geometry, so slow city miles stay slow.
- Explain **risk miles**: each checkpoint represents the road between the midpoints with its neighbours, so the stretches
  add up exactly to the route length. Unknown forecasts are reported separately and never counted as Low.
- Explain the **ranking** in `backend/risk/recommend.py`: a strict tuple sort, no weighted score.
  - Severe miles → High miles → average risk → travel time.
  - **My one addition:** the No Travel gate. "Read literally, 5 No Travel miles would beat 10 Severe miles, and the app
    would recommend a road the rules forbid. So a route with No Travel never beats one without, and if every route has
    some, the app says *no route is confirmed safe*."
- Optional: rerun with **20,000 lb** to show the same wind dropping from Severe/No Travel to High.

### 4:30 – 6:00 · Heatmap and map performance
- Drag the **slider** from +0 to +48 h, then press **play**. Point out the absolute timestamp.
- Switch **Risk → Wind → Rain**. The legend bands come from the backend's rule thresholds.
- Select a checkpoint: the slider jumps to its ETA, and the shaded bar shows when the route is on the road.
- Click empty map: raw forecast values for that grid point. Point out the note "interpolated between points ~19 mi
  apart, not observed".
- **Why it's smooth:** the grid is uploaded to MapLibre once; the slider only changes paint expressions, so there is no
  data upload and no React re-render of the sidebar.
- **Why discs instead of a density heatmap:** density colour depends on how many points overlap; here colour always
  matches the legend.

### 6:00 – 7:30 · Code quality and robustness
- Repo tour:
  - `backend/` holds `risk/`, `routing/` and `weather/` as pure Python, `providers/` for HERE and Open-Meteo, and
    `trips/` for the DRF views and services.
  - `frontend/src/features/` is split into trip-form, routes, map, forecast and checkpoints.
- Tests:
  - **174 backend tests** with 100 % branch coverage on the rule engine, plus **55 frontend tests**.
  - Frontend fixtures come from the real Django endpoints.
  - CI runs everything on each push.
- Failure handling: provider timeouts give 504 and outages give 502 with a clean message. A weather batch failure only
  marks those checkpoints Unknown. Fewer than 3 distinct routes are shown honestly with a notice.
- Efficiency: weather points are snapped to a ~3.5 mi grid and batched 50 per request; plans and forecasts are cached
  per exact time window.

### 7:30 – 8:00 · Wrap-up
- Limitations, honestly: forecast accuracy beyond a few days, sampling between checkpoints, no hours-of-service breaks.
- "Natural next steps would be HOS-aware ETAs and suggesting a better departure time when every route is unsafe."
- Thank them.

---

**Tips:**
- If HERE returns only 2 distinct routes for a pair, mention the notice: the app never invents routes.
- Keep the code views short; show the files rather than scrolling through them.
