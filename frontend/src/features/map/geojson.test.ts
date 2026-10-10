import { describe, expect, it } from 'vitest'
import { RISK_COLORS, routeColor } from '../../lib/risk'
import { plan } from '../../test/utils'
import { checkpointFeatures, checkpointTooltip, endpointFeatures, planBounds, routeFeatures, routeLabelFeatures, routeSummaryText } from './geojson'

describe('map GeoJSON builders', () => {
  it('marks the selected and recommended routes', () => {
    const fc = routeFeatures(plan, 'r3')
    expect(fc.features).toHaveLength(3)
    expect(fc.features.map((f) => f.properties?.selected)).toEqual([false, false, true])
    expect(fc.features.map((f) => f.properties?.recommended)).toEqual([false, true, false])
    expect(fc.features[0].properties?.color).toBe(routeColor(0))
  })

  it('puts every route\'s checkpoints on the map, marking the selected route as active', () => {
    const fc = checkpointFeatures(plan, 'r1', 2)
    const total = plan.routes.reduce((n, r) => n + r.checkpoints.length, 0)
    expect(fc.features).toHaveLength(total)

    const active = fc.features.filter((f) => f.properties?.active)
    expect(active).toHaveLength(plan.routes[0].checkpoints.length)
    expect(new Set(fc.features.map((f) => f.properties?.routeId))).toEqual(new Set(['r1', 'r2', 'r3']))

    const selected = fc.features.filter((f) => f.properties?.selected)
    expect(selected).toHaveLength(1)
    const cp = plan.routes[0].checkpoints[2]
    expect(selected[0].geometry.coordinates).toEqual([cp.lon, cp.lat])
    expect(selected[0].properties?.color).toBe(RISK_COLORS[cp.risk.level])
    expect(checkpointFeatures(null, null, null).features).toEqual([])
  })

  it('orders riskier checkpoints above calmer ones', () => {
    const fc = checkpointFeatures(plan, 'r1', null)
    const sortOf = (level: string) => fc.features.find((f) => f.properties?.level === level)?.properties?.sort
    expect(sortOf('NO_TRAVEL')).toBeGreaterThan(sortOf('LOW'))
  })

  it('gives each checkpoint a hover tooltip with mile, ETA, risk and weather', () => {
    const route = plan.routes[0]
    const worst = route.checkpoints.find((c) => c.risk.level === 'NO_TRAVEL')!
    const lines = checkpointTooltip(route, worst)
    expect(lines[0]).toBe(`Route A · Mile ${Math.round(worst.mile)} · No Travel`)
    expect(lines[1]).toMatch(/^ETA /)
    expect(lines[2]).toMatch(/^Wind \d+ mph · Rain [\d.]+ in\/h · Snow [\d.]+ in\/h$/)

    const unknown = plan.routes[1].checkpoints.find((c) => c.risk.level === 'UNKNOWN')!
    expect(checkpointTooltip(plan.routes[1], unknown)[2]).toBe('No forecast for this arrival time')
    const fromMap = checkpointFeatures(plan, 'r2', null).features.find((f) => f.properties?.routeId === 'r1')
    expect(String(fromMap?.properties?.tooltip).split('\n')[0]).toMatch(/^Route A · Mile/)
  })

  it('labels each route on the map with its summary', () => {
    const fc = routeLabelFeatures(plan, 'r2')
    expect(fc.features).toHaveLength(3)
    const [a, b] = fc.features
    expect(b.properties?.selected).toBe(true)
    expect(b.properties?.text).toContain('★ Recommended')
    expect(a.properties?.text).toContain(`No Travel ${plan.routes[0].summary.no_travel_miles.toFixed(1)} mi`)
    expect(routeSummaryText(plan.routes[1], false).split('\n')).toEqual([
      'Route B',
      `${plan.routes[1].distance_mi.toLocaleString('en-US', { maximumFractionDigits: 0 })} mi · 16 h 00 min`,
      'Severe+ 0.0 mi · High 0.0 mi',
    ])
    // Labels sit on their own route, staggered so overlapping routes don't collide.
    const [lon, lat] = a.geometry.coordinates
    const [[minLon, minLat], [maxLon, maxLat]] = planBounds({ ...plan, routes: [plan.routes[0]] })!
    expect(lon).toBeGreaterThanOrEqual(minLon)
    expect(lon).toBeLessThanOrEqual(maxLon)
    expect(lat).toBeGreaterThanOrEqual(minLat)
    expect(lat).toBeLessThanOrEqual(maxLat)
    expect(a.geometry.coordinates).not.toEqual(b.geometry.coordinates)
  })

  it('places origin and destination endpoints and frames all routes', () => {
    const ends = endpointFeatures(plan)
    expect(ends.features.map((f) => f.properties?.kind)).toEqual(['origin', 'destination'])
    const [[minLon, minLat], [maxLon, maxLat]] = planBounds(plan)!
    for (const route of plan.routes) {
      for (const [lon, lat] of route.geometry.coordinates) {
        expect(lon).toBeGreaterThanOrEqual(minLon)
        expect(lon).toBeLessThanOrEqual(maxLon)
        expect(lat).toBeGreaterThanOrEqual(minLat)
        expect(lat).toBeLessThanOrEqual(maxLat)
      }
    }
    expect(planBounds({ ...plan, routes: [] })).toBeNull()
  })
})
