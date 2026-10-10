import type { Route, TripPlan } from '../../api/types'
import { RiskBadge } from '../../components/RiskBadge'
import { formatDuration, formatMiles, formatTime } from '../../lib/format'
import { routeColor } from '../../lib/risk'
import { RiskStrip } from './RiskStrip'

interface RouteCardsProps {
  plan: TripPlan
  selectedRouteId: string | null
  onSelectRoute: (id: string) => void
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className={`text-sm tabular-nums ${emphasis ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{value}</dd>
    </div>
  )
}

function RouteCard({
  route,
  index,
  rank,
  recommended,
  selected,
  onSelect,
}: {
  route: Route
  index: number
  rank: number
  recommended: boolean
  selected: boolean
  onSelect: () => void
}) {
  const s = route.summary
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
          selected ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'
        }`}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: routeColor(index) }} aria-hidden />
          <span className="font-semibold text-slate-900">{route.label}</span>
          <span className="text-xs text-slate-500">#{rank}</span>
          {recommended && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              Recommended
            </span>
          )}
          <RiskBadge level={s.max_level} className="ml-auto" />
        </div>

        <dl className="mb-2 grid grid-cols-3 gap-x-3 gap-y-1">
          <Metric label="Distance" value={formatMiles(route.distance_mi)} />
          <Metric label="Drive time" value={formatDuration(route.duration_s)} />
          <Metric label="Arrive" value={formatTime(route.arrival_time)} />
          <Metric label="Severe+ mi" value={s.severe_or_worse_miles.toFixed(1)} emphasis={s.severe_or_worse_miles > 0} />
          <Metric label="High mi" value={s.high_miles.toFixed(1)} emphasis={s.high_miles > 0} />
          <Metric label="Avg risk" value={s.avg_risk === null ? '—' : s.avg_risk.toFixed(2)} />
        </dl>

        <RiskStrip checkpoints={route.checkpoints} />

        {(s.no_travel_miles > 0 || s.unknown_miles > 0) && (
          <p className="mt-2 text-xs text-slate-600">
            {s.no_travel_miles > 0 && (
              <span className="font-semibold text-purple-900">{s.no_travel_miles.toFixed(1)} mi No Travel. </span>
            )}
            {s.unknown_miles > 0 && <span>{s.unknown_miles.toFixed(1)} mi without forecast.</span>}
          </p>
        )}
      </button>
    </li>
  )
}

export function RouteCards({ plan, selectedRouteId, onSelectRoute }: RouteCardsProps) {
  const rank = new Map(plan.recommendation.ranking.map((id, i) => [id, i + 1]))
  return (
    <ul className="space-y-2" aria-label="Route options">
      {plan.routes.map((route, index) => (
        <RouteCard
          key={route.id}
          route={route}
          index={index}
          rank={rank.get(route.id) ?? index + 1}
          recommended={route.id === plan.recommendation.route_id}
          selected={route.id === selectedRouteId}
          onSelect={() => onSelectRoute(route.id)}
        />
      ))}
    </ul>
  )
}
