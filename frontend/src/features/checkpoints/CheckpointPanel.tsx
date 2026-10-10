import type { Checkpoint, Route } from '../../api/types'
import { RiskBadge } from '../../components/RiskBadge'
import { formatDateTime, formatMiles, formatTime } from '../../lib/format'
import { FACTOR_LABELS, RISK_COLORS, RISK_LABELS } from '../../lib/risk'

interface CheckpointPanelProps {
  route: Route
  checkpoint: Checkpoint
  loadWeightLb: number
  onStep: (seq: number) => void
  onClose: () => void
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
      <dt className="text-[11px] tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="text-sm font-medium text-slate-900 tabular-nums">{value}</dd>
    </div>
  )
}

export function CheckpointPanel({ route, checkpoint: cp, loadWeightLb, onStep, onClose }: CheckpointPanelProps) {
  const last = route.checkpoints.length - 1
  const factors = Object.entries(cp.risk.factors) as [keyof typeof FACTOR_LABELS, Checkpoint['risk']['level']][]

  return (
    <section aria-label="Checkpoint details" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">
            {route.label} · {cp.seq === 0 ? 'Origin' : cp.seq === last ? 'Destination' : `Checkpoint ${cp.seq}`}
          </h3>
          <p className="text-xs text-slate-600">
            {formatMiles(cp.mile, 1)} · ETA {formatDateTime(cp.eta)}
          </p>
        </div>
        <RiskBadge level={cp.risk.level} className="ml-auto" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close checkpoint details"
          className="-mt-1 -mr-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          ✕
        </button>
      </div>

      {cp.weather.status === 'ok' ? (
        <>
          <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <Reading label="Wind" value={`${cp.weather.wind_mph.toFixed(0)} mph`} />
            <Reading label="Gusts" value={cp.weather.gust_mph === null ? '—' : `${cp.weather.gust_mph.toFixed(0)} mph`} />
            <Reading label="Rain" value={`${cp.weather.rain_in_hr.toFixed(2)} in/h`} />
            <Reading label="Snow" value={`${cp.weather.snow_in_hr.toFixed(1)} in/h`} />
          </dl>
          <p className="mt-2 text-[11px] text-slate-500">
            Forecast for the hour ending {formatTime(cp.weather.time)}. Gusts are shown for context; the rules use
            sustained wind.
          </p>
        </>
      ) : (
        <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
          No forecast is available for this arrival time, so its risk is Unknown (not assumed Low).
        </p>
      )}

      {factors.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-700">
          {factors.map(([factor, level]) => (
            <li key={factor} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RISK_COLORS[level] }} aria-hidden />
              {FACTOR_LABELS[factor]}: <strong>{RISK_LABELS[level]}</strong>
              {factor === 'load' && <span className="text-slate-500">({loadWeightLb.toLocaleString()} lb load)</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex justify-between">
        <button
          type="button"
          disabled={cp.seq === 0}
          onClick={() => onStep(cp.seq - 1)}
          className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:text-slate-300 disabled:hover:bg-transparent"
        >
          ← Previous
        </button>
        <button
          type="button"
          disabled={cp.seq === last}
          onClick={() => onStep(cp.seq + 1)}
          className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:text-slate-300 disabled:hover:bg-transparent"
        >
          Next →
        </button>
      </div>
    </section>
  )
}
