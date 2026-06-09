const UTC_TIME_ZONE = 'UTC'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME_WITHOUT_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/

function asUtcDate(value: string | Date): Date {
  if (value instanceof Date) return value
  if (DATE_ONLY.test(value)) return new Date(`${value}T00:00:00Z`)
  if (DATE_TIME_WITHOUT_ZONE.test(value)) return new Date(`${value}Z`)
  return new Date(value)
}

export function utcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function formatUtcDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' },
): string {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: UTC_TIME_ZONE }).format(asUtcDate(value))
}

export function formatUtcTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false },
): string {
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: UTC_TIME_ZONE }).format(asUtcDate(value))
}

export function formatUtcDateTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short', hour12: false },
): string {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: UTC_TIME_ZONE }).format(asUtcDate(value))
}

export function utcDateTimeLocalToIso(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return asUtcDate(trimmed).toISOString()
}
