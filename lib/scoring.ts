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

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calcMatchPoints(odds: number, stage: Stage, isCorrect: boolean): number {
  if (!isCorrect) return 0
  return round2(odds * (STAGE_MULTIPLIERS[stage] ?? 1))
}

export function calcPicanteriaPoints(odds: number, isCorrect: boolean): number {
  if (!isCorrect) return 0
  return round2(odds)
}

export function calcPreTournamentWinnerPoints(
  odds: number,
  placement: 'winner' | 'runner-up' | 'other'
): number {
  if (placement === 'winner') return round2(odds * 1.5)
  if (placement === 'runner-up') return odds * 0.75
  return 0
}

export function calcTopScorerPoints(odds: number, isCorrect: boolean): number {
  if (!isCorrect) return 0
  return round2(odds)
}
