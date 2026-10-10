import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { Heatmap, HeatmapMetric } from '../../api/types'
import { formatDateTime } from '../../lib/format'
import { RISK_COLORS, RISK_LABELS, RISK_LEVELS } from '../../lib/risk'
import { INTERACTIVE_LAYERS, OVERLAY_BEFORE_LAYER } from '../map/layers'
import {
  METRICS,
  colorExpression,
  columnFilter,
  heightExpression,
  horizonHour,
  hourForTime,
  legendLabels,
  opacityExpression,
  radiusExpression,
  timeForHour,
  toCellCollection,
  toFeatureCollection,
} from './heatmapStyle'

export const HEATMAP_SOURCE = 'heatmap'
export const HEATMAP_LAYER = 'heatmap-points'
export const CELLS_SOURCE = 'heatmap-cells'
export const COLUMNS_LAYER = 'heatmap-columns'
const PLAY_STEP_MS = 700

interface ForecastPanelProps {
  map: MapLibreMap | null
  heatmap: Heatmap | undefined
  loading: boolean
  error: string | null
  /** ISO time to jump to, e.g. the selected checkpoint's ETA. */
  focusTime: string | null
  /** Hours after departure that the selected route is on the road. */
  tripHours: number | null
  /** Show weather as extruded 3D columns instead of a flat field. */
  view3d?: boolean
  onRetry?: () => void
}

function ensureLayer(map: MapLibreMap) {
  if (!map.getSource(HEATMAP_SOURCE)) {
    map.addSource(HEATMAP_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  }
  if (!map.getLayer(HEATMAP_LAYER)) {
    map.addLayer(
      { id: HEATMAP_LAYER, type: 'circle', source: HEATMAP_SOURCE, paint: { 'circle-blur': 1, 'circle-opacity': 0 } },
      map.getLayer(OVERLAY_BEFORE_LAYER) ? OVERLAY_BEFORE_LAYER : undefined,
    )
  }
  if (!map.getSource(CELLS_SOURCE)) {
    map.addSource(CELLS_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  }
  if (!map.getLayer(COLUMNS_LAYER)) {
    map.addLayer({
      id: COLUMNS_LAYER,
      type: 'fill-extrusion',
      source: CELLS_SOURCE,
      layout: { visibility: 'none' },
      paint: { 'fill-extrusion-opacity': 0.78, 'fill-extrusion-vertical-gradient': true },
    })
  }
}

function describePoint(heatmap: Heatmap, index: number, hour: number): string[] {
  const at = (metric: HeatmapMetric) => heatmap.values[metric][index]?.[hour] ?? null
  const risk = at('risk')
  if (risk === null) return ['No forecast for this hour.']
  return [
    `Risk: ${RISK_LABELS[RISK_LEVELS[risk]]}`,
    `Wind ${Math.round(at('wind_mph') ?? 0)} mph · Rain ${(at('rain_in_hr') ?? 0).toFixed(2)} in/h · Snow ${(at('snow_in_hr') ?? 0).toFixed(1)} in/h`,
  ]
}

export function ForecastPanel({
  map,
  heatmap,
  loading,
  error,
  focusTime,
  tripHours,
  view3d = false,
  onRetry,
}: ForecastPanelProps) {
  const [hour, setHour] = useState(0)
  const [metric, setMetric] = useState<HeatmapMetric>('risk')
  const [visible, setVisible] = useState(true)
  const [playing, setPlaying] = useState(false)
  const current = useRef({ hour, heatmap })
  current.current = { hour, heatmap }

  const horizon = heatmap ? horizonHour(heatmap) : null
  const maxHour = heatmap ? heatmap.hours - 1 : 48

  // Upload grid data once per heatmap; layers are created once and reused.
  useEffect(() => {
    if (!map) return
    ensureLayer(map)
    const empty = { type: 'FeatureCollection' as const, features: [] }
    ;(map.getSource(HEATMAP_SOURCE) as GeoJSONSource).setData(heatmap ? toFeatureCollection(heatmap) : empty)
    ;(map.getSource(CELLS_SOURCE) as GeoJSONSource).setData(heatmap ? toCellCollection(heatmap) : empty)
    if (heatmap) map.setPaintProperty(HEATMAP_LAYER, 'circle-radius', radiusExpression(heatmap))
  }, [map, heatmap])

  // Raw values on click (routes and checkpoints above take precedence).
  useEffect(() => {
    if (!map) return
    const onClick = (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const { heatmap: hm, hour: h } = current.current
      if (!hm || map.queryRenderedFeatures(e.point, { layers: INTERACTIVE_LAYERS.filter((l) => map.getLayer(l)) }).length) return
      const index = e.features?.[0]?.properties?.i
      if (typeof index !== 'number') return
      const content = document.createElement('div')
      content.className = 'text-xs'
      for (const [i, line] of [`Forecast grid point · ${formatDateTime(timeForHour(hm, h))}`, ...describePoint(hm, index, h)].entries()) {
        const row = document.createElement('div')
        if (i === 0) row.className = 'font-semibold'
        row.textContent = line
        content.append(row)
      }
      new maplibregl.Popup({ offset: 6, focusAfterOpen: false }).setLngLat(e.lngLat).setDOMContent(content).addTo(map)
    }
    map.on('click', HEATMAP_LAYER, onClick)
    map.on('click', COLUMNS_LAYER, onClick)
    return () => {
      map.off('click', HEATMAP_LAYER, onClick)
      map.off('click', COLUMNS_LAYER, onClick)
    }
  }, [map])

  // The slider and metric only swap paint expressions: no data upload, no layer rebuild.
  useEffect(() => {
    if (!map || !heatmap || !map.getLayer(HEATMAP_LAYER)) return
    const color = colorExpression(metric, hour, heatmap)
    map.setPaintProperty(HEATMAP_LAYER, 'circle-color', color)
    map.setPaintProperty(HEATMAP_LAYER, 'circle-opacity', opacityExpression(metric, hour, heatmap))
    map.setPaintProperty(COLUMNS_LAYER, 'fill-extrusion-color', color)
    map.setPaintProperty(COLUMNS_LAYER, 'fill-extrusion-height', heightExpression(metric, hour, heatmap))
    map.setFilter(COLUMNS_LAYER, columnFilter(metric, hour, heatmap))
    map.setLayoutProperty(HEATMAP_LAYER, 'visibility', visible && !view3d ? 'visible' : 'none')
    map.setLayoutProperty(COLUMNS_LAYER, 'visibility', visible && view3d ? 'visible' : 'none')
  }, [map, heatmap, metric, hour, visible, view3d])

  // Follow the selected checkpoint's ETA.
  useEffect(() => {
    if (heatmap && focusTime) setHour(hourForTime(heatmap, focusTime))
  }, [heatmap, focusTime])

  // New trip: start at departure.
  useEffect(() => {
    setHour(0)
    setPlaying(false)
  }, [heatmap?.trip_id])

  // Playback advances one hour per tick and stops at the last hour with data.
  const lastPlayableHour = horizon === null ? maxHour : Math.max(horizon - 1, 0)
  useEffect(() => {
    if (!playing) return
    if (hour >= lastPlayableHour) {
      setPlaying(false)
      return
    }
    const id = window.setTimeout(() => setHour(hour + 1), PLAY_STEP_MS)
    return () => window.clearTimeout(id)
  }, [playing, hour, lastPlayableHour])

  const labels = heatmap ? legendLabels(metric, heatmap) : []
  const unit = METRICS.find((m) => m.id === metric)?.unit
  const missingHour = horizon !== null && hour >= horizon

  return (
    <section
      aria-label="Weather forecast overlay"
      className="glass mx-3 mt-3 rounded-2xl p-3 lg:m-0"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-slate-600 uppercase">Corridor forecast</h2>
        <div className="flex rounded-xl bg-slate-900/5 p-0.5 shadow-inner" role="group" aria-label="Heatmap metric">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={metric === m.id}
              onClick={() => setMetric(m.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                metric === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="accent-blue-600" />
          Show overlay
        </label>
      </div>

      {loading && <p className="py-2 text-xs text-slate-600">Loading corridor forecast…</p>}
      {error && !loading && (
        <div className="flex items-center gap-3 py-1.5" role="alert">
          <p className="text-xs text-red-700">Forecast overlay unavailable: {error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-auto shrink-0 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {heatmap && !heatmap.complete && (
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900" role="status">
          <span>Part of the corridor forecast couldn't load (weather service busy); those areas are blank.</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-auto shrink-0 rounded-md border border-amber-300 bg-white px-2 py-0.5 font-semibold hover:bg-amber-100"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {heatmap && (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!playing && hour >= lastPlayableHour) setHour(0)
                setPlaying((p) => !p)
              }}
              aria-label={playing ? 'Pause forecast animation' : 'Play forecast animation'}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 text-sm text-white shadow-[0_3px_0_0_#312e81,0_10px_20px_-8px_rgb(79_70_229/0.8)] transition-all hover:brightness-110 active:translate-y-[2px] active:shadow-[0_1px_0_0_#312e81]"
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <div className="relative flex-1">
              {tripHours !== null && (
                <div
                  className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-200"
                  style={{ left: 0, width: `${(Math.min(tripHours, maxHour) / maxHour) * 100}%` }}
                  aria-hidden
                />
              )}
              <input
                type="range"
                min={0}
                max={maxHour}
                step={1}
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                aria-label="Hours after departure"
                aria-valuetext={`${hour} hours after departure, ${formatDateTime(timeForHour(heatmap, hour))}`}
                className="relative w-full accent-blue-600"
              />
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
            <span className="font-semibold text-slate-900 tabular-nums">
              +{hour} h · {formatDateTime(timeForHour(heatmap, hour))}
            </span>
            {tripHours !== null && <span className="text-slate-500">Shaded: selected route on the road</span>}
          </div>
          {missingHour && (
            <p className="mt-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
              No forecast beyond +{horizon} h (provider horizon) — the overlay is blank, not calm.
            </p>
          )}

          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-700" aria-label="Legend">
            {labels.map((label, i) => (
              <li key={label} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: RISK_COLORS[RISK_LEVELS[i]] }} aria-hidden />
                {label}
                {unit && i === labels.length - 1 ? ` ${unit}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-slate-500">
            Colours blend between forecast points ~{Math.round(heatmap.grid.spacing_mi)} mi apart (interpolated, not observed).
            Bands follow the route risk rules{metric === 'risk' ? ` for a ${heatmap.load_weight_lb.toLocaleString()} lb load` : ''}.
            Click the map for raw values.
          </p>
        </>
      )}
    </section>
  )
}

