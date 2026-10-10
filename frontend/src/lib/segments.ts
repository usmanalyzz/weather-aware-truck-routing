import type { Checkpoint } from '../api/types'

/** Owned stretch per checkpoint: midpoint to midpoint (same rule as the backend's risk miles). */
export function ownedSegments(checkpoints: Checkpoint[]): { checkpoint: Checkpoint; from: number; to: number }[] {
  return checkpoints.map((cp, i) => ({
    checkpoint: cp,
    from: i === 0 ? cp.mile : (checkpoints[i - 1].mile + cp.mile) / 2,
    to: i === checkpoints.length - 1 ? cp.mile : (cp.mile + checkpoints[i + 1].mile) / 2,
  }))
}
