# Business rules & documented assumptions

The assignment leaves a few details open. Each decision below is implemented in one place and covered by tests.

## Risk thresholds — `backend/risk/rules.py`

| Level     | Wind (mph) | Rain (in/hr)  | Snow (in/hr) |
|-----------|-----------:|--------------:|-------------:|
| Low       | < 25       | < 0.10        | < 0.5        |
| Moderate  | 25 – <35   | 0.10 – <0.25  | 0.5 – <1.0   |
| High      | 35 – <45   | 0.25 – <0.50  | 1.0 – <2.0   |
| Severe    | 45 – <55   | 0.50 – 1.00   | 2.0 – 3.0    |
| No Travel | ≥ 55       | > 1.00        | > 3.0        |

* Shared boundary values (e.g. rain 0.25) go to the **higher** class. Severe includes 1.00 in of rain and 3.0 in of
  snow, and No Travel starts above them, exactly as the table is written.
* Load rules are applied on top: wind ≥ 55 → No Travel; 45–<55 mph and load > 30,000 lb → No Travel;
  35–<45 mph and load > 40,000 lb → at least Severe. "Above" means strictly greater than the weight.
* The checkpoint level is the highest level produced by any rule. The API reports every contributing factor.

## Weather inputs — `backend/weather/matching.py`

* **Wind** uses sustained 10 m wind speed. The rules don't mention gusts, so gusts are only displayed.
* **Rain** is liquid precipitation (`rain + showers`). **Snow** is snowfall depth in inches per hour.
* **Time alignment:** Open-Meteo's precipitation values are sums over the preceding hour. A checkpoint uses the
  record whose hour window contains its ETA, i.e. the ETA rounded **up** to the hour. Wind is instantaneous, so it is
  linearly interpolated between the two surrounding hours.
* If the forecast for an ETA is missing or beyond the provider's horizon, the checkpoint is **Unknown**. Current
  weather is never used as a substitute.

## Checkpoints & ETAs — `backend/routing/`

* Sampling interval is user-selectable: 10, 25 or 50 road miles (default 25). Origin and destination are always
  checkpoints, so the last gap can be shorter than the interval.
* Distances are measured along the decoded route geometry (haversine between consecutive vertices).
* ETAs use the routing provider's per-span durations, spread over each span by distance. A route is never
  assumed to have one constant speed.

## Risk miles & average risk — `backend/risk/aggregate.py`

* Each checkpoint owns the road between the midpoints with its neighbours. Owned lengths add up exactly to
  the route length.
* Average risk is distance-weighted on the scale Low 0, Moderate 1, High 2, Severe 3, No Travel 4.
* Unknown miles are reported separately and excluded from the average. They are not counted as Low.

## Recommendation — `backend/risk/recommend.py`

Routes are compared lexicographically using a strict tuple sort, with no weighted sum:

0. **No Travel gate:** a route with any No Travel miles is never recommended over a route without them. If every
   route has some, the fewest No Travel miles wins and the app states **"No route is confirmed safe."**
   *Why:* under the literal rules, 5 No Travel miles would beat 10 Severe miles. That would recommend a road the
   rules say the truck must not drive.
1. Fewest Severe miles, counted as Severe-or-worse.
2. Fewest High miles.
3. Lowest distance-weighted average risk. A route with no forecast data at all ranks last on this criterion.
4. Shortest travel time.

Miles are compared at 0.1 mi and average risk at 0.01, so floating-point noise can't decide a ranking. Full ties
keep the routing provider's order. Each runner-up gets a one-line rationale naming the first criterion that
separated it from the winner.

## Routing & data quality — `backend/providers/`, `backend/routing/dedupe.py`

* **Truck routing:** HERE Routing v8 with `transportMode=truck`. Gross weight sent to HERE = tractor-trailer tare
  (35,000 lb, `TRUCK_TARE_WEIGHT_LB`) + the entered load, converted to kg. The risk rules use the entered load directly.
* **Three genuine routes:** we request 5 alternatives and keep up to 3 that are actually different. Two routes count as
  the same road when ≥ 90 % of each lies within 0.5 mi of the other. If fewer than 3 distinct routes exist, the app shows
  what it has and says so; it never invents routes.
* **Distances** come from the decoded route geometry, so checkpoint miles and route distance always agree.
  The map gets a simplified copy of each line, but every calculation uses the full-resolution geometry.
* **Forecast requests:** points are snapped to a 0.05° grid (~3.5 mi, finer than the HRRR/GFS model grids), batched
  50 per request, and cached per cell + exact hour window + current hour. A forecast is never reused for a different time.
* **Forecast horizon:** Open-Meteo rejects hours past its ~16-day horizon, so requests are clamped. Checkpoints beyond
  the horizon are Unknown. Departures are limited to the next 13 days so the 48 h heatmap and the trip itself stay inside.
* **Failures:** a failed weather batch marks only its checkpoints Unknown and adds a notice. Provider timeouts and
  outages return a clear error (504/502) without internal details.

## Corridor heatmap — `backend/routing/corridor.py`, `backend/trips/services/heatmap.py`

* **Grid:** points on a regular grid in **miles** (15 mi spacing, widened automatically to stay ≤ `HEATMAP_MAX_POINTS`)
  within 40 mi of any route. Because every point covers the same area, heatmap colour reflects forecast values,
  not point density.
* **Values:** for each point and each hour 0–48 after departure: wind (mph), rain and snow (in/hr) and the risk level
  from the **same rules and load** as the checkpoints. The map blends visually between points. That blending is
  interpolation, not an observation at every location, and the legend says so.
* **Timeline:** the slider is hours after departure (hour 0 = departure rounded down to the hour), with the absolute
  time shown. Hours past the provider's horizon are `null` and drawn blank, never filled in.
* **Reuse:** the heatmap takes the same request as the plan and reuses the cached plan, so no extra routing call is made.
  Results are cached for 10 minutes per trip, and corridor forecasts per cell for 1 hour.
* **Quota caveat:** Open-Meteo's docs don't say whether a multi-location request counts as one call or one per location.
  Assuming the worst case, an uncached heatmap costs about 550 of the free tier's 10,000 daily calls. If the provider throttles,
  only the overlay fails; routes, risk and the recommendation are unaffected.
* **Rendering:** each grid point is drawn as a soft, blurred disc about 1.3× the grid spacing wide, so neighbouring
  points blend into a continuous field. Colour is the point's own value, banded by the risk rules (thresholds are
  served by the API). We chose this over MapLibre's kernel-density `heatmap` layer because density colour depends on
  how many points overlap, so the same 47 mph wind could show different colours at different zooms or near the
  corridor edge. The GeoJSON is uploaded once per trip. The slider and metric switch only swap paint expressions
  (`setPaintProperty`), so dragging the slider triggers no data upload and no React re-render outside the panel.
