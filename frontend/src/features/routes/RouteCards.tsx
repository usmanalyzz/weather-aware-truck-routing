import type { Route, TripPlan } from '../../api/types'
import { RiskBadge } from '../../components/RiskBadge'
import { Tilt } from '../../components/Tilt'
import { formatDuration, formatMiles, formatTime } from '../../lib/format'
import { useCountUp } from '../../lib/useCountUp'
import { routeColor } from '../../lib/risk'
import { RiskStrip } from './RiskStrip'

interface RouteCardsProps {
  plan: TripPlan
  selectedRouteId: string | null
  onSelectRoute: (id: string) => void
}

function Metric({
  label,
  value,
  format,
  emphasis,
}: {
  label: string
  value: number
  format: (n: number) => string
  emphasis?: boolean
}) {
  const shown = useCountUp(value)
  return (
    <div>
      <dt className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">{label}</dt>
      <dd className={`text-sm tabular-nums ${emphasis ? 'font-bold text-red-700' : 'font-semibold text-slate-800'}`}>{format(shown)}</dd>
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
  const color = routeColor(index)
  return (
    <li className="animate-rise" style={{ animationDelay: `${index * 80}ms` }}>
      <Tilt>
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={`card-3d relative w-full rounded-2xl p-3.5 text-left transition-all duration-300 [transform-style:preserve-3d] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
            selected ? '-translate-y-0.5 shadow-2xl ring-2 ring-offset-2 ring-offset-white' : 'hover:-translate-y-0.5 hover:shadow-xl'
          }`}
          style={selected ? ({ '--tw-ring-color': color } as React.CSSProperties) : undefined}
        >
          {/* Route colour edge */}
          <span className="absolute inset-y-0 left-0 w-1.5 rounded-l-2xl" style={{ backgroundColor: color }} aria-hidden />

          <div className="mb-2.5 flex items-center gap-2 [transform:translateZ(28px)]">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-white shadow-md"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
              aria-hidden
            >
              {route.label.slice(-1)}
            </span>
            <span className="font-semibold text-slate-900">{route.label}</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">#{rank}</span>
            {recommended && (
              <span className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm shadow-emerald-500/40">
                Recommended
              </span>
            )}
            <RiskBadge level={s.max_level} className="ml-auto shadow-sm" />
          </div>

          <dl className="mb-3 grid grid-cols-3 gap-x-3 gap-y-2 [transform:translateZ(14px)]">
            <Metric label="Distance" value={route.distance_mi} format={(n) => formatMiles(n)} />
            <Metric label="Drive time" value={route.duration_s} format={formatDuration} />
            <div>
              <dt className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">Arrive</dt>
              <dd className="text-sm font-semibold text-slate-800 tabular-nums">{formatTime(route.arrival_time)}</dd>
            </div>
            <Metric label="Severe+ mi" value={s.severe_or_worse_miles} format={(n) => n.toFixed(1)} emphasis={s.severe_or_worse_miles > 0} />
            <Metric label="High mi" value={s.high_miles} format={(n) => n.toFixed(1)} emphasis={s.high_miles > 0} />
            {s.avg_risk === null ? (
              <div>
                <dt className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">Avg risk</dt>
                <dd className="text-sm font-semibold text-slate-800">—</dd>
              </div>
            ) : (
              <Metric label="Avg risk" value={s.avg_risk} format={(n) => n.toFixed(2)} />
            )}
          </dl>

          <div className="[transform:translateZ(8px)]">
            <RiskStrip checkpoints={route.checkpoints} />
          </div>

          {(s.no_travel_miles > 0 || s.unknown_miles > 0) && (
            <p className="mt-2 text-xs text-slate-600">
              {s.no_travel_miles > 0 && (
                <span className="font-semibold text-purple-900">{s.no_travel_miles.toFixed(1)} mi No Travel. </span>
              )}
              {s.unknown_miles > 0 && <span>{s.unknown_miles.toFixed(1)} mi without forecast.</span>}
            </p>
          )}
        </button>
      </Tilt>
    </li>
  )
}

export function RouteCards({ plan, selectedRouteId, onSelectRoute }: RouteCardsProps) {
  const rank = new Map(plan.recommendation.ranking.map((id, i) => [id, i + 1]))
  return (
    <ul className="space-y-3" aria-label="Route options">
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
