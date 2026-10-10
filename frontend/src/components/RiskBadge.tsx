import type { RiskLevel } from '../api/types'
import { RISK_COLORS, RISK_LABELS, riskTextColor } from '../lib/risk'

export function RiskBadge({ level, className = '' }: { level: RiskLevel; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${className}`}
      style={{ backgroundColor: RISK_COLORS[level], color: riskTextColor(level) }}
    >
      {RISK_LABELS[level]}
    </span>
  )
}
