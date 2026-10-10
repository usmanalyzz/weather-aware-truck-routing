import type { TripPlan } from '../../api/types'

function ShieldIcon({ safe }: { safe: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
      {safe ? <path d="M8.5 12l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M12 8v5m0 3h.01" strokeLinecap="round" />}
    </svg>
  )
}

export function Recommendation({ plan }: { plan: TripPlan }) {
  const { recommendation: rec } = plan
  const best = plan.routes.find((r) => r.id === rec.route_id)
  if (!best) return null
  const unsafe = rec.all_routes_unsafe

  return (
    <section
      aria-label="Recommendation"
      className={`animate-rise relative overflow-hidden rounded-2xl p-4 text-white shadow-xl ${
        unsafe
          ? 'bg-gradient-to-br from-purple-700 via-fuchsia-800 to-slate-900 shadow-purple-900/30'
          : 'bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 shadow-emerald-900/30'
      }`}
    >
      {/* Soft light orbs for depth */}
      <span className="pointer-events-none absolute -top-10 -right-8 h-32 w-32 rounded-full bg-white/20 blur-2xl" aria-hidden />
      <span className="pointer-events-none absolute -bottom-12 -left-10 h-28 w-28 rounded-full bg-black/10 blur-2xl" aria-hidden />
      <span
        className="animate-sweep pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/30 to-transparent"
        aria-hidden
      />

      <div className="relative flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20 shadow-inner ring-1 ring-white/30">
          <ShieldIcon safe={!unsafe} />
        </span>
        <h2 className="text-base font-bold tracking-tight">
          {unsafe ? '⚠ No route is confirmed safe' : `Recommended: ${best.label}`}
        </h2>
      </div>
      <ul className="relative mt-2.5 space-y-1.5 text-[13px] leading-snug text-white/95">
        {rec.rationale.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="relative mt-3 border-t border-white/20 pt-2 text-[11px] text-white/75">
        Ranked by fewest No Travel miles, then Severe-or-worse miles, High miles, average risk and drive time.
      </p>
    </section>
  )
}

export function Notices({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null
  return (
    <ul
      className="animate-rise space-y-1 rounded-xl border border-amber-200 bg-amber-50/90 p-2.5 text-xs text-amber-900 shadow-sm"
      aria-label="Notices"
    >
      {notices.map((n) => (
        <li key={n} className="flex gap-2">
          <span aria-hidden>ⓘ</span>
          {n}
        </li>
      ))}
    </ul>
  )
}
