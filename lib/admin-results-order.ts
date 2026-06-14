type ResultsMatchDay = {
  date: string
}

export function orderResultsMatchDays<T extends ResultsMatchDay>(days: T[]): T[] {
  return days.toSorted((a, b) => b.date.localeCompare(a.date))
}
