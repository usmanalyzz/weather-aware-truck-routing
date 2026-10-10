import { useState } from 'react'
import type { SampleInterval, TripRequest } from '../../api/types'
import { nextHour, toLocalInputValue } from '../../lib/format'
import { PlaceInput } from './PlaceInput'
import { type TripFormErrors, type TripFormValues, MAX_LOAD_LB, toTripRequest, validateTrip } from './validation'

const INTERVALS: SampleInterval[] = [10, 25, 50]

interface TripFormProps {
  onSubmit: (trip: TripRequest) => void
  submitting: boolean
  initial?: Partial<TripFormValues>
}

export function TripForm({ onSubmit, submitting, initial }: TripFormProps) {
  const [values, setValues] = useState<TripFormValues>(() => ({
    origin: null,
    destination: null,
    departure: toLocalInputValue(nextHour()),
    loadWeight: '42000',
    interval: 25,
    ...initial,
  }))
  const [errors, setErrors] = useState<TripFormErrors>({})
  const [touched, setTouched] = useState(false)

  function update<K extends keyof TripFormValues>(key: K, value: TripFormValues[K]) {
    const next = { ...values, [key]: value }
    setValues(next)
    if (touched) setErrors(validateTrip(next))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    const found = validateTrip(values)
    setErrors(found)
    if (Object.keys(found).length === 0) onSubmit(toTripRequest(values))
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3" aria-label="Plan a trip">
      <PlaceInput
        label="Origin"
        placeholder="City or address, e.g. Chicago, IL"
        value={values.origin}
        onChange={(p) => update('origin', p)}
        error={errors.origin}
      />
      <PlaceInput
        label="Destination"
        placeholder="City or address, e.g. Denver, CO"
        value={values.destination}
        onChange={(p) => update('destination', p)}
        error={errors.destination}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="departure" className="mb-1 block text-xs font-semibold tracking-wide text-slate-600 uppercase">
            Departure
          </label>
          <input
            id="departure"
            type="datetime-local"
            value={values.departure}
            onChange={(e) => update('departure', e.target.value)}
            aria-invalid={Boolean(errors.departure)}
            aria-describedby={errors.departure ? 'departure-error' : undefined}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.departure ? 'border-red-400' : 'border-slate-300'
            }`}
          />
          {errors.departure && (
            <p id="departure-error" className="mt-1 text-xs text-red-600">
              {errors.departure}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="load" className="mb-1 block text-xs font-semibold tracking-wide text-slate-600 uppercase">
            Load weight (lb)
          </label>
          <input
            id="load"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_LOAD_LB}
            step={500}
            value={values.loadWeight}
            onChange={(e) => update('loadWeight', e.target.value)}
            aria-invalid={Boolean(errors.loadWeight)}
            aria-describedby={errors.loadWeight ? 'load-error' : 'load-hint'}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.loadWeight ? 'border-red-400' : 'border-slate-300'
            }`}
          />
          {errors.loadWeight ? (
            <p id="load-error" className="mt-1 text-xs text-red-600">
              {errors.loadWeight}
            </p>
          ) : (
            <p id="load-hint" className="mt-1 text-xs text-slate-500">
              Load rules apply above 30,000 and 40,000 lb.
            </p>
          )}
        </div>
      </div>

      <fieldset>
        <legend className="mb-1 block text-xs font-semibold tracking-wide text-slate-600 uppercase">
          Weather checkpoint every
        </legend>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
          {INTERVALS.map((mi) => (
            <label
              key={mi}
              className={`cursor-pointer rounded-md py-1.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
                values.interval === mi ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <input
                type="radio"
                name="interval"
                value={mi}
                checked={values.interval === mi}
                onChange={() => update('interval', mi)}
                className="sr-only"
              />
              {mi} mi
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-70"
      >
        {submitting ? 'Planning routes…' : 'Plan routes'}
      </button>
    </form>
  )
}
