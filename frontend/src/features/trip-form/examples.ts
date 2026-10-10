import type { SampleInterval } from '../../api/types'

const place = (label: string, lat: number, lon: number) => ({ label, lat, lon })

/** One-click demo trips so reviewers can see the whole app without typing addresses. */
export const EXAMPLE_TRIPS = [
  {
    name: 'Chicago → Denver',
    origin: place('Chicago, IL, United States', 41.8781, -87.6298),
    destination: place('Denver, CO, United States', 39.7392, -104.9903),
    loadWeight: '42000',
    interval: 25 as SampleInterval,
  },
  {
    name: 'Dallas → Atlanta',
    origin: place('Dallas, TX, United States', 32.7767, -96.797),
    destination: place('Atlanta, GA, United States', 33.749, -84.388),
    loadWeight: '30000',
    interval: 25 as SampleInterval,
  },
  {
    name: 'Denver → Salt Lake City',
    origin: place('Denver, CO, United States', 39.7392, -104.9903),
    destination: place('Salt Lake City, UT, United States', 40.7608, -111.891),
    loadWeight: '42000',
    interval: 10 as SampleInterval,
  },
]
