import type { Place, SampleInterval, TripRequest } from '../../api/types'

// Same limits as the API serializer (backend/trips/serializers.py).
export const MAX_LOAD_LB = 80_000
export const MAX_DAYS_AHEAD = 13
const PAST_GRACE_MS = 60 * 60 * 1000

export interface TripFormValues {
  origin: Place | null
  destination: Place | null
  departure: string // datetime-local value, viewer's time zone
  loadWeight: string
  interval: SampleInterval
}

export type TripFormErrors = Partial<Record<'origin' | 'destination' | 'departure' | 'loadWeight', string>>

export function validateTrip(values: TripFormValues, now = new Date()): TripFormErrors {
  const errors: TripFormErrors = {}

  if (!values.origin) errors.origin = 'Choose an origin from the suggestions.'
  if (!values.destination) errors.destination = 'Choose a destination from the suggestions.'
  if (
    values.origin &&
    values.destination &&
    Math.abs(values.origin.lat - values.destination.lat) < 0.01 &&
    Math.abs(values.origin.lon - values.destination.lon) < 0.01
  ) {
    errors.destination = 'Destination must differ from the origin.'
  }

  const departure = new Date(values.departure)
  if (!values.departure || Number.isNaN(departure.getTime())) {
    errors.departure = 'Enter a departure date and time.'
  } else if (departure.getTime() < now.getTime() - PAST_GRACE_MS) {
    errors.departure = 'Departure must be now or later — forecasts only cover the future.'
  } else if (departure.getTime() > now.getTime() + MAX_DAYS_AHEAD * 24 * 3600 * 1000) {
    errors.departure = `Departure must be within ${MAX_DAYS_AHEAD} days (forecast horizon).`
  }

  const load = Number(values.loadWeight)
  if (values.loadWeight.trim() === '' || !Number.isFinite(load)) {
    errors.loadWeight = 'Enter the load weight in pounds.'
  } else if (!Number.isInteger(load) || load < 0 || load > MAX_LOAD_LB) {
    errors.loadWeight = `Use a whole number from 0 to ${MAX_LOAD_LB.toLocaleString()} lb.`
  }

  return errors
}

export function toTripRequest(values: TripFormValues): TripRequest {
  if (!values.origin || !values.destination) throw new Error('validateTrip must pass first')
  return {
    origin: values.origin,
    destination: values.destination,
    departure_time: new Date(values.departure).toISOString(),
    load_weight_lb: Number(values.loadWeight),
    sample_interval_mi: values.interval,
  }
}
