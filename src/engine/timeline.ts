import type { Workout } from '../types'

export type SegmentKind = 'prepare' | 'work' | 'rest' | 'roundRest'

export interface Segment {
  kind: SegmentKind
  durationSec: number
  /** Exercício sendo executado. Só existe em 'work'. */
  exerciseId: string | undefined
  /** Exercício que vem a seguir. Existe em tudo que não é o último segmento. */
  nextExerciseId: string | undefined
  /** Volta a que o segmento pertence, contando de 1. */
  round: number
  /** Posição do exercício dentro da volta, contando de 1. Zero na preparação. */
  indexInRound: number
}

/**
 * Gera a sequência inteira do treino de uma vez.
 *
 * Duas regras definem o formato e valem a pena ser lidas com atenção, porque
 * são elas que produzem o comportamento observável: não existe intervalo
 * depois do último exercício de uma volta — ali entra o descanso entre voltas
 * — e não existe descanso depois da última volta, porque o treino acabou.
 */
export function buildTimeline(workout: Workout): Segment[] {
  const { exerciseIds, rounds, prepareSec, workSec, restSec, roundRestSec } = workout
  const segments: Segment[] = []

  if (exerciseIds.length === 0 || rounds < 1) return segments

  const first = exerciseIds[0] as string

  if (prepareSec > 0) {
    segments.push({
      kind: 'prepare',
      durationSec: prepareSec,
      exerciseId: undefined,
      nextExerciseId: first,
      round: 1,
      indexInRound: 0,
    })
  }

  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < exerciseIds.length; i++) {
      const current = exerciseIds[i] as string
      const isLastOfRound = i === exerciseIds.length - 1
      const isLastRound = round === rounds
      const upcoming = isLastOfRound
        ? isLastRound
          ? undefined
          : first
        : (exerciseIds[i + 1] as string)

      segments.push({
        kind: 'work',
        durationSec: workSec,
        exerciseId: current,
        nextExerciseId: upcoming,
        round,
        indexInRound: i + 1,
      })

      if (!isLastOfRound && restSec > 0) {
        segments.push({
          kind: 'rest',
          durationSec: restSec,
          exerciseId: undefined,
          nextExerciseId: upcoming,
          round,
          indexInRound: i + 1,
        })
      }
    }

    if (round < rounds && roundRestSec > 0) {
      segments.push({
        kind: 'roundRest',
        durationSec: roundRestSec,
        exerciseId: undefined,
        nextExerciseId: first,
        round,
        indexInRound: exerciseIds.length,
      })
    }
  }

  return segments
}

export function totalDurationSec(segments: readonly Segment[]): number {
  return segments.reduce((sum, s) => sum + s.durationSec, 0)
}

/** Duração total do treino, usada no editor e na lista. */
export function workoutDurationSec(workout: Workout): number {
  return totalDurationSec(buildTimeline(workout))
}

export function formatDuration(totalSec: number): string {
  const min = Math.floor(totalSec / 60)
  const sec = Math.round(totalSec % 60)
  if (min === 0) return `${sec} s`
  if (sec === 0) return `${min} min`
  return `${min} min ${sec} s`
}
