// Derived visibility for a match day under per-item publishing.
//
// With per-item publishing, match_days.published_at is no longer set by a single
// "publish day" action — it is a derived flag meaning "this day has at least one
// published match or pikanteria", so the day still appears in player lists. The
// publish/unpublish server actions call this to decide whether the day's
// published_at should be set or cleared after an item's state changes.

/** True when a day should be visible to players: it has >= 1 published item. */
export function shouldDayBeVisible(
  publishedMatchCount: number,
  publishedPikaCount: number,
): boolean {
  return publishedMatchCount + publishedPikaCount > 0
}
