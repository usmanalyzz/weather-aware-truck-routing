import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError, api } from './api/client'
import type { TripPlan, TripRequest } from './api/types'
import { CheckpointPanel } from './features/checkpoints/CheckpointPanel'
import { CheckpointTable } from './features/checkpoints/CheckpointTable'
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

  function selectRoute(id: string) {
    if (id !== selectedRouteId) setSelectedSeq(null)
    setSelectedRouteId(id)
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-100 text-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-sm font-bold text-white" aria-hidden>
          WR
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">Weather-Aware Truck Routing</h1>
          <p className="truncate text-xs text-slate-500">Compare truck routes by forecast weather at each checkpoint's ETA</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 w-full space-y-3 overflow-y-auto p-3 lg:order-1 lg:w-[420px] lg:shrink-0 lg:border-r lg:border-slate-200">
          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <TripForm onSubmit={(trip) => planMutation.mutate(trip)} submitting={planMutation.isPending} />
          </section>

          {planMutation.isError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">Could not plan this trip</p>
              <p className="mt-0.5">{errorMessage(planMutation.error)}</p>
            </div>
          )}

          {plan && (
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
                  route={selectedRoute}
                  checkpoint={selectedCheckpoint}
                  loadWeightLb={plan.request.load_weight_lb}
                  onStep={setSelectedSeq}
                  onClose={() => setSelectedSeq(null)}
                />
              )}
              {selectedRoute && (
                <section aria-label="Checkpoint list">
                  <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                    {selectedRoute.label} checkpoints ({selectedRoute.checkpoints.length})
                  </h2>
                  <CheckpointTable route={selectedRoute} selectedSeq={selectedSeq} onSelect={setSelectedSeq} />
                </section>
              )}
            </>
          )}
        </aside>

        <main className="relative order-1 h-[55dvh] min-h-[320px] lg:order-2 lg:h-auto lg:flex-1">
          <MapView
            plan={plan}
            selectedRouteId={selectedRouteId}
            selectedSeq={selectedSeq}
            onSelectRoute={selectRoute}
            onSelectCheckpoint={setSelectedSeq}
          >
            {!plan && !planMutation.isPending && (
              <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
                <p className="rounded-full bg-white/90 px-4 py-2 text-sm text-slate-600 shadow">
                  Enter a trip to compare up to three truck routes.
                </p>
              </div>
            )}
            {planMutation.isPending && (
              <div className="absolute inset-0 grid place-items-center bg-white/40 backdrop-blur-[1px]" aria-live="polite">
                <p className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden />
                  Planning routes and sampling forecasts…
                </p>
              </div>
            )}
          </MapView>
        </main>
      </div>
    </div>
  )
}
