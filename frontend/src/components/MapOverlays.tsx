import { LogoMark } from './Brand'

export function ViewToggle({ view3d, onChange }: { view3d: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="group"
      aria-label="Map view"
      className="glass-blur absolute top-2.5 right-[52px] z-10 flex rounded-xl p-1 text-xs font-bold"
    >
      {[false, true].map((is3d) => (
        <button
          key={String(is3d)}
          type="button"
          aria-pressed={view3d === is3d}
          onClick={() => onChange(is3d)}
          title={is3d ? 'Tilted view with terrain and 3D weather columns' : 'Flat top-down view'}
          className={`rounded-lg px-3 py-1.5 transition-all ${
            view3d === is3d
              ? 'bg-gradient-to-b from-slate-800 to-slate-950 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {is3d ? '3D' : '2D'}
        </button>
      ))}
    </div>
  )
}

const STEPS = [
  { n: '1', title: 'Enter the trip', text: 'Origin, destination, departure and load weight.' },
  { n: '2', title: 'Forecast at each ETA', text: 'Weather is sampled when the truck reaches every checkpoint.' },
  { n: '3', title: 'Compare and choose', text: 'Routes are ranked by Severe and High miles, then risk and time.' },
]

/** Onboarding card shown on the map before the first plan. */
export function EmptyState() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-start justify-center px-4 pt-14 md:place-items-center md:pt-0 lg:left-[450px]">
      <div className="glass-blur animate-rise max-w-md rounded-3xl p-5 md:p-6">
        <div className="flex items-center gap-3 [perspective:600px]">
          <div className="animate-float [transform-style:preserve-3d]">
            <LogoMark className="h-12 w-12" />
          </div>
          <p className="text-sm font-semibold text-slate-800">
            Enter a trip to compare up to three truck routes.
          </p>
        </div>
        <ol className="mt-4 hidden space-y-3 md:block">
          {STEPS.map((step) => (
            <li key={step.n} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-[0_3px_0_0_#312e81]">
                {step.n}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                <p className="text-xs text-slate-600">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/** Animated "truck on the road" loader over the map. */
export function PlanningOverlay() {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-slate-900/10 backdrop-blur-[2px] lg:left-[450px]" aria-live="polite">
      <div className="glass-blur flex flex-col items-center gap-3 rounded-2xl px-6 py-4">
        <div className="relative h-2 w-48 overflow-hidden rounded-full bg-slate-200 shadow-inner">
          <span className="animate-drive absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />
        </div>
        <p className="text-sm font-semibold text-slate-800">Planning routes and sampling forecasts…</p>
      </div>
    </div>
  )
}

export function ResultsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="skeleton h-28 rounded-2xl" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-36 rounded-2xl" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  )
}
