import { useEffect, useRef, useState } from 'react'

/** Animates a number from its previous value to `target` (ease-out). Instant with reduced motion. */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(() =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? target : 0,
  )
  const from = useRef(0)

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const start = from.current
    from.current = target
    if (reduce || start === target) {
      setValue(target)
      return
    }
    const t0 = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      // rAF timestamps can precede t0 slightly; clamp so progress never goes negative.
      const t = Math.min(Math.max((now - t0) / durationMs, 0), 1)
      setValue(start + (target - start) * (1 - (1 - t) ** 3))
      if (t < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])

  return value
}
