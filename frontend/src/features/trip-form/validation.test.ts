import { describe, expect, it } from 'vitest'
import { type TripFormValues, toTripRequest, validateTrip } from './validation'

const NOW = new Date('2026-10-10T12:00:00Z')
const chicago = { label: 'Chicago, IL', lat: 41.88, lon: -87.63 }
const denver = { label: 'Denver, CO', lat: 39.74, lon: -104.99 }

function values(overrides: Partial<TripFormValues> = {}): TripFormValues {
  return { origin: chicago, destination: denver, departure: '2026-10-11T06:00', loadWeight: '42000', interval: 25, ...overrides }
}

describe('validateTrip', () => {
  it('accepts a complete trip', () => {
    expect(validateTrip(values(), NOW)).toEqual({})
  })

  it('requires origin and destination picked from suggestions', () => {
    const errors = validateTrip(values({ origin: null, destination: null }), NOW)
    expect(errors.origin).toMatch(/origin/i)
    expect(errors.destination).toMatch(/destination/i)
  })

  it('rejects identical origin and destination', () => {
    expect(validateTrip(values({ destination: { ...chicago } }), NOW).destination).toMatch(/differ/)
  })

  it.each([
    ['', /Enter a departure/],
    ['2026-10-01T00:00', /now or later/],
    ['2026-10-30T00:00', /within 13 days/],
  ])('validates departure %s', (departure, message) => {
    expect(validateTrip(values({ departure }), NOW).departure).toMatch(message)
  })

  it.each(['', 'abc', '-1', '80001', '1000.5'])('rejects load weight %s', (loadWeight) => {
    expect(validateTrip(values({ loadWeight }), NOW).loadWeight).toBeDefined()
  })

  it.each(['0', '30000', '80000'])('accepts load weight %s', (loadWeight) => {
    expect(validateTrip(values({ loadWeight }), NOW).loadWeight).toBeUndefined()
  })
})

describe('toTripRequest', () => {
  it('builds the API payload with an ISO departure', () => {
    const req = toTripRequest(values({ interval: 10 }))
    expect(req).toMatchObject({ origin: chicago, destination: denver, load_weight_lb: 42000, sample_interval_mi: 10 })
    expect(new Date(req.departure_time).getTime()).toBe(new Date('2026-10-11T06:00').getTime())
    expect(req.departure_time).toMatch(/Z$/)
  })

  it('refuses incomplete values', () => {
    expect(() => toTripRequest(values({ origin: null }))).toThrow()
  })
})
