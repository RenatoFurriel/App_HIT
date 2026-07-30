export interface Workout {
  id: string
  name: string
  exerciseIds: string[]
  prepareSec: number
  workSec: number
  restSec: number
  rounds: number
  roundRestSec: number
  spotifyPlaylistUri?: string
  spotifyPlaylistName?: string
  createdAt: number
  updatedAt: number
}

export interface Settings {
  soundEnabled: boolean
  volume: number
  /** Abaixar a música nos 5 segundos de contagem regressiva. Nunca a interrompe. */
  duckMusic: boolean
}

export const DEFAULT_WORKOUT: Omit<Workout, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'Novo treino',
  exerciseIds: [],
  prepareSec: 10,
  workSec: 40,
  restSec: 20,
  rounds: 3,
  roundRestSec: 60,
}

export const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  volume: 0.8,
  duckMusic: true,
}
