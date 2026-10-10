import type { RiskLevel } from '../api/types'

export const RISK_LEVELS: Exclude<RiskLevel, 'UNKNOWN'>[] = ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL']

// Ordered, colour-blind-aware ramp: lightness falls as risk rises, so levels stay distinguishable in greyscale.
export const RISK_COLORS: Record<RiskLevel, string> = {
  LOW: '#3a9d5d',
  MODERATE: '#e6b422',
  HIGH: '#f07d22',
  SEVERE: '#d1352b',
  NO_TRAVEL: '#5b1a6e',
  UNKNOWN: '#9aa3ad',
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  HIGH: 'High',
  SEVERE: 'Severe',
  NO_TRAVEL: 'No Travel',
  UNKNOWN: 'Unknown',
}

export const FACTOR_LABELS = {
  wind: 'Wind',
  rain: 'Rain',
  snow: 'Snow',
  load: 'Wind + load rule',
} as const

/** Light text on dark risk colours, dark text on light ones. */
export function riskTextColor(level: RiskLevel): string {
  return level === 'MODERATE' || level === 'UNKNOWN' ? '#1f2328' : '#ffffff'
}

export const ROUTE_COLORS = ['#2563eb', '#7c3aed', '#0d9488'] as const

export function routeColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length]
}
