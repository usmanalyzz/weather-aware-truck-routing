import { useMutation, useQuery } from '@tanstack/react-query'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useState } from 'react'
import { ApiError, api } from './api/client'
import { Brand } from './components/Brand'
import { Splash } from './components/Splash'
import { HowItWorks } from './components/HowItWorks'
import { PlanningOverlay, ResultsSkeleton, ViewToggle } from './components/MapOverlays'
import type { TripPlan, TripRequest } from './api/types'
import { CheckpointPanel } from './features/checkpoints/CheckpointPanel'
import { CheckpointTable } from './features/checkpoints/CheckpointTable'
import { ForecastPanel } from './features/forecast/ForecastPanel'
import { MapView } from './features/map/MapView'
import { Notices, Recommendation } from './features/routes/Recommendation'
import { RouteCards } from './features/routes/RouteCards'
import { TripForm } from './features/trip-form/TripForm'
import { formatDateTime } from './lib/format'

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'VALIDATION' && error.fields) {
      const details = Object.values(error.fields).flat().filter((v) => typeof v === 'string')
      return details.length ? details.join(' ') : error.message
    }
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

export default function App() {
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [view3d, setView3d] = useState(false)

  const planMutation = useMutation<TripPlan, unknown, TripRequest>({
    mutationFn: (trip) => api.planTrip(trip),
    onSuccess: (plan) => {
      setSelectedRouteId(plan.recommendation.route_id ?? plan.routes[0]?.id ?? null)
      setSelectedSeq(null)
    },
  })
  const plan = planMutation.data ?? null
  const selectedRoute = plan?.routes.find((r) => r.id === selectedRouteId)
  const selectedCheckpoint = selectedRoute?.checkpoints.find((c) => c.seq === selectedSeq)

  // Loaded after the plan so routes appear first; the server reuses the cached plan for this request.
  const heatmapQuery = useQuery({
    queryKey: ['heatmap', plan?.trip_id, plan?.generated_at],
    queryFn: ({ signal }) => api.heatmap(plan!.request, signal),
    enabled: Boolean(plan),
    staleTime: 10 * 60 * 1000,
  })

  function selectRoute(id: string) {
    if (id !== selectedRouteId) setSelectedSeq(null)
    setSelectedRouteId(id)
  }

  /** From the map a checkpoint of any route can be picked; that also selects its route. */
  function selectCheckpoint(seq: number, routeId?: string) {
    if (routeId) setSelectedRouteId(routeId)
    setSelectedSeq(seq)
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-100 to-slate-200 text-slate-900 lg:relative lg:h-dvh lg:overflow-hidden">
      <Splash ready={map !== null} />

      {/* Phone header (the desktop brand sits inside the floating sidebar). */}
      <header className="relative z-30 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 px-4 py-3 text-white shadow-lg lg:hidden">
        <Brand />
      </header>

      {/* Full-bleed map on desktop; a fixed-height block on phones. */}
      <main className="relative h-[52dvh] min-h-[340px] lg:absolute lg:inset-0 lg:h-auto">
        <MapView
          plan={plan}
          selectedRouteId={selectedRouteId}
          selectedSeq={selectedSeq}
          onSelectRoute={selectRoute}
          onSelectCheckpoint={selectCheckpoint}
          onMapReady={setMap}
          view3d={view3d}
        >
          <ViewToggle view3d={view3d} onChange={setView3d} />
          {planMutation.isPending && <PlanningOverlay />}
        </MapView>
      </main>

      {plan && (
        <div className="relative z-10 lg:absolute lg:bottom-3 lg:left-[calc(50%+225px)] lg:w-[min(660px,calc(100%-500px))] lg:-translate-x-1/2">
          <ForecastPanel
            map={map}
            heatmap={heatmapQuery.data}
            loading={heatmapQuery.isPending}
            error={heatmapQuery.isError ? errorMessage(heatmapQuery.error) : null}
            focusTime={selectedCheckpoint?.eta ?? null}
            tripHours={selectedRoute ? selectedRoute.duration_s / 3600 : null}
            view3d={view3d}
          />
        </div>
      )}

      <aside className="relative z-10 p-3 lg:absolute lg:top-3 lg:bottom-3 lg:left-3 lg:w-[430px] lg:p-0">
        <div className="lg:glass flex flex-col lg:h-full lg:overflow-hidden lg:rounded-3xl">
          <div className="hidden border-b border-slate-200/70 bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 px-4 py-3.5 text-white lg:block">
            <Brand />
          </div>
          <div className="space-y-3 lg:flex-1 lg:overflow-y-auto lg:p-3">
            <section className="card-3d rounded-2xl p-3.5">
              <TripForm onSubmit={(trip) => planMutation.mutate(trip)} submitting={planMutation.isPending} />
            </section>

            {!plan && !planMutation.isPending && <HowItWorks />}

            {planMutation.isError && (
              <div role="alert" className="animate-rise rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 shadow-sm">
                <p className="font-semibold">Could not plan this trip</p>
                <p className="mt-0.5">{errorMessage(planMutation.error)}</p>
              </div>
            )}

            {planMutation.isPending && <ResultsSkeleton />}

            {plan && !planMutation.isPending && (
              <>
                <Recommendation plan={plan} />
                <Notices notices={plan.notices} />
                <p className="px-1 text-xs text-slate-500">
                  Departing {formatDateTime(plan.request.departure_time)} · {plan.request.load_weight_lb.toLocaleString()} lb ·
                  checkpoints every {plan.request.sample_interval_mi} mi
                </p>
                <RouteCards plan={plan} selectedRouteId={selectedRouteId} onSelectRoute={selectRoute} />
                {selectedRoute && selectedCheckpoint && (
                  <CheckpointPanel
                    key={`${selectedRoute.id}-${selectedCheckpoint.seq}`}
                    route={selectedRoute}
                    checkpoint={selectedCheckpoint}
                    loadWeightLb={plan.request.load_weight_lb}
                    onStep={setSelectedSeq}
                    onClose={() => setSelectedSeq(null)}
                  />
                )}
                {selectedRoute && (
                  <section aria-label="Checkpoint list">
                    <h2 className="mb-1.5 px-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                      {selectedRoute.label} checkpoints ({selectedRoute.checkpoints.length})
                    </h2>
                    <CheckpointTable route={selectedRoute} selectedSeq={selectedSeq} onSelect={setSelectedSeq} />
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
