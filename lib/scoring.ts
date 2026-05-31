import type { Stage } from './types'

export const STAGE_MULTIPLIERS: Record<Stage, number> = {
  group: 1,
  r32: 1.25,
  r16: 1.5,
  qf: 1.5,
  sf: 2,
  '3rd': 1.5,
  final: 3,
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function calcMatchPoints(odds: number, stage: Stage, isCorrect: boolean): number {
  if (!isCorrect) return 0
  return round4(odds * (STAGE_MULTIPLIERS[stage] ?? 1))
}

export function calcPicanteriaPoints(odds: number, isCorrect: boolean): number {
  if (!isCorrect) return 0
  return round4(odds)
}

export function calcPreTournamentWinnerPoints(
  odds: number,
  placement: 'winner' | 'runner-up' | 'other'
): number {
  if (placement === 'winner') return round4(odds * 1.5)
  if (placement === 'runner-up') return round4(odds * 0.75)
  return 0
}

export function calcTopScorerPoints(odds: number, isCorrect: boolean): number {
  if (!isCorrect) return 0
  return round4(odds)
}
