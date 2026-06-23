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

type AdminPickDay<
  TMatch extends PublishedMatchItem,
  TPikanteria extends PublishedPikanteriaItem,
> = {
  matches?: TMatch[] | null
  pikanteria?: TPikanteria[] | null
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

export function filterAdminPickDays<
  TMatch extends PublishedMatchItem,
  TPikanteria extends PublishedPikanteriaItem,
  TDay extends AdminPickDay<TMatch, TPikanteria>,
>(matchDays: TDay[]): Array<{ day: TDay; openMatches: TMatch[]; openPikanteria: TPikanteria[] }> {
  const result = []
  for (const day of matchDays) {
    const openMatches = (day.matches ?? [])
      .filter(match => match.published_at != null && match.result == null)
      .toSorted((a, b) => sortTime(a.kickoff_time) - sortTime(b.kickoff_time))
    const openPikanteria = (day.pikanteria ?? [])
      .filter(item => item.published_at != null && item.result == null)
      .toSorted((a, b) => sortTime(a.kickoff_time) - sortTime(b.kickoff_time))
    if (openMatches.length > 0 || openPikanteria.length > 0) {
      result.push({ day, openMatches, openPikanteria })
    }
  }
  return result
}
