import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountUp } from '../lib/useCountUp'
import { Splash } from './Splash'

describe('Splash', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const splash = () => screen.queryByRole('status', { name: /loading weather-aware truck routing/i })

  it('stays at least the minimum time even if the map is ready immediately', () => {
    render(<Splash ready />)
    act(() => vi.advanceTimersByTime(1000))
    expect(splash()).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(400)) // minimum reached: fade-out starts
    expect(splash()).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(600)) // fade finished
    expect(splash()).not.toBeInTheDocument()
  })

  it('waits for the map, but never longer than the maximum', () => {
    const { rerender } = render(<Splash ready={false} />)
    act(() => vi.advanceTimersByTime(2000))
    expect(splash()).toBeInTheDocument()
    rerender(<Splash ready />)
    act(() => vi.advanceTimersByTime(600))
    expect(splash()).not.toBeInTheDocument()

    render(<Splash ready={false} />)
    act(() => vi.advanceTimersByTime(3500))
    act(() => vi.advanceTimersByTime(600))
    expect(splash()).not.toBeInTheDocument()
  })
})

describe('useCountUp', () => {
  it('animates to the target value', async () => {
    const { result, rerender } = renderHook(({ v }) => useCountUp(v, 50), { initialProps: { v: 100 } })
    await vi.waitFor(() => expect(result.current).toBe(100))
    rerender({ v: 40 })
    await vi.waitFor(() => expect(result.current).toBe(40))
  })
})
