const APP_TIME_ZONE = 'Asia/Jerusalem'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME_WITHOUT_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/
const DEFAULT_APP_DATE_OPTIONS: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
const DEFAULT_APP_TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }
const DEFAULT_APP_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short', hour12: false }
const APP_FORMATTERS = new Map<string, Intl.DateTimeFormat>()
const TIME_ZONE_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

type DateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function timeZoneParts(date: Date): DateTimeParts {
  const values = TIME_ZONE_PARTS_FORMATTER.formatToParts(date)

  const parts = Object.fromEntries(values.map((part) => [part.type, part.value]))
  const hour = Number(parts.hour)

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

function timeZoneOffsetMs(date: Date): number {
  const parts = timeZoneParts(date)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - date.getTime()
}

function parseDateTimeLocal(value: string): DateTimeParts & { millisecond: number } {
  const [datePart, timePart = '00:00'] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour = 0, minute = 0, secondPart = '0'] = timePart.split(':')
  const [second = '0', millisecond = '0'] = secondPart.split('.')

  return {
    year,
    month,
    day,
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
    millisecond: Number(millisecond.padEnd(3, '0').slice(0, 3)),
  }
}

function appDateTimeLocalToDate(value: string): Date {
  const parts = parseDateTimeLocal(value)
  const utcGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond),
  )
  const offset = timeZoneOffsetMs(utcGuess)
  const candidate = new Date(utcGuess.getTime() - offset)
  const candidateOffset = timeZoneOffsetMs(candidate)

  return new Date(utcGuess.getTime() - candidateOffset)
}

function asAppDate(value: string | Date): Date {
  if (value instanceof Date) return value
  if (DATE_ONLY.test(value)) return appDateTimeLocalToDate(`${value}T00:00`)
  if (DATE_TIME_WITHOUT_ZONE.test(value)) return appDateTimeLocalToDate(value)
  return new Date(value)
}

function appDateParts(value: string | Date): DateTimeParts {
  return timeZoneParts(asAppDate(value))
}

function getAppFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const formatterOptions = { ...options, timeZone: APP_TIME_ZONE }
  const key = `${locale}:${JSON.stringify(formatterOptions)}`
  const cached = APP_FORMATTERS.get(key)
  if (cached) return cached

  const formatter = Intl.DateTimeFormat(locale, formatterOptions)
  APP_FORMATTERS.set(key, formatter)
  return formatter
}

export function appDateKey(now: Date = new Date()): string {
  const parts = appDateParts(now)
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-')
}

export function formatAppDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = DEFAULT_APP_DATE_OPTIONS,
): string {
  return getAppFormatter('en-US', options).format(asAppDate(value))
}

export function formatAppTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = DEFAULT_APP_TIME_OPTIONS,
): string {
  return getAppFormatter('en-GB', options).format(asAppDate(value))
}

export function formatAppDateTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = DEFAULT_APP_DATE_TIME_OPTIONS,
): string {
  return getAppFormatter('en-US', options).format(asAppDate(value))
}

export function appDateTimeLocalToIso(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return appDateTimeLocalToDate(trimmed).toISOString()
}
