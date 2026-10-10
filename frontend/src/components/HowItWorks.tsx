import { useState } from 'react'
import { LogoMark } from './Brand'

const STORAGE_KEY = 'wtr.howItWorks.dismissed'

const STEPS = [
  { n: '1', title: 'Enter the trip', text: 'Origin, destination, departure and load weight.' },
  { n: '2', title: 'Forecast at each ETA', text: 'Weather is sampled when the truck reaches every checkpoint.' },
  { n: '3', title: 'Compare and choose', text: 'Routes are ranked by Severe and High miles, then risk and time.' },
]

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false // storage blocked (private mode): just show the card
  }
}

/** Onboarding card under the trip form; dismissible, and the choice is remembered on this device. */
export function HowItWorks() {
  const [dismissed, setDismissed] = useState(readDismissed)
  if (dismissed) return null

  function dismiss() {
    setDismissed(true)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // Not persisted; it simply reappears next visit.
    }
  }

  return (
    <section aria-label="How it works" className="card-3d animate-rise relative rounded-2xl p-4">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss how it works"
        className="absolute top-2.5 right-2.5 z-10 grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
        </svg>
      </button>
      <div className="flex items-center gap-3 pr-8 [perspective:600px]">
        <div className="animate-float [transform-style:preserve-3d]">
          <LogoMark className="h-10 w-10" />
        </div>
        <p className="text-sm font-semibold text-slate-800">Enter a trip to compare up to three truck routes.</p>
      </div>
      <ol className="mt-3.5 space-y-3">
        {STEPS.map((step) => (
          <li key={step.n} className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 text-[11px] font-bold text-white shadow-[0_3px_0_0_#312e81]">
              {step.n}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{step.title}</p>
              <p className="text-xs text-slate-600">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
