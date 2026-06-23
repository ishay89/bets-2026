export type AdminPickTargetUser = {
  id: string
  display_name: string
  email: string | null
  status: 'pending' | 'approved' | 'blocked'
  is_monkey: boolean | null
}

type PublishedMatchItem = {
  id: string
  published_at: string | null
  result: string | null
  kickoff_time: string
}

type PublishedPikanteriaItem = {
  id: string
  published_at: string | null
  result: string | null
  kickoff_time?: string | null
}

type AdminPickDay = {
  matches?: readonly PublishedMatchItem[] | null
  pikanteria?: readonly PublishedPikanteriaItem[] | null
}

export function canAdminPickForUser(user: AdminPickTargetUser): boolean {
  return user.status === 'approved' && user.is_monkey !== true
}

export function adminPickTargetUsers<T extends AdminPickTargetUser>(users: T[]): T[] {
  return users.filter(canAdminPickForUser)
}

export function selectAdminPickTargetUser<T extends AdminPickTargetUser>(
  users: T[],
  requestedUserId: string | undefined,
): T | null {
  const targets = adminPickTargetUsers(users)
  return targets.find(user => user.id === requestedUserId) ?? targets[0] ?? null
}

function sortTime(value: string | null | undefined): number {
  const time = Date.parse(value ?? '')
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER
}

type DayMatch<TDay extends AdminPickDay> = NonNullable<TDay['matches']>[number]
type DayPikanteria<TDay extends AdminPickDay> = NonNullable<TDay['pikanteria']>[number]

export function filterAdminPickDays<TDay extends AdminPickDay>(
  matchDays: readonly TDay[],
): Array<{ day: TDay; openMatches: DayMatch<TDay>[]; openPikanteria: DayPikanteria<TDay>[] }> {
  const result: Array<{ day: TDay; openMatches: DayMatch<TDay>[]; openPikanteria: DayPikanteria<TDay>[] }> = []
  for (const day of matchDays) {
    const matches = (day.matches ?? []) as DayMatch<TDay>[]
    const pikanteria = (day.pikanteria ?? []) as DayPikanteria<TDay>[]
    const openMatches = matches
      .filter(match => match.published_at != null && match.result == null)
      .toSorted((a, b) => sortTime(a.kickoff_time) - sortTime(b.kickoff_time))
    const openPikanteria = pikanteria
      .filter(item => item.published_at != null && item.result == null)
      .toSorted((a, b) => sortTime(a.kickoff_time) - sortTime(b.kickoff_time))
    if (openMatches.length > 0 || openPikanteria.length > 0) {
      result.push({ day, openMatches, openPikanteria })
    }
  }
  return result
}
