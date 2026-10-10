import { act, render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import type { Heatmap } from '../../api/types'
import heatmapJson from '../../test/fixtures/heatmap.json'
import { ForecastPanel, HEATMAP_LAYER, HEATMAP_SOURCE } from './ForecastPanel'
import { timeForHour } from './heatmapStyle'

const heatmap = heatmapJson as unknown as Heatmap

function fakeMap() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Set<string>(['routes-casing'])
  const setData = vi.fn()
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string) => sources.set(id, { setData })),
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    queryRenderedFeatures: vi.fn(() => []),
  }
  return { map, setData, asMap: map as unknown as MapLibreMap }
}

function lastPaint(map: ReturnType<typeof fakeMap>['map'], property: string) {
  const calls = map.setPaintProperty.mock.calls.filter(([layer, prop]) => layer === HEATMAP_LAYER && prop === property)
  return JSON.stringify(calls.at(-1)?.[2])
}

function renderPanel(props: Partial<React.ComponentProps<typeof ForecastPanel>> = {}) {
  const fake = fakeMap()
  const utils = render(
    <ForecastPanel map={fake.asMap} heatmap={heatmap} loading={false} error={null} focusTime={null} tripHours={15} {...props} />,
  )
  return { ...fake, ...utils }
}

describe('ForecastPanel', () => {
  it('creates the overlay under the routes and uploads data once', () => {
    const { map, setData } = renderPanel()
    expect(map.addSource).toHaveBeenCalledWith(HEATMAP_SOURCE, expect.anything())
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: HEATMAP_LAYER, type: 'circle' }), 'routes-casing')
    expect(setData).toHaveBeenCalledTimes(1)
    expect(setData.mock.calls[0][0].features).toHaveLength(heatmap.grid.count)
  })

  it('moving the slider only swaps paint expressions (no data re-upload)', () => {
    const { map, setData } = renderPanel()
    const slider = screen.getByRole('slider', { name: /hours after departure/i })

    fireEvent.change(slider, { target: { value: '12' } })
    fireEvent.change(slider, { target: { value: '13' } })

    expect(lastPaint(map, 'circle-color')).toContain('"r13"')
    expect(lastPaint(map, 'circle-opacity')).toContain('"r13"')
    expect(setData).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/^\+13 h ·/)).toBeInTheDocument()
  })

  it('switches metric and legend', async () => {
    const { map } = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Wind' }))

    expect(lastPaint(map, 'circle-color')).toContain('"w0"')
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(legend).toHaveTextContent('< 25')
    expect(legend).toHaveTextContent('≥ 55 mph')
  })

  it('explains hours beyond the forecast horizon', () => {
    renderPanel()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } })
    expect(screen.getByText(/no forecast beyond \+31 h/i)).toBeInTheDocument()
  })

  it('follows the selected checkpoint ETA', () => {
    const { rerender, asMap } = renderPanel()
    rerender(
      <ForecastPanel map={asMap} heatmap={heatmap} loading={false} error={null} focusTime={timeForHour(heatmap, 9)} tripHours={15} />,
    )
    expect(screen.getByRole('slider')).toHaveValue('9')
  })

  it('plays through the hours and stops at the horizon', () => {
    vi.useFakeTimers()
    try {
      renderPanel()
      fireEvent.change(screen.getByRole('slider'), { target: { value: '28' } })
      fireEvent.click(screen.getByRole('button', { name: /play forecast/i }))
      for (let i = 0; i < 5; i++) act(() => vi.advanceTimersByTime(700))
      expect(screen.getByRole('slider')).toHaveValue('30')
      expect(screen.getByRole('button', { name: /play forecast/i })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('hides the overlay', async () => {
    const { map } = renderPanel()
    await userEvent.click(screen.getByRole('checkbox', { name: /show overlay/i }))
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(HEATMAP_LAYER, 'visibility', 'none')
  })

  it('shows loading and error states', () => {
    const { rerender, asMap } = renderPanel({ heatmap: undefined, loading: true })
    expect(screen.getByText(/loading corridor forecast/i)).toBeInTheDocument()
    rerender(<ForecastPanel map={asMap} heatmap={undefined} loading={false} error="Weather service down" focusTime={null} tripHours={null} />)
    expect(screen.getByText(/overlay unavailable: weather service down/i)).toBeInTheDocument()
  })
})
