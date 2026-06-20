// Shared, framework-agnostic constants for the AI recaps feed.
//
// This lives in a plain (non-`'use client'`) module on purpose: the value is
// imported by both the server component `app/recaps/page.tsx` and the client
// component `components/board-feed.tsx`. Importing a runtime *value* from a
// `'use client'` module into a Server Component yields a client-reference
// proxy (not the literal), which previously made the page compute
// `Date.now() - undefined` → `NaN` → `new Date(NaN).toISOString()` throwing
// `RangeError: Invalid time value`. Keep this constant here so both sides get
// the real number.

// Rolling window size for the recaps feed: 3 days in milliseconds.
export const RECAP_WINDOW_MS = 3 * 24 * 60 * 60 * 1000
