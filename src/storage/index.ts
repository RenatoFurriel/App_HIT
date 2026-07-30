import { DEFAULT_SETTINGS, type Settings, type Workout } from '../types'

const WORKOUTS_KEY = 'hiit.workouts.v1'
const SETTINGS_KEY = 'hiit.settings.v1'

/** Só o que este módulo usa de `localStorage`, para poder ser testado sem navegador. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const memoryFallback = (): KeyValueStore => {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  }
}

function defaultStore(): KeyValueStore {
  // Safari em navegação privada expõe `localStorage` mas lança ao gravar; as
  // gravações abaixo são protegidas, então o app segue funcionando sem
  // persistir. Aqui só tratamos o caso de o objeto nem existir.
  try {
    return globalThis.localStorage ?? memoryFallback()
  } catch {
    return memoryFallback()
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Aceita apenas o que tem forma de treino. Um registro corrompido é
 * descartado em silêncio em vez de derrubar a tela inicial inteira.
 */
function parseWorkout(raw: unknown): Workout | null {
  if (typeof raw !== 'object' || raw === null) return null
  const w = raw as Record<string, unknown>

  if (typeof w['id'] !== 'string' || w['id'] === '') return null
  if (typeof w['name'] !== 'string') return null
  if (!Array.isArray(w['exerciseIds'])) return null
  if (!w['exerciseIds'].every((id): id is string => typeof id === 'string')) return null

  const numbers = ['prepareSec', 'workSec', 'restSec', 'rounds', 'roundRestSec'] as const
  for (const key of numbers) if (!isFiniteNumber(w[key])) return null

  const workout: Workout = {
    id: w['id'],
    name: w['name'],
    exerciseIds: w['exerciseIds'],
    prepareSec: Math.max(0, Math.round(w['prepareSec'] as number)),
    workSec: Math.max(1, Math.round(w['workSec'] as number)),
    restSec: Math.max(0, Math.round(w['restSec'] as number)),
    rounds: Math.max(1, Math.round(w['rounds'] as number)),
    roundRestSec: Math.max(0, Math.round(w['roundRestSec'] as number)),
    createdAt: isFiniteNumber(w['createdAt']) ? w['createdAt'] : 0,
    updatedAt: isFiniteNumber(w['updatedAt']) ? w['updatedAt'] : 0,
  }

  if (typeof w['spotifyPlaylistUri'] === 'string') {
    workout.spotifyPlaylistUri = w['spotifyPlaylistUri']
  }

  return workout
}

export function createStorage(store: KeyValueStore = defaultStore()) {
  return {
    loadWorkouts(): Workout[] {
      const raw = store.getItem(WORKOUTS_KEY)
      if (!raw) return []
      try {
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed
          .map(parseWorkout)
          .filter((w): w is Workout => w !== null)
          .sort((a, b) => b.updatedAt - a.updatedAt)
      } catch {
        return []
      }
    },

    saveWorkouts(workouts: Workout[]): void {
      try {
        store.setItem(WORKOUTS_KEY, JSON.stringify(workouts))
      } catch {
        // Cota estourada ou gravação bloqueada: o treino em curso continua.
      }
    },

    upsertWorkout(workout: Workout): Workout[] {
      const workouts = this.loadWorkouts()
      const index = workouts.findIndex((w) => w.id === workout.id)
      if (index >= 0) workouts[index] = workout
      else workouts.unshift(workout)
      this.saveWorkouts(workouts)
      return workouts
    },

    deleteWorkout(id: string): Workout[] {
      const workouts = this.loadWorkouts().filter((w) => w.id !== id)
      this.saveWorkouts(workouts)
      return workouts
    },

    getWorkout(id: string): Workout | null {
      return this.loadWorkouts().find((w) => w.id === id) ?? null
    },

    loadSettings(): Settings {
      const raw = store.getItem(SETTINGS_KEY)
      if (!raw) return { ...DEFAULT_SETTINGS }
      try {
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS }
        const s = parsed as Record<string, unknown>
        return {
          soundEnabled:
            typeof s['soundEnabled'] === 'boolean'
              ? s['soundEnabled']
              : DEFAULT_SETTINGS.soundEnabled,
          volume: isFiniteNumber(s['volume'])
            ? Math.min(1, Math.max(0, s['volume']))
            : DEFAULT_SETTINGS.volume,
        }
      } catch {
        return { ...DEFAULT_SETTINGS }
      }
    },

    saveSettings(settings: Settings): void {
      try {
        store.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        // Mesma tolerância da gravação de treinos.
      }
    },
  }
}

export type AppStorage = ReturnType<typeof createStorage>

export function newWorkoutId(): string {
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
