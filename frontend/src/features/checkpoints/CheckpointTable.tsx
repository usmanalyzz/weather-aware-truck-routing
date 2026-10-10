import { useEffect, useRef } from 'react'
import type { Route } from '../../api/types'
import { RISK_COLORS, RISK_LABELS } from '../../lib/risk'
import { formatTime } from '../../lib/format'

interface CheckpointTableProps {
  route: Route
  selectedSeq: number | null
  onSelect: (seq: number) => void
}

export function CheckpointTable({ route, selectedSeq, onSelect }: CheckpointTableProps) {
  const selectedRow = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    selectedRow.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedSeq])

  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Checkpoints along {route.label}</caption>
        <thead className="sticky top-0 bg-slate-50 text-[11px] tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-2 py-1.5 font-medium">Mile</th>
            <th className="px-2 py-1.5 font-medium">ETA</th>
            <th className="px-2 py-1.5 font-medium">Wind</th>
            <th className="px-2 py-1.5 font-medium">Rain / Snow</th>
            <th className="px-2 py-1.5 font-medium">Risk</th>
          </tr>
        </thead>
        <tbody>
          {route.checkpoints.map((cp) => {
            const selected = cp.seq === selectedSeq
            return (
              <tr
                key={cp.seq}
                ref={selected ? selectedRow : undefined}
                onClick={() => onSelect(cp.seq)}
                aria-selected={selected}
                className={`cursor-pointer border-t border-slate-100 tabular-nums ${
                  selected ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <td className="px-2 py-1">{Math.round(cp.mile)}</td>
                <td className="px-2 py-1 whitespace-nowrap">{formatTime(cp.eta)}</td>
                <td className="px-2 py-1">{cp.weather.status === 'ok' ? `${Math.round(cp.weather.wind_mph)} mph` : '—'}</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {cp.weather.status === 'ok'
                    ? `${cp.weather.rain_in_hr.toFixed(2)} / ${cp.weather.snow_in_hr.toFixed(1)}`
                    : 'No forecast'}
                </td>
                <td className="px-2 py-1">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RISK_COLORS[cp.risk.level] }} aria-hidden />
                    {RISK_LABELS[cp.risk.level]}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
