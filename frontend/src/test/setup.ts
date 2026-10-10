import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// MapLibre creates its web worker from a blob URL at import time; jsdom has no such API.
if (!('createObjectURL' in URL)) {
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:jsdom', writable: true })
}

afterEach(() => cleanup())
