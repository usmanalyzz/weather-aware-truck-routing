import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { mockFetch, renderWithClient } from '../../test/utils'
import { TripForm } from './TripForm'

const chicago = { label: 'Chicago, IL, United States', lat: 41.88, lon: -87.63 }
const denver = { label: 'Denver, CO, United States', lat: 39.74, lon: -104.99 }

describe('TripForm', () => {
  it('shows inline errors and does not submit an incomplete form', async () => {
    const onSubmit = vi.fn()
    renderWithClient(<TripForm onSubmit={onSubmit} submitting={false} />)

    await userEvent.clear(screen.getByLabelText(/load weight/i))
    await userEvent.click(screen.getByRole('button', { name: /plan routes/i }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/choose an origin/i)).toBeInTheDocument()
    expect(screen.getByText(/choose a destination/i)).toBeInTheDocument()
    expect(screen.getByText(/enter the load weight/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/load weight/i)).toHaveAttribute('aria-invalid', 'true')
  })

  it('picks places from suggestions (mouse and keyboard) and submits the API payload', async () => {
    const fetch = mockFetch((url) => ({
      body: { results: url.includes('q=Chic') ? [chicago] : [denver, { ...denver, label: 'Denver City, TX' }] },
    }))
    const onSubmit = vi.fn()
    renderWithClient(<TripForm onSubmit={onSubmit} submitting={false} />)

    await userEvent.type(screen.getByRole('combobox', { name: /origin/i }), 'Chic')
    await userEvent.click(await screen.findByRole('option', { name: chicago.label }))

    const destination = screen.getByRole('combobox', { name: /destination/i })
    await userEvent.type(destination, 'Denv')
    await screen.findByRole('option', { name: 'Denver City, TX' })
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{Enter}')
    expect(destination).toHaveValue(denver.label)

    await userEvent.click(screen.getByRole('radio', { name: '10 mi' }))
    await userEvent.click(screen.getByRole('button', { name: /plan routes/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ origin: chicago, destination: denver, load_weight_lb: 42000, sample_interval_mi: 10 }),
    )
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/geocode/suggest?q=Chic'))).toBe(true)
  })

  it('clears a chosen place when the text is edited', async () => {
    mockFetch(() => ({ body: { results: [chicago] } }))
    const onSubmit = vi.fn()
    renderWithClient(<TripForm onSubmit={onSubmit} submitting={false} />)
    const origin = screen.getByRole('combobox', { name: /origin/i })

    await userEvent.type(origin, 'Chic')
    await userEvent.click(await screen.findByRole('option', { name: chicago.label }))
    await userEvent.type(origin, 'x')
    await userEvent.click(screen.getByRole('button', { name: /plan routes/i }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/choose an origin/i)).toBeInTheDocument()
  })

  it('reports an unavailable address search', async () => {
    mockFetch(() => ({ status: 502, body: { error: { code: 'GEOCODING_UNAVAILABLE', message: 'x' } } }))
    renderWithClient(<TripForm onSubmit={vi.fn()} submitting={false} />)

    await userEvent.type(screen.getByRole('combobox', { name: /origin/i }), 'Chicago')

    await waitFor(() => expect(screen.getByText(/address search is unavailable/i)).toBeInTheDocument())
  })

  it('disables the button while submitting', () => {
    renderWithClient(<TripForm onSubmit={vi.fn()} submitting />)
    expect(screen.getByRole('button', { name: /planning routes/i })).toBeDisabled()
  })
})
