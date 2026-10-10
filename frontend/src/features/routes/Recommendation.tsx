import type { TripPlan } from '../../api/types'

export function Recommendation({ plan }: { plan: TripPlan }) {
  const { recommendation: rec } = plan
  const best = plan.routes.find((r) => r.id === rec.route_id)
  if (!best) return null

  return (
    <section
      aria-label="Recommendation"
      className={`rounded-xl border p-3 ${
        rec.all_routes_unsafe ? 'border-purple-300 bg-purple-50' : 'border-emerald-200 bg-emerald-50'
      }`}
    >
      <h2 className={`text-sm font-semibold ${rec.all_routes_unsafe ? 'text-purple-950' : 'text-emerald-950'}`}>
        {rec.all_routes_unsafe ? '⚠ No route is confirmed safe' : `Recommended: ${best.label}`}
      </h2>
      <ul className="mt-1 space-y-1 text-xs text-slate-700">
        {rec.rationale.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">
        Ranked by fewest No Travel miles, then Severe-or-worse miles, High miles, average risk and drive time.
      </p>
    </section>
  )
}

export function Notices({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null
  return (
    <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900" aria-label="Notices">
      {notices.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  )
}
