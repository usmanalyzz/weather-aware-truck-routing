import { describe, expect, it } from 'vitest'
import { plan } from '../test/utils'
import { formatDuration, formatMiles, nextHour, toLocalInputValue } from './format'
import { ownedSegments } from './segments'

describe('format helpers', () => {
  it('formats durations and distances', () => {
    expect(formatDuration(15 * 3600 + 5 * 60)).toBe('15 h 05 min')
    expect(formatDuration(45 * 60)).toBe('45 min')
    expect(formatMiles(1003.24)).toBe('1,003 mi')
    expect(formatMiles(12.345, 1)).toBe('12.3 mi')
  })

  it('builds datetime-local values and the next full hour', () => {
    const d = new Date(2026, 9, 11, 6, 5)
    expect(toLocalInputValue(d)).toBe('2026-10-11T06:05')
    expect(toLocalInputValue(nextHour(d))).toBe('2026-10-11T07:00')
  })
})

describe('ownedSegments', () => {
  it('splits the route at midpoints so segments cover it exactly', () => {
    const cps = plan.routes[0].checkpoints
    const segments = ownedSegments(cps)
    const covered = segments.reduce((sum, s) => sum + (s.to - s.from), 0)
    expect(covered).toBeCloseTo(cps.at(-1)!.mile, 6)
    expect(segments[0].from).toBe(0)
    expect(segments[1].from).toBeCloseTo((cps[0].mile + cps[1].mile) / 2)
  })
})
