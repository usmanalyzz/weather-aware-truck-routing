import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import heatmapJson from './test/fixtures/heatmap.json'
import { mockFetch, plan, renderWithClient } from './test/utils'

// MapLibre needs WebGL, which jsdom lacks; the map's data logic is tested in geojson.test.ts.
vi.mock('./features/map/MapView', () => ({
  MapView: ({ children, selectedRouteId, selectedSeq, onSelectCheckpoint }: {
    children?: React.ReactNode
    selectedRouteId: string | null
    selectedSeq: number | null
    onSelectCheckpoint: (seq: number) => void
  }) => (
    <div data-testid="map" data-route={selectedRouteId ?? ''} data-seq={selectedSeq ?? ''}>
      <button type="button" onClick={() => onSelectCheckpoint(1)}>map checkpoint 1</button>
      {children}
    </div>
  ),
}))

const chicago = { label: 'Chicago, IL, United States', lat: 41.88, lon: -87.63 }
const denver = { label: 'Denver, CO, United States', lat: 39.74, lon: -104.99 }

function api(planResponse: { status?: number; body: unknown } | (() => Promise<{ status?: number; body: unknown }>)) {
  return mockFetch((url) => {
    if (url.includes('/geocode/suggest')) return { body: { results: url.includes('q=Chic') ? [chicago] : [denver] } }
    if (url.includes('/trips/plan')) return typeof planResponse === 'function' ? planResponse() : planResponse
    if (url.includes('/trips/heatmap')) return { body: heatmapJson }
    return { status: 404, body: {} }
  })
}

async function planTrip() {
  await userEvent.type(screen.getByRole('combobox', { name: /origin/i }), 'Chic')
  await userEvent.click(await screen.findByRole('option', { name: chicago.label }))
  await userEvent.type(screen.getByRole('combobox', { name: /destination/i }), 'Denv')
  await userEvent.click(await screen.findByRole('option', { name: denver.label }))
  await userEvent.click(screen.getByRole('button', { name: /plan routes/i }))
}

describe('App', () => {
  it('shows an empty state before planning', () => {
    renderWithClient(<App />)
    expect(screen.getByText(/enter a trip to compare/i)).toBeInTheDocument()
  })

  it('shows a loading state, then the recommendation, routes and checkpoints', async () => {
    let resolve!: (v: { body: unknown }) => void
    const fetch = api(() => new Promise((r) => (resolve = r)))
    renderWithClient(<App />)

    await planTrip()
    expect(await screen.findByText(/planning routes and sampling forecasts/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /planning routes…/i })).toBeDisabled()
    resolve({ body: plan })

    const recommendation = await screen.findByRole('region', { name: 'Recommendation' })
    expect(within(recommendation).getByText('Recommended: Route B')).toBeInTheDocument()
    expect(within(recommendation).getByText(/fewer No Travel miles/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Notices' })).toHaveTextContent(/outside the available forecast/)

    const cards = within(screen.getByRole('list', { name: 'Route options' })).getAllByRole('button')
    expect(cards).toHaveLength(3)
    expect(cards[1]).toHaveAttribute('aria-pressed', 'true') // recommended route preselected
    expect(cards[0]).toHaveTextContent(/No Travel/)
    expect(screen.getByTestId('map')).toHaveAttribute('data-route', 'r2')

    const body = JSON.parse(String(fetch.mock.calls.find(([u]) => String(u).includes('/trips/plan'))![1]!.body))
    expect(body).toMatchObject({ origin: chicago, destination: denver, load_weight_lb: 42000, sample_interval_mi: 25 })
  })

  it('keeps cards, map, table and details panel in sync', async () => {
    api({ body: plan })
    renderWithClient(<App />)
    await planTrip()
    await screen.findByRole('region', { name: 'Recommendation' })

    // Select Route A via its card.
    const cards = within(screen.getByRole('list', { name: 'Route options' })).getAllByRole('button')
    await userEvent.click(cards[0])
    expect(cards[0]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('map')).toHaveAttribute('data-route', 'r1')
    expect(screen.getByRole('table', { name: /checkpoints along route a/i })).toBeInTheDocument()

    // Pick a No Travel checkpoint from the table: details explain the load rule.
    const routeA = plan.routes[0]
    const worst = routeA.checkpoints.find((c) => c.risk.level === 'NO_TRAVEL')!
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    await userEvent.click(rows[worst.seq])
    const panel = screen.getByRole('region', { name: 'Checkpoint details' })
    expect(panel).toHaveTextContent(`Checkpoint ${worst.seq}`)
    expect(panel).toHaveTextContent(/Wind \+ load rule: No Travel/)
    expect(panel).toHaveTextContent('42,000 lb load')
    expect(screen.getByTestId('map')).toHaveAttribute('data-seq', String(worst.seq))

    // Step through checkpoints and select one from the map.
    await userEvent.click(within(panel).getByRole('button', { name: /next/i }))
    expect(screen.getByTestId('map')).toHaveAttribute('data-seq', String(worst.seq + 1))
    await userEvent.click(screen.getByRole('button', { name: 'map checkpoint 1' }))
    expect(screen.getByRole('region', { name: 'Checkpoint details' })).toHaveTextContent('Checkpoint 1')

    // Switching routes clears the checkpoint selection.
    await userEvent.click(cards[2])
    expect(screen.queryByRole('region', { name: 'Checkpoint details' })).not.toBeInTheDocument()
  })

  it('shows checkpoints without a forecast as Unknown', async () => {
    api({ body: plan })
    renderWithClient(<App />)
    await planTrip()
    await screen.findByRole('region', { name: 'Recommendation' })

    const route = plan.routes[1]
    const unknown = route.checkpoints.find((c) => c.risk.level === 'UNKNOWN')!
    await userEvent.click(within(screen.getByRole('table')).getAllByRole('row')[unknown.seq + 1])

    expect(screen.getByRole('region', { name: 'Checkpoint details' })).toHaveTextContent(/no forecast is available/i)
    expect(screen.getAllByText('No forecast').length).toBeGreaterThan(0)
  })

  it('shows API errors without losing the form', async () => {
    api({ status: 504, body: { error: { code: 'UPSTREAM_TIMEOUT', message: 'An upstream service took too long.' } } })
    renderWithClient(<App />)
    await planTrip()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('An upstream service took too long.')
    expect(screen.getByRole('combobox', { name: /origin/i })).toHaveValue(chicago.label)
  })

  it('flattens server validation errors into a readable message', async () => {
    api({ status: 400, body: { error: { code: 'VALIDATION', message: 'x', fields: { departure_time: ['Departure must be within 13 days.'] } } } })
    renderWithClient(<App />)
    await planTrip()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Departure must be within 13 days.'))
  })

  it('flags when no route is confirmed safe', async () => {
    api({ body: { ...plan, recommendation: { ...plan.recommendation, all_routes_unsafe: true } } })
    renderWithClient(<App />)
    await planTrip()

    expect(await screen.findByText(/no route is confirmed safe/i)).toBeInTheDocument()
  })

  it('loads the corridor forecast after the plan with the same request', async () => {
    const fetch = api({ body: plan })
    renderWithClient(<App />)
    await planTrip()

    const panel = await screen.findByRole('region', { name: 'Weather forecast overlay' })
    expect(await within(panel).findByRole('slider', { name: /hours after departure/i })).toBeInTheDocument()
    const call = fetch.mock.calls.find(([u]) => String(u).includes('/trips/heatmap'))!
    expect(JSON.parse(String(call[1]!.body))).toEqual(plan.request)
  })
})
