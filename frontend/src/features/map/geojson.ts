import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { Checkpoint, Route, TripPlan } from '../../api/types'
import { formatDateTime, formatDuration, formatMiles } from '../../lib/format'
import { RISK_COLORS, RISK_LABELS, routeColor } from '../../lib/risk'

export const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function routeFeatures(plan: TripPlan, selectedRouteId: string | null): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: plan.routes.map(
      (route, index): Feature<LineString> => ({
        type: 'Feature',
        id: index,
        geometry: route.geometry,
        properties: {
          id: route.id,
          label: route.label,
          color: routeColor(index),
          selected: route.id === selectedRouteId,
          recommended: route.id === plan.recommendation.route_id,
        },
      }),
    ),
  }
}

const RISK_ORDER = ['UNKNOWN', 'LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL']

/** Text for the hover tooltip: where, when, how risky and why. */
export function checkpointTooltip(route: Route, cp: Checkpoint): string[] {
  const lines = [
    `${route.label} · Mile ${Math.round(cp.mile)} · ${RISK_LABELS[cp.risk.level]}`,
    `ETA ${formatDateTime(cp.eta)}`,
  ]
  lines.push(
    cp.weather.status === 'ok'
      ? `Wind ${Math.round(cp.weather.wind_mph)} mph · Rain ${cp.weather.rain_in_hr.toFixed(2)} in/h · Snow ${cp.weather.snow_in_hr.toFixed(1)} in/h`
      : 'No forecast for this arrival time',
  )
  return lines
}

/**
 * Checkpoints of every route. The selected route's markers are full size (`active`); the others are
 * drawn as small faded dots so all risk levels stay visible without cluttering the map.
 */
export function checkpointFeatures(
  plan: TripPlan | null,
  selectedRouteId: string | null,
  selectedSeq: number | null,
): FeatureCollection<Point> {
  if (!plan) return EMPTY as FeatureCollection<Point>
  return {
    type: 'FeatureCollection',
    features: plan.routes.flatMap((route) =>
      route.checkpoints.map(
        (cp): Feature<Point> => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [cp.lon, cp.lat] },
          properties: {
            routeId: route.id,
            seq: cp.seq,
            level: cp.risk.level,
            color: RISK_COLORS[cp.risk.level],
            active: route.id === selectedRouteId,
            selected: route.id === selectedRouteId && cp.seq === selectedSeq,
            // Riskier checkpoints draw on top of calmer ones.
            sort: RISK_ORDER.indexOf(cp.risk.level),
            tooltip: checkpointTooltip(route, cp).join('\n'),
          },
        }),
      ),
    ),
  }
}

function pointAlong(coords: [number, number][], fraction: number): [number, number] {
  const dist = (a: [number, number], b: [number, number]) => Math.hypot((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1])
  const cum = [0]
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + dist(coords[i - 1], coords[i]))
  const target = cum[cum.length - 1] * fraction
  const i = Math.max(1, cum.findIndex((c) => c >= target))
  const seg = cum[i] - cum[i - 1] || 1
  const f = (target - cum[i - 1]) / seg
  return [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f]
}

export function routeSummaryText(route: Route, recommended: boolean): string {
  const s = route.summary
  return [
    `${route.label}${recommended ? '  ★ Recommended' : ''}`,
    `${formatMiles(route.distance_mi)} · ${formatDuration(route.duration_s)}`,
    `Severe+ ${s.severe_or_worse_miles.toFixed(1)} mi · High ${s.high_miles.toFixed(1)} mi${
      s.no_travel_miles > 0 ? ` · No Travel ${s.no_travel_miles.toFixed(1)} mi` : ''
    }`,
  ].join('\n')
}

/** One summary label per route, staggered along each line so labels of overlapping routes don't collide. */
export function routeLabelFeatures(plan: TripPlan, selectedRouteId: string | null): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: plan.routes.map(
      (route, index): Feature<Point> => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: pointAlong(route.geometry.coordinates, 0.3 + 0.2 * index) },
        properties: {
          id: route.id,
          color: routeColor(index),
          selected: route.id === selectedRouteId,
          text: routeSummaryText(route, route.id === plan.recommendation.route_id),
        },
      }),
    ),
  }
}

export function endpointFeatures(plan: TripPlan): FeatureCollection<Point> {
  const { origin, destination } = plan.request
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [origin.lon, origin.lat] }, properties: { kind: 'origin', label: 'A' } },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [destination.lon, destination.lat] },
        properties: { kind: 'destination', label: 'B' },
      },
    ],
  }
}

export function planBounds(plan: TripPlan): [[number, number], [number, number]] | null {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  for (const route of plan.routes) {
    for (const [lon, lat] of route.geometry.coordinates) {
      minLon = Math.min(minLon, lon)
      maxLon = Math.max(maxLon, lon)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    }
  }
  return Number.isFinite(minLon) ? [[minLon, minLat], [maxLon, maxLat]] : null
}
