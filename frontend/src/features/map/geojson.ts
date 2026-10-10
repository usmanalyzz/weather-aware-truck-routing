import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { Route, TripPlan } from '../../api/types'
import { RISK_COLORS, routeColor } from '../../lib/risk'

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

/** Checkpoints of the selected route only: showing every route's markers at once is unreadable. */
export function checkpointFeatures(route: Route | undefined, selectedSeq: number | null): FeatureCollection<Point> {
  if (!route) return EMPTY as FeatureCollection<Point>
  return {
    type: 'FeatureCollection',
    features: route.checkpoints.map(
      (cp): Feature<Point> => ({
        type: 'Feature',
        id: cp.seq,
        geometry: { type: 'Point', coordinates: [cp.lon, cp.lat] },
        properties: {
          seq: cp.seq,
          level: cp.risk.level,
          color: RISK_COLORS[cp.risk.level],
          selected: cp.seq === selectedSeq,
          // Draw riskier checkpoints on top of calmer ones.
          sort: ['UNKNOWN', 'LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL'].indexOf(cp.risk.level),
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
