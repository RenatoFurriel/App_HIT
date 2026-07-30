import { describe, it, expect } from 'vitest'
import { buildTimeline, totalDurationSec, formatDuration } from './timeline'
import type { Workout } from '../types'

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'w1',
    name: 'Teste',
    exerciseIds: ['a', 'b'],
    prepareSec: 10,
    workSec: 40,
    restSec: 20,
    rounds: 2,
    roundRestSec: 60,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('buildTimeline', () => {
  it('abre com a preparação e segue a ordem dos exercícios', () => {
    const segments = buildTimeline(makeWorkout())
    expect(segments.map((s) => s.kind)).toEqual([
      'prepare',
      'work',
      'rest',
      'work',
      'roundRest',
      'work',
      'rest',
      'work',
    ])
    expect(segments.filter((s) => s.kind === 'work').map((s) => s.exerciseId)).toEqual([
      'a',
      'b',
      'a',
      'b',
    ])
  })

  it('não coloca intervalo depois do último exercício da volta', () => {
    const segments = buildTimeline(makeWorkout())
    const firstRoundRestIndex = segments.findIndex((s) => s.kind === 'roundRest')
    expect(segments[firstRoundRestIndex - 1]?.kind).toBe('work')
  })

  it('não coloca descanso de volta depois da última volta', () => {
    const segments = buildTimeline(makeWorkout())
    expect(segments.at(-1)?.kind).toBe('work')
    expect(segments.filter((s) => s.kind === 'roundRest')).toHaveLength(1)
  })

  it('omite o descanso entre voltas quando ele é zero', () => {
    const segments = buildTimeline(makeWorkout({ roundRestSec: 0 }))
    expect(segments.some((s) => s.kind === 'roundRest')).toBe(false)
  })

  it('omite a preparação quando ela é zero', () => {
    const segments = buildTimeline(makeWorkout({ prepareSec: 0 }))
    expect(segments[0]?.kind).toBe('work')
  })

  it('omite os intervalos quando eles são zero', () => {
    const segments = buildTimeline(makeWorkout({ restSec: 0 }))
    expect(segments.some((s) => s.kind === 'rest')).toBe(false)
  })

  it('lida com um exercício e uma volta', () => {
    const segments = buildTimeline(
      makeWorkout({ exerciseIds: ['a'], rounds: 1, prepareSec: 0 }),
    )
    expect(segments).toHaveLength(1)
    expect(segments[0]?.kind).toBe('work')
    expect(segments[0]?.nextExerciseId).toBeUndefined()
  })

  it('devolve lista vazia sem exercícios', () => {
    expect(buildTimeline(makeWorkout({ exerciseIds: [] }))).toEqual([])
  })

  it('aponta o próximo exercício durante o intervalo', () => {
    const segments = buildTimeline(makeWorkout())
    const rest = segments.find((s) => s.kind === 'rest')
    expect(rest?.nextExerciseId).toBe('b')
  })

  it('aponta o primeiro exercício durante o descanso entre voltas', () => {
    const segments = buildTimeline(makeWorkout())
    expect(segments.find((s) => s.kind === 'roundRest')?.nextExerciseId).toBe('a')
  })

  it('numera as voltas a partir de um', () => {
    const segments = buildTimeline(makeWorkout())
    const works = segments.filter((s) => s.kind === 'work')
    expect(works.map((s) => s.round)).toEqual([1, 1, 2, 2])
    expect(works.map((s) => s.indexInRound)).toEqual([1, 2, 1, 2])
  })
})

describe('totalDurationSec', () => {
  it('soma a sequência inteira', () => {
    // 10 preparação + (40+20+40) + 60 entre voltas + (40+20+40)
    expect(totalDurationSec(buildTimeline(makeWorkout()))).toBe(270)
  })

  it('cai para zero sem exercícios', () => {
    expect(totalDurationSec(buildTimeline(makeWorkout({ exerciseIds: [] })))).toBe(0)
  })
})

describe('formatDuration', () => {
  it('formata os três casos', () => {
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(120)).toBe('2 min')
    expect(formatDuration(270)).toBe('4 min 30 s')
  })
})
