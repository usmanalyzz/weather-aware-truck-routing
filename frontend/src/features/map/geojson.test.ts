import { describe, expect, it } from 'vitest'
import { RISK_COLORS, routeColor } from '../../lib/risk'
import { plan } from '../../test/utils'
import { checkpointFeatures, endpointFeatures, planBounds, routeFeatures } from './geojson'

describe('map GeoJSON builders', () => {
  it('marks the selected and recommended routes', () => {
    const fc = routeFeatures(plan, 'r3')
    expect(fc.features).toHaveLength(3)
    expect(fc.features.map((f) => f.properties?.selected)).toEqual([false, false, true])
    expect(fc.features.map((f) => f.properties?.recommended)).toEqual([false, true, false])
    expect(fc.features[0].properties?.color).toBe(routeColor(0))
  })

  it('builds risk-coloured checkpoints for one route', () => {
    const route = plan.routes[0]
    const fc = checkpointFeatures(route, 2)
    expect(fc.features).toHaveLength(route.checkpoints.length)
    const second = fc.features[2]
    expect(second.geometry.coordinates).toEqual([route.checkpoints[2].lon, route.checkpoints[2].lat])
    expect(second.properties?.selected).toBe(true)
    expect(second.properties?.color).toBe(RISK_COLORS[route.checkpoints[2].risk.level])
    expect(checkpointFeatures(undefined, null).features).toEqual([])
  })

  it('orders riskier checkpoints above calmer ones', () => {
    const fc = checkpointFeatures(plan.routes[0], null)
    const sortOf = (level: string) => fc.features.find((f) => f.properties?.level === level)?.properties?.sort
    expect(sortOf('NO_TRAVEL')).toBeGreaterThan(sortOf('LOW'))
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
