import { useEffect, useState } from 'react'
import { LogoMark } from './Brand'

const MIN_MS = 1400 // long enough to read, short enough not to annoy
const MAX_MS = 3500 // never block the app on slow tiles or a sleeping API
const FADE_MS = 600

const MESSAGES = ['Loading map tiles…', 'Waking the routing API…', 'Preparing forecast engine…']

/** Branded splash on first load; fades out once the map is ready (bounded by MIN_MS..MAX_MS). */
export function Splash({ ready }: { ready: boolean }) {
  const [minElapsed, setMinElapsed] = useState(false)
  const [maxElapsed, setMaxElapsed] = useState(false)
  const [gone, setGone] = useState(false)
  const [message, setMessage] = useState(0)

  useEffect(() => {
    const min = window.setTimeout(() => setMinElapsed(true), MIN_MS)
    const max = window.setTimeout(() => setMaxElapsed(true), MAX_MS)
    const ticker = window.setInterval(() => setMessage((m) => (m + 1) % MESSAGES.length), 900)
    return () => {
      window.clearTimeout(min)
      window.clearTimeout(max)
      window.clearInterval(ticker)
    }
  }, [])

  const leaving = (ready && minElapsed) || maxElapsed
  useEffect(() => {
    if (!leaving) return
    const id = window.setTimeout(() => setGone(true), FADE_MS)
    return () => window.clearTimeout(id)
  }, [leaving])

  if (gone) return null
  return (
    <div
      role="status"
      aria-label="Loading Weather-Aware Truck Routing"
      className={`fixed inset-0 z-50 grid place-items-center overflow-hidden bg-[radial-gradient(ellipse_at_top,#1e1b4b_0%,#0b1220_55%,#020617_100%)] text-white transition-all duration-[600ms] ${
        leaving ? 'pointer-events-none scale-105 opacity-0' : 'opacity-100'
      }`}
    >
      {/* Perspective grid floor for depth */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 [perspective:500px]" aria-hidden>
        <div
          className="absolute inset-x-[-50%] bottom-[-20%] h-[140%] origin-bottom [transform:rotateX(62deg)] opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgb(129 140 248 / 0.35) 1px, transparent 1px), linear-gradient(90deg, rgb(129 140 248 / 0.35) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'linear-gradient(to top, black 10%, transparent 85%)',
          }}
        />
      </div>
      <span className="absolute top-1/4 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-600/30 blur-3xl" aria-hidden />

      <div className="relative flex flex-col items-center px-6 text-center">
        <div className="animate-float [perspective:600px] [transform-style:preserve-3d]">
          <LogoMark className="h-20 w-20 rounded-3xl" />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">Weather-Aware Truck Routing</h1>
        <p className="mt-2 max-w-md text-sm text-indigo-100/80">
          Compare real truck routes by the forecast at every checkpoint's arrival time.
        </p>
        <div className="mt-4 flex gap-2 text-xs font-semibold">
          <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-300 ring-1 ring-emerald-400/30">Django REST Framework</span>
          <span className="rounded-full bg-sky-400/15 px-3 py-1 text-sky-300 ring-1 ring-sky-400/30">React</span>
        </div>

        <div className="mt-8 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
          <span className="animate-drive block h-full w-1/3 rounded-full bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400" />
        </div>
        <p className="mt-3 h-4 text-xs text-indigo-100/70" aria-live="polite">
          {MESSAGES[message]}
        </p>
      </div>
    </div>
  )
}
