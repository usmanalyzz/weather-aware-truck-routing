import type { Checkpoint } from '../../api/types'
import { RISK_COLORS, RISK_LABELS } from '../../lib/risk'
import { ownedSegments } from '../../lib/segments'

interface RiskStripProps {
  checkpoints: Checkpoint[]
  selectedSeq?: number | null
  onSelect?: (seq: number) => void
}

/** Horizontal bar of the route, coloured by each checkpoint's risk over the road it represents. */
export function RiskStrip({ checkpoints, selectedSeq, onSelect }: RiskStripProps) {
  const total = checkpoints.at(-1)?.mile ?? 0
  if (total <= 0) return null
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200" role="img" aria-label="Risk along the route">
      {ownedSegments(checkpoints).map(({ checkpoint, from, to }) => (
        <span
          key={checkpoint.seq}
          title={`Mile ${Math.round(checkpoint.mile)} · ${RISK_LABELS[checkpoint.risk.level]}`}
          onClick={
            onSelect
              ? (e) => {
                  e.stopPropagation()
                  onSelect(checkpoint.seq)
                }
              : undefined
          }
          className={`h-full ${onSelect ? 'cursor-pointer' : ''} ${
            selectedSeq === checkpoint.seq ? 'outline-2 outline-offset-[-2px] outline-slate-900' : ''
          }`}
          style={{ width: `${((to - from) / total) * 100}%`, backgroundColor: RISK_COLORS[checkpoint.risk.level] }}
        />
      ))}
    </div>
  )
}
