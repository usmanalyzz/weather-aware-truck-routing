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
            className={`w-full rounded-xl border bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/15 ${
              errors.departure ? 'border-red-400' : 'border-slate-200'
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
            className={`w-full rounded-xl border bg-white/90 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/15 ${
              errors.loadWeight ? 'border-red-400' : 'border-slate-200'
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
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 shadow-inner">
          {INTERVALS.map((mi) => (
            <label
              key={mi}
              className={`cursor-pointer rounded-lg py-1.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${
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
        className="w-full rounded-xl bg-gradient-to-b from-blue-500 to-indigo-600 px-4 py-3 text-sm font-bold tracking-wide text-white shadow-[0_4px_0_0_#312e81,0_14px_28px_-12px_rgb(79_70_229/0.8)] transition-all hover:brightness-110 active:translate-y-[3px] active:shadow-[0_1px_0_0_#312e81,0_6px_14px_-8px_rgb(79_70_229/0.7)] focus-visible:ring-4 focus-visible:ring-blue-500/30 focus-visible:outline-none disabled:cursor-wait disabled:opacity-80"
      >
        {submitting ? 'Planning routes…' : 'Plan routes'}
      </button>
    </form>
  )
}
