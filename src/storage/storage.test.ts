import { describe, it, expect } from 'vitest'
import { createStorage, newWorkoutId, type KeyValueStore } from './index'
import { DEFAULT_SETTINGS, type Workout } from '../types'

function fakeStore(seed: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'w1',
    name: 'Segunda pesada',
    exerciseIds: ['polichinelo', 'agachamento'],
    prepareSec: 10,
    workSec: 40,
    restSec: 20,
    rounds: 3,
    roundRestSec: 60,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('treinos', () => {
  it('grava e lê de volta sem perder nada', () => {
    const storage = createStorage(fakeStore())
    const workout = makeWorkout()
    storage.upsertWorkout(workout)
    expect(storage.getWorkout('w1')).toEqual(workout)
  })

  it('devolve lista vazia quando não há nada gravado', () => {
    expect(createStorage(fakeStore()).loadWorkouts()).toEqual([])
  })

  it('devolve lista vazia diante de dado corrompido', () => {
    const storage = createStorage(fakeStore({ 'hiit.workouts.v1': 'isto não é json{' }))
    expect(storage.loadWorkouts()).toEqual([])
  })

  it('descarta o registro inválido e mantém os válidos', () => {
    const store = fakeStore({
      'hiit.workouts.v1': JSON.stringify([makeWorkout(), { id: 'quebrado' }, null]),
    })
    const workouts = createStorage(store).loadWorkouts()
    expect(workouts).toHaveLength(1)
    expect(workouts[0]?.id).toBe('w1')
  })

  it('atualiza no lugar em vez de duplicar', () => {
    const storage = createStorage(fakeStore())
    storage.upsertWorkout(makeWorkout())
    storage.upsertWorkout(makeWorkout({ name: 'Outro nome', updatedAt: 2 }))
    const workouts = storage.loadWorkouts()
    expect(workouts).toHaveLength(1)
    expect(workouts[0]?.name).toBe('Outro nome')
  })

  it('lista os mais recentes primeiro', () => {
    const storage = createStorage(fakeStore())
    storage.upsertWorkout(makeWorkout({ id: 'antigo', updatedAt: 1 }))
    storage.upsertWorkout(makeWorkout({ id: 'novo', updatedAt: 9 }))
    expect(storage.loadWorkouts().map((w) => w.id)).toEqual(['novo', 'antigo'])
  })

  it('apaga', () => {
    const storage = createStorage(fakeStore())
    storage.upsertWorkout(makeWorkout())
    storage.deleteWorkout('w1')
    expect(storage.loadWorkouts()).toEqual([])
  })

  it('corrige números fora da faixa em vez de rejeitar o treino', () => {
    const store = fakeStore({
      'hiit.workouts.v1': JSON.stringify([
        makeWorkout({ rounds: 0, workSec: -5, restSec: -1 }),
      ]),
    })
    const workout = createStorage(store).loadWorkouts()[0]
    expect(workout?.rounds).toBe(1)
    expect(workout?.workSec).toBe(1)
    expect(workout?.restSec).toBe(0)
  })

  it('preserva a playlist do Spotify quando existe', () => {
    const storage = createStorage(fakeStore())
    storage.upsertWorkout(makeWorkout({ spotifyPlaylistUri: 'spotify:playlist:abc' }))
    expect(storage.getWorkout('w1')?.spotifyPlaylistUri).toBe('spotify:playlist:abc')
  })
})

describe('preferências', () => {
  it('devolve o padrão quando não há nada gravado', () => {
    expect(createStorage(fakeStore()).loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('grava e lê de volta', () => {
    const storage = createStorage(fakeStore())
    const settings = { soundEnabled: false, volume: 0.3, duckMusic: false }
    storage.saveSettings(settings)
    expect(storage.loadSettings()).toEqual(settings)
  })

  it('assume a redução de volume ligada quando o campo não existe', () => {
    const store = fakeStore({
      'hiit.settings.v1': JSON.stringify({ soundEnabled: true, volume: 0.5 }),
    })
    expect(createStorage(store).loadSettings().duckMusic).toBe(true)
  })

  it('limita o volume à faixa de zero a um', () => {
    const store = fakeStore({
      'hiit.settings.v1': JSON.stringify({ soundEnabled: true, volume: 5 }),
    })
    expect(createStorage(store).loadSettings().volume).toBe(1)
  })

  it('cai no padrão diante de dado corrompido', () => {
    const store = fakeStore({ 'hiit.settings.v1': '{{{' })
    expect(createStorage(store).loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})

describe('newWorkoutId', () => {
  it('não repete', () => {
    const ids = new Set(Array.from({ length: 200 }, newWorkoutId))
    expect(ids.size).toBe(200)
  })
})
