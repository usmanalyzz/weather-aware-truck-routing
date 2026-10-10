/**
 * Animated semi-truck driving along a road: lane markings scroll past, wheels spin, the cab bobs on its
 * suspension and the exhaust puffs. Pure CSS/SVG (no images); motion stops for reduced-motion users.
 */
export function TruckLoader({ tone = 'dark', className = '' }: { tone?: 'dark' | 'light'; className?: string }) {
  const road = tone === 'dark' ? 'bg-slate-800/80 ring-white/10' : 'bg-slate-700 ring-slate-900/10'
  return (
    <div className={`relative h-24 w-72 ${className}`} aria-hidden>
      {/* Exhaust puffs behind the cab stack */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="animate-puff absolute top-[19px] left-[178px] h-3 w-3 rounded-full bg-slate-300/60 blur-[1px]"
          style={{ animationDelay: `${i * 0.45}s` }}
        />
      ))}

      {/* Truck */}
      <div className="animate-bob absolute bottom-[17px] left-1/2 ml-[-84px]">
        <svg viewBox="0 0 168 64" className="h-16 w-[168px] drop-shadow-[0_8px_10px_rgb(0_0_0/0.35)]">
          <defs>
            <linearGradient id="trailer" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#818cf8" />
              <stop offset="1" stopColor="#4f46e5" />
            </linearGradient>
            <linearGradient id="cab" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#38bdf8" />
              <stop offset="1" stopColor="#0284c7" />
            </linearGradient>
          </defs>
          {/* Trailer */}
          <rect x="2" y="6" width="104" height="38" rx="5" fill="url(#trailer)" />
          <rect x="2" y="6" width="104" height="8" rx="4" fill="#ffffff" opacity="0.18" />
          <path d="M14 28h10l6-9 7 15 6-11h10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          <circle cx="66" cy="19" r="3.2" fill="#fbbf24" />
          <rect x="106" y="38" width="10" height="5" fill="#334155" />
          {/* Cab */}
          <path d="M116 44V20c0-3 2-5 5-5h20c3 0 5 1.5 6.5 4l9 14c1 1.5 1.5 3 1.5 4.5V44z" fill="url(#cab)" />
          <path d="M136 19h6c1.5 0 2.5.6 3.3 1.8l6 9.2H136z" fill="#e0f2fe" opacity="0.95" />
          <rect x="120" y="8" width="3.5" height="12" rx="1.5" fill="#64748b" />
          <rect x="152" y="37" width="6" height="3.5" rx="1.5" fill="#fde68a" />
          <rect x="114" y="44" width="46" height="5" rx="2" fill="#1e293b" />
          <rect x="0" y="44" width="108" height="4" rx="2" fill="#1e293b" />
        </svg>
        {/* Wheels (HTML so they can spin around their own centre) */}
        {[18, 34, 76, 92, 128, 148].map((x) => (
          <span
            key={x}
            className="animate-wheel absolute bottom-[1px] grid h-[14px] w-[14px] place-items-center rounded-full bg-slate-900 ring-2 ring-slate-600"
            style={{ left: x - 7 }}
          >
            <span className="h-[2px] w-[8px] rounded bg-slate-400" />
          </span>
        ))}
      </div>

      {/* Road with scrolling lane markings */}
      <div className={`absolute inset-x-0 bottom-0 h-[18px] overflow-hidden rounded-full shadow-inner ring-1 ${road}`}>
        <span
          className="animate-road absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2"
          style={{
            backgroundImage: 'linear-gradient(90deg, rgb(250 204 21 / 0.9) 0 50%, transparent 50% 100%)',
            backgroundSize: '28px 100%',
          }}
        />
      </div>
    </div>
  )
}
