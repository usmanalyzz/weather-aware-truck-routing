import type { ApiErrorBody, Heatmap, Place, TripPlan, TripRequest } from './types'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api').replace(/\/$/, '')

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fields?: Record<string, unknown>

  constructor(status: number, code: string, message: string, fields?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. It may be starting up — try again in a moment.')
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `Request failed (${response.status}).`,
      error?.fields,
    )
  }
  return body as T
}

export const api = {
  /** Fire-and-forget wake-up for free-tier hosts that sleep when idle. */
  wake: () => fetch(`${BASE_URL}/health`).catch(() => undefined),

  planTrip: (trip: TripRequest, signal?: AbortSignal) =>
    request<TripPlan>('/trips/plan', { method: 'POST', body: JSON.stringify(trip), signal }),

  heatmap: (trip: TripRequest, signal?: AbortSignal) =>
    request<Heatmap>('/trips/heatmap', { method: 'POST', body: JSON.stringify(trip), signal }),

  suggest: (q: string, signal?: AbortSignal) =>
    request<{ results: Place[] }>(`/geocode/suggest?q=${encodeURIComponent(q)}`, { signal }).then(
      (r) => r.results,
    ),
}
