import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { TripPlan } from '../../api/types'
import { formatDateTime } from '../../lib/format'
import { RISK_LABELS } from '../../lib/risk'
import { EMPTY, checkpointFeatures, endpointFeatures, planBounds, routeFeatures } from './geojson'
import { OVERLAY_BEFORE_LAYER } from './layers'

// Map renderer: MapLibre GL. Tiles: OpenFreeMap (free, no key), CARTO Positron as a fallback.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const FALLBACK_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
// Free open elevation data (AWS Terrain Tiles, Terrarium encoding), loaded only in 3D view.
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const TERRAIN_SOURCE = 'terrain-dem'
const HILLSHADE_LAYER = 'terrain-hillshade'
const VIEW_3D = { pitch: 58, bearing: -12 }
const DRAW_MS = 1100

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

interface MapViewProps {
  plan: TripPlan | null
  selectedRouteId: string | null
  selectedSeq: number | null
  onSelectRoute: (id: string) => void
  onSelectCheckpoint: (seq: number) => void
  onMapReady?: (map: MapLibreMap) => void
  /** Tilted camera with real terrain relief. */
  view3d?: boolean
  children?: ReactNode
}

function enable3d(map: MapLibreMap) {
  if (!map.getSource(TERRAIN_SOURCE)) {
    map.addSource(TERRAIN_SOURCE, {
      type: 'raster-dem',
      tiles: [TERRAIN_TILES],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 13,
      attribution: 'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>',
    })
    map.addLayer(
      {
        id: HILLSHADE_LAYER,
        type: 'hillshade',
        source: TERRAIN_SOURCE,
        paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#475569', 'hillshade-highlight-color': '#ffffff' },
      },
      map.getLayer(OVERLAY_BEFORE_LAYER) ? OVERLAY_BEFORE_LAYER : undefined,
    )
  }
  map.setLayoutProperty(HILLSHADE_LAYER, 'visibility', 'visible')
  map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 2.2 })
  map.setSky({
    'sky-color': '#8fb8ff',
    'horizon-color': '#e6efff',
    'fog-color': '#f8fafc',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.85,
  })
}

function disable3d(map: MapLibreMap) {
  map.setTerrain(null)
  if (map.getLayer(HILLSHADE_LAYER)) map.setLayoutProperty(HILLSHADE_LAYER, 'visibility', 'none')
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
  view3d = false,
  children,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const [ready, setReady] = useState(false)
  const drawing = useRef(false)
  const lastSeq = useRef<number | null>(null)
  const selectedRef = useRef(selectedRouteId)
  selectedRef.current = selectedRouteId
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
      maxPitch: 70,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

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

  // New plan: routes "draw" themselves from origin to destination, then checkpoints fade in.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('endpoints') as GeoJSONSource).setData(plan ? endpointFeatures(plan) : EMPTY)
    if (!plan || prefersReducedMotion()) {
      drawing.current = false
      return
    }
    drawing.current = true
    map.setPaintProperty('checkpoints-circle', 'circle-opacity', 0)
    map.setPaintProperty('checkpoints-circle', 'circle-stroke-opacity', 0)
    const routes = map.getSource('routes') as GeoJSONSource
    const start = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(Math.max((now - start) / DRAW_MS, 0), 1)
      const eased = 1 - (1 - t) ** 3
      const fc = routeFeatures(plan, selectedRef.current)
      if (t < 1) {
        for (const f of fc.features) {
          const n = f.geometry.coordinates.length
          f.geometry = { ...f.geometry, coordinates: f.geometry.coordinates.slice(0, Math.max(2, Math.ceil(eased * n))) }
        }
      }
      routes.setData(fc)
      if (t < 1) {
        frame = requestAnimationFrame(step)
        return
      }
      drawing.current = false
      map.setPaintProperty('checkpoints-circle', 'circle-opacity', 1)
      map.setPaintProperty('checkpoints-circle', 'circle-stroke-opacity', 1)
    })
    return () => {
      cancelAnimationFrame(frame)
      drawing.current = false
      map.setPaintProperty('checkpoints-circle', 'circle-opacity', 1)
      map.setPaintProperty('checkpoints-circle', 'circle-stroke-opacity', 1)
    }
  }, [ready, plan])

  // New plan or view mode: frame the trip (tilted in 3D), clear of the floating panels.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (view3d) enable3d(map)
    else if (map.getTerrain()) disable3d(map)

    const bounds = plan && planBounds(plan)
    if (!bounds) {
      map.easeTo({ ...(view3d ? VIEW_3D : { pitch: 0, bearing: 0 }), duration: 1000 })
      return
    }
    // On large screens the sidebar floats on the left and the forecast panel over the bottom of the map.
    const large = window.matchMedia?.('(min-width: 1024px)').matches
    const padding = { top: 60, bottom: large ? 220 : 40, left: large ? 470 : 40, right: 60 }
    if (view3d) {
      // Zoom for the top-down fit, then tilt: the trip fills the view instead of shrinking to the horizon.
      const camera = map.cameraForBounds(bounds, { padding, bearing: VIEW_3D.bearing, maxZoom: 9 })
      // Tilting foreshortens the far side, so step in a little closer than the flat fit.
      if (camera) map.easeTo({ ...camera, zoom: (camera.zoom ?? map.getZoom()) + 0.45, ...VIEW_3D, duration: 1400 })
    } else {
      map.fitBounds(bounds, { padding, duration: 1100, maxZoom: 9, pitch: 0, bearing: 0 })
    }
  }, [ready, plan, view3d])

  // Selection: cheap setData on small collections; layers stay untouched.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const route = plan?.routes.find((r) => r.id === selectedRouteId)
    if (!drawing.current) {
      ;(map.getSource('routes') as GeoJSONSource).setData(plan ? routeFeatures(plan, selectedRouteId) : EMPTY)
    }
    ;(map.getSource('checkpoints') as GeoJSONSource).setData(checkpointFeatures(route, selectedSeq))

    popupRef.current?.remove()
    const cp = route?.checkpoints.find((c) => c.seq === selectedSeq)
    const previous = lastSeq.current
    lastSeq.current = selectedSeq
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
    // Glide to a newly chosen checkpoint.
    if (previous !== selectedSeq) {
      map.flyTo({ center: [cp.lon, cp.lat], zoom: Math.max(map.getZoom(), 6), speed: 1.1, curve: 1.3, essential: false })
    }
  }, [ready, plan, selectedRouteId, selectedSeq])

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" aria-label="Route map" role="region" />
      {children}
    </div>
  )
}
