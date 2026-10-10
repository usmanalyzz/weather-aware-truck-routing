import { type ReactNode, useRef } from 'react'

interface TiltProps {
  children: ReactNode
  /** Maximum rotation in degrees. */
  max?: number
  className?: string
  /** Corner radius class shared by the card and its glare. */
  rounded?: string
}

const canTilt = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Subtle 3D tilt toward the pointer with a moving light glare.
 * Styles are written directly to the element, so pointer movement never re-renders React.
 * Disabled for touch devices and users who prefer reduced motion.
 */
export function Tilt({ children, max = 7, className = '', rounded = 'rounded-2xl' }: TiltProps) {
  const inner = useRef<HTMLDivElement>(null)
  const frame = useRef(0)

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const el = inner.current
    if (!el || !canTilt()) return
    const rect = el.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      el.style.transform = `rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) translateZ(0)`
      el.style.setProperty('--glare-x', `${x * 100}%`)
      el.style.setProperty('--glare-y', `${y * 100}%`)
      el.style.setProperty('--glare-o', '1')
    })
  }

  function reset() {
    const el = inner.current
    if (!el) return
    cancelAnimationFrame(frame.current)
    el.style.transform = ''
    el.style.setProperty('--glare-o', '0')
  }

  return (
    <div className={`[perspective:900px] ${className}`} onPointerMove={onPointerMove} onPointerLeave={reset}>
      <div
        ref={inner}
        className={`relative transition-transform duration-200 ease-out will-change-transform [transform-style:preserve-3d] ${rounded}`}
      >
        {children}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${rounded}`}
          style={{
            opacity: 'var(--glare-o, 0)',
            background:
              'radial-gradient(circle at var(--glare-x, 50%) var(--glare-y, 50%), rgb(255 255 255 / 0.55), transparent 55%)',
            mixBlendMode: 'soft-light',
          }}
        />
      </div>
    </div>
  )
}
