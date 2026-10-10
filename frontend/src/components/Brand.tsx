export function LogoMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-600 to-violet-700 shadow-lg shadow-indigo-900/40 ring-1 ring-white/20 ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="h-3/5 w-3/5" fill="none">
        <path d="M5 22c4-9 8-12 11-12s4 5 11 2" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="16" cy="10" r="2.8" fill="#fbbf24" />
      </svg>
      <span className="absolute inset-x-1 top-0.5 h-1/2 rounded-t-xl bg-gradient-to-b from-white/30 to-transparent" />
    </span>
  )
}

export function Brand({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark />
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-extrabold tracking-tight">Weather-Aware Truck Routing</h1>
        <p className="mt-0.5 truncate text-xs opacity-70">Forecast at every checkpoint's ETA</p>
      </div>
    </div>
  )
}
