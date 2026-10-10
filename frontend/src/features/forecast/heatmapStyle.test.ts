import { describe, expect, it } from 'vitest'
import type { Heatmap } from '../../api/types'
import heatmapJson from '../../test/fixtures/heatmap.json'
import {
  colorExpression,
  horizonHour,
  hourForTime,
  legendLabels,
  opacityExpression,
  propertyKey,
  radiusExpression,
  thresholds,
  timeForHour,
  toFeatureCollection,
} from './heatmapStyle'

const heatmap = heatmapJson as unknown as Heatmap

describe('heatmap data', () => {
  it('flattens hourly values into per-hour properties once', () => {
    const fc = toFeatureCollection(heatmap)
    expect(fc.features).toHaveLength(heatmap.grid.count)
    const props = fc.features[0].properties!
    expect(props[propertyKey('risk', 0)]).toBe(heatmap.values.risk[0][0])
    expect(props[propertyKey('wind_mph', 12)]).toBe(heatmap.values.wind_mph[0][12])
    expect(fc.features[0].geometry.coordinates).toEqual(heatmap.points[0])
  })

  it('omits missing hours so paint expressions see them as missing', () => {
    const props = toFeatureCollection(heatmap).features[0].properties!
    expect(heatmap.values.risk[0][40]).toBeNull()
    expect(props).not.toHaveProperty('r40')
    expect(horizonHour(heatmap)).toBe(31)
    expect(horizonHour({ ...heatmap, available_hours: heatmap.available_hours.map(() => true) })).toBeNull()
  })
})

describe('heatmap styling', () => {
  it('uses the backend rule thresholds, with strict No Travel bounds for rain and snow', () => {
    expect(thresholds('risk', heatmap)).toEqual([1, 2, 3, 4])
    expect(thresholds('wind_mph', heatmap)).toEqual([25, 35, 45, 55])
    const rain = thresholds('rain_in_hr', heatmap)
    expect(rain.slice(0, 3)).toEqual([0.1, 0.25, 0.5])
    expect(rain[3]).toBeGreaterThan(1)
    expect(rain[3]).toBeLessThan(1.000001)
  })

  it('reads the selected hour and metric in colour and opacity expressions', () => {
    expect(JSON.stringify(colorExpression('wind_mph', 7, heatmap))).toContain('"w7"')
    const opacity = opacityExpression('risk', 3, heatmap)
    expect(JSON.stringify(opacity)).toContain('"r3"')
    expect(opacity[0]).toBe('case')
  })

  it('sizes discs to the grid spacing and doubles them per zoom level', () => {
    const [, , , z0, r0, z20, r20] = radiusExpression(heatmap) as unknown as [string, unknown, unknown, number, number, number, number]
    expect(z0).toBe(0)
    expect(z20).toBe(20)
    expect(r20 / r0).toBe(2 ** 20)
    expect(r0).toBeGreaterThan(0)
  })

  it('labels legend bands from the thresholds', () => {
    expect(legendLabels('risk', heatmap)).toEqual(['Low', 'Moderate', 'High', 'Severe', 'No Travel'])
    expect(legendLabels('wind_mph', heatmap)).toEqual(['< 25', '25–<35', '35–<45', '45–<55', '≥ 55'])
    expect(legendLabels('rain_in_hr', heatmap)).toEqual(['< 0.10', '0.10–<0.25', '0.25–<0.50', '0.50–1.00', '> 1.00'])
    expect(legendLabels('snow_in_hr', heatmap).at(-1)).toBe('> 3.0')
  })

  it('converts between hours after departure and absolute times', () => {
    expect(hourForTime(heatmap, timeForHour(heatmap, 10))).toBe(10)
    expect(hourForTime(heatmap, '2000-01-01T00:00:00Z')).toBe(0)
    expect(hourForTime(heatmap, '2100-01-01T00:00:00Z')).toBe(48)
  })
})
