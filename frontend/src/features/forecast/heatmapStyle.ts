import type { ExpressionSpecification } from 'maplibre-gl'
import type { Feature, FeatureCollection, Point } from 'geojson'
import type { Heatmap, HeatmapMetric } from '../../api/types'
import { RISK_COLORS, RISK_LEVELS } from '../../lib/risk'

/*
 * Corridor weather overlay.
 *
 * Each forecast grid point is drawn as a soft (blurred) disc about as wide as the grid spacing, so
 * neighbours overlap into a continuous field. Colour comes from the point's own value banded by the
 * risk rules. Unlike a kernel-density heatmap, colour never depends on how many points overlap, so it
 * always matches the legend. The slider only swaps which per-hour property the paint expressions
 * read; the GeoJSON is uploaded once per trip.
 */

export const METRICS: { id: HeatmapMetric; label: string; unit: string }[] = [
  { id: 'risk', label: 'Risk', unit: '' },
  { id: 'wind_mph', label: 'Wind', unit: 'mph' },
  { id: 'rain_in_hr', label: 'Rain', unit: 'in/h' },
  { id: 'snow_in_hr', label: 'Snow', unit: 'in/h' },
]

const PREFIX: Record<HeatmapMetric, string> = { risk: 'r', wind_mph: 'w', rain_in_hr: 'p', snow_in_hr: 's' }
const BAND_COLORS = RISK_LEVELS.map((level) => RISK_COLORS[level])
const MISSING = -1
// MapLibre web-mercator: metres per pixel at zoom 0 on the equator with 512 px tiles.
const METERS_PER_PIXEL_Z0 = 78271.517

export function propertyKey(metric: HeatmapMetric, hour: number): string {
  return `${PREFIX[metric]}${hour}`
}

/** Flatten per-hour arrays into feature properties once, e.g. r0..r48, w0..w48. Missing values are omitted. */
export function toFeatureCollection(heatmap: Heatmap): FeatureCollection<Point> {
  const metrics = Object.keys(PREFIX) as HeatmapMetric[]
  return {
    type: 'FeatureCollection',
    features: heatmap.points.map((coordinates, i): Feature<Point> => {
      const properties: Record<string, number> = { i }
      for (const metric of metrics) {
        heatmap.values[metric][i].forEach((value, hour) => {
          if (value !== null) properties[propertyKey(metric, hour)] = value
        })
      }
      return { type: 'Feature', geometry: { type: 'Point', coordinates }, properties }
    }),
  }
}

/** Lower bounds of Moderate, High, Severe, No Travel for a metric (risk levels are 1..4). */
export function thresholds(metric: HeatmapMetric, heatmap: Heatmap): number[] {
  if (metric === 'risk') return [1, 2, 3, 4]
  const { values, no_travel_inclusive } = heatmap.scales[metric]
  // "No Travel" starts strictly above the last bound for rain/snow; step expressions are inclusive.
  return values.map((v, i) => (i === values.length - 1 && !no_travel_inclusive ? v + 1e-9 : v))
}

function valueExpr(metric: HeatmapMetric, hour: number): ExpressionSpecification {
  return ['coalesce', ['get', propertyKey(metric, hour)], MISSING]
}

export function colorExpression(metric: HeatmapMetric, hour: number, heatmap: Heatmap): ExpressionSpecification {
  const [t1, t2, t3, t4] = thresholds(metric, heatmap)
  return ['step', valueExpr(metric, hour), BAND_COLORS[0], t1, BAND_COLORS[1], t2, BAND_COLORS[2], t3, BAND_COLORS[3], t4, BAND_COLORS[4]]
}

/** Missing data is fully transparent; the Low band is faint so calm weather doesn't flood the map. */
export function opacityExpression(metric: HeatmapMetric, hour: number, heatmap: Heatmap): ExpressionSpecification {
  const [t1] = thresholds(metric, heatmap)
  const v = valueExpr(metric, hour)
  return ['case', ['<', v, 0], 0, ['<', v, t1], 0.1, 0.5]
}

/** Disc radius tracking the grid spacing on the ground at every zoom. */
export function radiusExpression(heatmap: Heatmap): ExpressionSpecification {
  const meanLat = heatmap.points.reduce((sum, [, lat]) => sum + lat, 0) / Math.max(heatmap.points.length, 1)
  const spacingM = heatmap.grid.spacing_mi * 1609.344
  const r0 = (1.3 * spacingM) / (METERS_PER_PIXEL_Z0 * Math.cos((meanLat * Math.PI) / 180))
  return ['interpolate', ['exponential', 2], ['zoom'], 0, r0, 20, r0 * 2 ** 20]
}

/** Legend labels per band, derived from the same thresholds the backend uses. */
export function legendLabels(metric: HeatmapMetric, heatmap: Heatmap): string[] {
  if (metric === 'risk') return ['Low', 'Moderate', 'High', 'Severe', 'No Travel']
  const { values: [a, b, c, d], no_travel_inclusive } = heatmap.scales[metric]
  const f = (n: number) => (metric === 'wind_mph' ? String(n) : n.toFixed(metric === 'rain_in_hr' ? 2 : 1))
  const severe = no_travel_inclusive ? `${f(c)}–<${f(d)}` : `${f(c)}–${f(d)}`
  return [`< ${f(a)}`, `${f(a)}–<${f(b)}`, `${f(b)}–<${f(c)}`, severe, `${no_travel_inclusive ? '≥' : '>'} ${f(d)}`]
}

export function hourForTime(heatmap: Heatmap, iso: string): number {
  const h = Math.round((new Date(iso).getTime() - new Date(heatmap.start).getTime()) / 3_600_000)
  return Math.min(Math.max(h, 0), heatmap.hours - 1)
}

export function timeForHour(heatmap: Heatmap, hour: number): string {
  return new Date(new Date(heatmap.start).getTime() + hour * 3_600_000).toISOString()
}

/** First hour without forecast data, or null when every hour has data. */
export function horizonHour(heatmap: Heatmap): number | null {
  const i = heatmap.available_hours.indexOf(false)
  return i === -1 ? null : i
}
