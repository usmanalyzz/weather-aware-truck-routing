// Mirrors the Django REST API contract (backend/trips/services/plan_trip.py, heatmap.py).

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'NO_TRAVEL' | 'UNKNOWN'

export interface Place {
  label: string
  lat: number
  lon: number
}

export type SampleInterval = 10 | 25 | 50

export interface TripRequest {
  origin: Place
  destination: Place
  departure_time: string // ISO 8601 with offset
  load_weight_lb: number
  sample_interval_mi: SampleInterval
}

export type CheckpointWeather =
  | {
      status: 'ok'
      time: string
      wind_mph: number
      gust_mph: number | null
      rain_in_hr: number
      snow_in_hr: number
    }
  | { status: 'unavailable' }

export interface Checkpoint {
  seq: number
  lat: number
  lon: number
  mile: number
  eta: string
  weather: CheckpointWeather
  risk: {
    level: RiskLevel
    factors: Partial<Record<'wind' | 'rain' | 'snow' | 'load', RiskLevel>>
  }
}

export interface RouteSummary {
  severe_or_worse_miles: number
  no_travel_miles: number
  severe_miles: number
  high_miles: number
  moderate_miles: number
  low_miles: number
  unknown_miles: number
  avg_risk: number | null
  max_level: RiskLevel
  unsafe: boolean
}

export interface Route {
  id: string
  label: string
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  distance_mi: number
  duration_s: number
  departure_time: string
  arrival_time: string
  summary: RouteSummary
  checkpoints: Checkpoint[]
  notices: string[]
}

export interface TripPlan {
  trip_id: string
  generated_at: string
  request: TripRequest
  forecast_window: { start: string; end: string; hours: number }
  recommendation: {
    route_id: string | null
    ranking: string[]
    all_routes_unsafe: boolean
    rationale: string[]
  }
  routes: Route[]
  notices: string[]
}

export type HeatmapMetric = 'risk' | 'wind_mph' | 'rain_in_hr' | 'snow_in_hr'

export interface Heatmap {
  trip_id: string
  start: string
  hours: number
  load_weight_lb: number
  grid: { spacing_mi: number; radius_mi: number; count: number }
  points: [number, number][]
  values: Record<HeatmapMetric, (number | null)[][]>
  available_hours: boolean[]
  scales: Record<Exclude<HeatmapMetric, 'risk'>, { values: number[]; no_travel_inclusive: boolean }>
  notices: string[]
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, unknown> }
}
