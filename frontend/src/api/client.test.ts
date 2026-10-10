import { describe, expect, it, vi } from 'vitest'
import { mockFetch, plan } from '../test/utils'
import { ApiError, api } from './client'

describe('api client', () => {
  it('posts the trip and returns the plan', async () => {
    const fetch = mockFetch(() => ({ body: plan }))
    const result = await api.planTrip(plan.request)
    expect(result.trip_id).toBe(plan.trip_id)
    const [url, init] = fetch.mock.calls[0]
    expect(String(url)).toMatch(/\/trips\/plan$/)
    expect(init?.method).toBe('POST')
  })

  it('raises ApiError with the server envelope', async () => {
    mockFetch(() => ({ status: 422, body: { error: { code: 'NO_ROUTE', message: 'No truck route was found.' } } }))
    await expect(api.planTrip(plan.request)).rejects.toMatchObject({ code: 'NO_ROUTE', status: 422, message: 'No truck route was found.' })
  })

  it('handles non-JSON errors and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })))
    await expect(api.heatmap(plan.request)).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 502 })

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const error = await api.suggest('chicago').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('NETWORK')
    expect(error.message).toMatch(/starting up/)
  })

  it('encodes suggest queries', async () => {
    const fetch = mockFetch(() => ({ body: { results: [] } }))
    await api.suggest('St. Louis & co')
    expect(String(fetch.mock.calls[0][0])).toContain('q=St.%20Louis%20%26%20co')
  })
})
