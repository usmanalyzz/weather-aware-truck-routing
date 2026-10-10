import { TruckLoader } from './TruckLoader'

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

/** Animated "truck on the road" loader over the map. */
export function PlanningOverlay() {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-slate-900/10 backdrop-blur-[2px] lg:left-[450px]" aria-live="polite">
      <div className="glass-blur flex flex-col items-center gap-3 rounded-2xl px-6 py-4">
        <TruckLoader tone="light" className="scale-90" />
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
