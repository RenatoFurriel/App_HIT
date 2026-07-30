import type { AppStorage } from '../storage'
import type { Beeper } from '../audio'
import type { Settings } from '../types'

export interface AppContext {
  storage: AppStorage
  beeper: Beeper
  getSettings(): Settings
  setSettings(settings: Settings): void
  navigate(hash: string): void
}
