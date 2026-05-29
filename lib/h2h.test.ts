import { describe, it, expect } from 'vitest'
import { buildH2H, pickAgreement, roundWinner, type H2HMatch, type H2HRound } from './h2h'

const ME = 'me-id'
const THEM = 'them-id'

/** Helper to build a scored match item. */
function match(
  id: string,
  mine: { pick: string | null; points?: number; correct?: boolean | null },
  theirs: { pick: string | null; points?: number; correct?: boolean | null; hidden?: boolean },
  resolved = true,
): H2HMatch {
  return {
    id,
    resolved,
    mine: { pick: mine.pick, points: mine.points ?? 0, correct: mine.correct ?? null },
    theirs: {
      pick: theirs.pick,
      points: theirs.points ?? 0,
      correct: theirs.correct ?? null,
      hidden: theirs.hidden,
    },
  }
}

describe('pickAgreement', () => {
  it('agree when both pick the same', () => {
    expect(pickAgreement('1', '1')).toBe('agree')
  })
  it('differ when both pick differently', () => {
    expect(pickAgreement('1', '2')).toBe('differ')
  })
  it('unknown when opponent pick is missing', () => {
    expect(pickAgreement('1', null)).toBe('unknown')
  })
  it('unknown when my pick is missing', () => {
    expect(pickAgreement(null, '1')).toBe('unknown')
  })
  it('unknown when opponent pick is hidden (even if a value is present)', () => {
    expect(pickAgreement('1', '1', true)).toBe('unknown')
  })
})

describe('roundWinner', () => {
  it('me when my points are higher', () => {
    expect(roundWinner(5, 2, [match('a', { pick: '1', points: 5 }, { pick: '2' })])).toBe('me')
  })
  it('them when their points are higher', () => {
    expect(roundWinner(1, 4, [match('a', { pick: '1' }, { pick: '2', points: 4 })])).toBe('them')
  })
  it('tie when equal and both scored points', () => {
    expect(roundWinner(3, 3, [match('a', { pick: '1', points: 3 }, { pick: '1', points: 3 })])).toBe('tie')
  })
  it('pending when equal-and-zero with an unresolved item', () => {
    expect(roundWinner(0, 0, [match('a', { pick: '1' }, { pick: '2' }, false)])).toBe('pending')
  })
  it('tie when equal-and-zero but all items resolved (genuine 0-0)', () => {
    expect(roundWinner(0, 0, [match('a', { pick: '1' }, { pick: '2' }, true)])).toBe('tie')
  })
})

describe('buildH2H — rivalry record', () => {
  const rounds: H2HRound[] = [
    // Round 1: I win
    { matchDayId: 'd1', items: [match('m1', { pick: '1', points: 4 }, { pick: '2', points: 0 })] },
    // Round 2: they win
    { matchDayId: 'd2', items: [match('m2', { pick: 'X', points: 0 }, { pick: '1', points: 3 })] },
    // Round 3: tie (both scored equal)
    { matchDayId: 'd3', items: [match('m3', { pick: '1', points: 2 }, { pick: '1', points: 2 })] },
    // Round 4: pending (unresolved, 0-0)
    { matchDayId: 'd4', items: [match('m4', { pick: '1' }, { pick: '2' }, false)] },
  ]

  it('counts rounds won per side, ignoring pending', () => {
    const { summary } = buildH2H(rounds, ME, THEM)
    expect(summary.roundsWon).toEqual({ me: 1, them: 1, tie: 1 })
  })

  it('computes per-side totals', () => {
    const { summary } = buildH2H(rounds, ME, THEM)
    expect(summary.myTotal).toBe(6) // 4 + 0 + 2 + 0
    expect(summary.theirTotal).toBe(5) // 0 + 3 + 2 + 0
  })

  it('flags each round winner', () => {
    const { rounds: rr } = buildH2H(rounds, ME, THEM)
    expect(rr.map(r => r.winner)).toEqual(['me', 'them', 'tie', 'pending'])
  })
})

describe('buildH2H — agreement counting', () => {
  it('counts agreements and disagreements, excluding hidden/missing', () => {
    const rounds: H2HRound[] = [
      {
        matchDayId: 'd1',
        items: [
          match('a', { pick: '1' }, { pick: '1' }),            // agree
          match('b', { pick: '1' }, { pick: '2' }),            // differ
          match('c', { pick: '1' }, { pick: null, hidden: true }), // hidden → excluded
          match('d', { pick: '1' }, { pick: null }),           // missing → excluded
          match('e', { pick: null }, { pick: '2' }),           // my missing → excluded
        ],
      },
    ]
    const { summary } = buildH2H(rounds, ME, THEM)
    expect(summary.agreements).toBe(1)
    expect(summary.disagreements).toBe(1)
    expect(summary.agreementRate).toBe(50)
  })

  it('agreementRate is 0 when nothing is comparable', () => {
    const rounds: H2HRound[] = [
      { matchDayId: 'd1', items: [match('a', { pick: '1' }, { pick: null, hidden: true })] },
    ]
    const { summary } = buildH2H(rounds, ME, THEM)
    expect(summary.agreements).toBe(0)
    expect(summary.disagreements).toBe(0)
    expect(summary.agreementRate).toBe(0)
  })
})

describe('buildH2H — edge cases', () => {
  it('no rounds at all → 0-0 record, 0 totals', () => {
    const { summary, rounds } = buildH2H([], ME, THEM)
    expect(rounds).toEqual([])
    expect(summary.roundsWon).toEqual({ me: 0, them: 0, tie: 0 })
    expect(summary.myTotal).toBe(0)
    expect(summary.theirTotal).toBe(0)
    expect(summary.agreementRate).toBe(0)
  })

  it('opponent with no predictions: I win scored rounds, theirs stays 0', () => {
    const rounds: H2HRound[] = [
      { matchDayId: 'd1', items: [match('a', { pick: '1', points: 3 }, { pick: null })] },
    ]
    const { summary } = buildH2H(rounds, ME, THEM)
    expect(summary.roundsWon).toEqual({ me: 1, them: 0, tie: 0 })
    expect(summary.theirTotal).toBe(0)
  })

  it('exact tie totals across rounds (DEAD HEAT scenario)', () => {
    const rounds: H2HRound[] = [
      { matchDayId: 'd1', items: [match('a', { pick: '1', points: 4 }, { pick: '2', points: 0 })] },
      { matchDayId: 'd2', items: [match('b', { pick: 'X', points: 0 }, { pick: '1', points: 4 })] },
    ]
    const { summary } = buildH2H(rounds, ME, THEM)
    expect(summary.myTotal).toBe(summary.theirTotal)
    expect(summary.myTotal).toBe(4)
  })

  it('comparing vs a marker passes string picks through with no special math', () => {
    const rounds: H2HRound[] = [
      { matchDayId: 'd1', items: [match('a', { pick: '1', points: 2.5 }, { pick: '1', points: 2.5 })] },
    ]
    const { summary } = buildH2H(rounds, ME, 'marker-id')
    expect(summary.agreements).toBe(1)
    expect(summary.roundsWon.tie).toBe(1)
  })

  it('handles pikanteria option-id strings as picks', () => {
    const rounds: H2HRound[] = [
      { matchDayId: 'd1', items: [match('pik', { pick: 'opt-1', points: 1.6 }, { pick: 'opt-1', points: 1.6 })] },
    ]
    const { summary } = buildH2H(rounds, ME, THEM)
    expect(summary.agreements).toBe(1)
  })

  it('float drift in summed points is rounded to 2dp', () => {
    const rounds: H2HRound[] = [
      {
        matchDayId: 'd1',
        items: [
          match('a', { pick: '1', points: 0.1 }, { pick: '2' }),
          match('b', { pick: '1', points: 0.2 }, { pick: '2' }),
        ],
      },
    ]
    const { rounds: rr } = buildH2H(rounds, ME, THEM)
    expect(rr[0].myPoints).toBe(0.3)
  })
})
