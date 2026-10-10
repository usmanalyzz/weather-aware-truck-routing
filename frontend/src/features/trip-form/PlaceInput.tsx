import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { api } from '../../api/client'
import type { Place } from '../../api/types'
import { useDebouncedValue } from '../../lib/useDebouncedValue'

interface PlaceInputProps {
  label: string
  value: Place | null
  onChange: (place: Place | null) => void
  error?: string
  placeholder?: string
}

/** Accessible combobox backed by the server-side HERE Autosuggest proxy. */
export function PlaceInput({ label, value, onChange, error, placeholder }: PlaceInputProps) {
  const id = useId()
  const listId = `${id}-list`
  const [text, setText] = useState(value?.label ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const query = useDebouncedValue(text.trim(), 250)

  const enabled = open && query.length >= 3 && query !== value?.label
  const { data: results = [], isFetching, isError } = useQuery({
    queryKey: ['suggest', query],
    queryFn: ({ signal }) => api.suggest(query, signal),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
  const showList = enabled && (results.length > 0 || isFetching || isError)

  function choose(place: Place) {
    onChange(place)
    setText(place.label)
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList || results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(results[Math.min(active, results.length - 1)])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold tracking-wide text-slate-600 uppercase">
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setActive(0)
          if (value) onChange(null)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? 'border-red-400' : 'border-slate-300'
        }`}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {isError && <li className="px-3 py-2 text-red-600">Address search is unavailable.</li>}
          {!isError && results.length === 0 && <li className="px-3 py-2 text-slate-500">Searching…</li>}
          {results.map((place, i) => (
            <li
              key={`${place.lat},${place.lon},${place.label}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(place)
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-blue-50 text-blue-900' : 'text-slate-800'}`}
            >
              {place.label}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
