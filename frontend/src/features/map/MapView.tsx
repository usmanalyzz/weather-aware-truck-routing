import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { TripPlan } from '../../api/types'
import { formatDateTime } from '../../lib/format'
import { RISK_LABELS } from '../../lib/risk'
import { EMPTY, checkpointFeatures, endpointFeatures, planBounds, routeFeatures } from './geojson'

// Map renderer: MapLibre GL. Tiles: OpenFreeMap (free, no key), CARTO Positron as a fallback.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const FALLBACK_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

interface MapViewProps {
  plan: TripPlan | null
  selectedRouteId: string | null
  selectedSeq: number | null
  onSelectRoute: (id: string) => void
  onSelectCheckpoint: (seq: number) => void
  onMapReady?: (map: MapLibreMap) => void
  children?: ReactNode
}

function addLayers(map: MapLibreMap) {
  map.addSource('routes', { type: 'geojson', data: EMPTY })
  map.addSource('checkpoints', { type: 'geojson', data: EMPTY })
  map.addSource('endpoints', { type: 'geojson', data: EMPTY })

  map.addLayer({
    id: 'routes-casing',
    type: 'line',
    source: 'routes',
    layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['case', ['get', 'selected'], 1, 0] },
    paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'selected'], 9, 6], 'line-opacity': 0.9 },
  })
  map.addLayer({
    id: 'routes-line',
    type: 'line',
    source: 'routes',
    layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['case', ['get', 'selected'], 1, 0] },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['get', 'selected'], 5, 3],
      'line-opacity': ['case', ['get', 'selected'], 1, 0.55],
    },
  })
  map.addLayer({
    id: 'checkpoints-halo',
    type: 'circle',
    source: 'checkpoints',
    filter: ['==', ['get', 'selected'], true],
    paint: { 'circle-radius': 13, 'circle-color': '#0f172a', 'circle-opacity': 0.18 },
  })
  map.addLayer({
    id: 'checkpoints-circle',
    type: 'circle',
    source: 'checkpoints',
    layout: { 'circle-sort-key': ['get', 'sort'] },
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, ['case', ['get', 'selected'], 7, 4.5], 9, ['case', ['get', 'selected'], 10, 7]],
      'circle-stroke-color': ['case', ['get', 'selected'], '#0f172a', '#ffffff'],
      'circle-stroke-width': ['case', ['get', 'selected'], 2.5, 1.5],
    },
  })
  map.addLayer({
    id: 'endpoints-circle',
    type: 'circle',
    source: 'endpoints',
    paint: { 'circle-radius': 10, 'circle-color': '#0f172a', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
  })
  map.addLayer({
    id: 'endpoints-label',
    type: 'symbol',
    source: 'endpoints',
    layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff' },
  })
}

export function MapView({
  plan,
  selectedRouteId,
  selectedSeq,
  onSelectRoute,
  onSelectCheckpoint,
  onMapReady,
  children,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const [ready, setReady] = useState(false)
  // Latest callbacks without re-binding map listeners.
  const callbacks = useRef({ onSelectRoute, onSelectCheckpoint, onMapReady })
  callbacks.current = { onSelectRoute, onSelectCheckpoint, onMapReady }

  // Create the map exactly once.
  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: [-96, 39],
      zoom: 3.6,
      attributionControl: { compact: true },
      dragRotate: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    let usedFallback = false
    map.on('error', (event) => {
      if (!map.loaded() && !usedFallback && /style|fetch/i.test(String(event.error?.message))) {
        usedFallback = true
        map.setStyle(FALLBACK_STYLE_URL)
      }
    })
    map.on('load', () => {
      addLayers(map)
      map.on('click', 'checkpoints-circle', (e) => {
        const seq = e.features?.[0]?.properties?.seq
        if (typeof seq === 'number') callbacks.current.onSelectCheckpoint(seq)
      })
      map.on('click', 'routes-line', (e) => {
        if (map.queryRenderedFeatures(e.point, { layers: ['checkpoints-circle'] }).length) return
        const id = e.features?.[0]?.properties?.id
        if (typeof id === 'string') callbacks.current.onSelectRoute(id)
      })
      for (const layer of ['checkpoints-circle', 'routes-line']) {
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
      }
      setReady(true)
      callbacks.current.onMapReady?.(map)
    })

    return () => {
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // New plan: replace route + endpoint data and frame the trip.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('endpoints') as GeoJSONSource).setData(plan ? endpointFeatures(plan) : EMPTY)
    const bounds = plan && planBounds(plan)
    if (!bounds) return
    // On large screens the forecast panel floats over the bottom of the map.
    const overlayBottom = window.matchMedia?.('(min-width: 1024px)').matches ? 210 : 40
    map.fitBounds(bounds, { padding: { top: 50, bottom: overlayBottom, left: 50, right: 50 }, duration: 800, maxZoom: 9 })
  }, [ready, plan])

  // Selection: cheap setData on small collections; layers stay untouched.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const route = plan?.routes.find((r) => r.id === selectedRouteId)
    ;(map.getSource('routes') as GeoJSONSource).setData(plan ? routeFeatures(plan, selectedRouteId) : EMPTY)
    ;(map.getSource('checkpoints') as GeoJSONSource).setData(checkpointFeatures(route, selectedSeq))

    popupRef.current?.remove()
    const cp = route?.checkpoints.find((c) => c.seq === selectedSeq)
    if (!cp) return
    const content = document.createElement('div')
    content.className = 'text-xs'
    const title = document.createElement('div')
    title.className = 'font-semibold'
    title.textContent = `Mile ${Math.round(cp.mile)} · ${RISK_LABELS[cp.risk.level]}`
    const eta = document.createElement('div')
    eta.textContent = `ETA ${formatDateTime(cp.eta)}`
    content.append(title, eta)
    popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 14, focusAfterOpen: false })
      .setLngLat([cp.lon, cp.lat])
      .setDOMContent(content)
      .addTo(map)
    if (!map.getBounds().contains([cp.lon, cp.lat])) map.easeTo({ center: [cp.lon, cp.lat], duration: 500 })
  }, [ready, plan, selectedRouteId, selectedSeq])

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" aria-label="Route map" role="region" />
      {children}
    </div>
  )
}
