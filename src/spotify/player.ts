import { fetchPlayerState, nextTrack, pause, play, setVolume, type Failure } from './api'

/** Fração do volume original durante a contagem regressiva. */
const DUCK_FACTOR = 0.3
const POLL_MS = 8000

export interface MusicStatus {
  /** Verdadeiro entre o primeiro play e o botão de desligar. */
  active: boolean
  playing: boolean
  track: string | null
  /** Mensagem a exibir uma vez, quando algo não sai como esperado. */
  notice: string | null
}

const FAILURE_NOTICE: Record<Failure, string> = {
  'no-session': 'A sessão do Spotify expirou. Entre de novo nas Preferências.',
  'no-device':
    'Nenhum dispositivo tocando. Abra o Spotify, toque qualquer música uma vez e tente de novo.',
  forbidden: 'O Spotify recusou o comando. O controle remoto exige uma conta Premium.',
  offline: 'Sem internet — a música não pôde ser comandada. O treino continua normalmente.',
  error: 'O Spotify não respondeu como esperado.',
}

export interface MusicController {
  /** Único disparo automático do app. Tudo o mais parte de um toque do usuário. */
  start(): Promise<void>
  togglePlay(): Promise<void>
  turnOff(): Promise<void>
  skip(): Promise<void>
  /** Idempotente: chamar repetidamente com o mesmo valor não gera chamadas. */
  setDucked(ducked: boolean): void
  getStatus(): MusicStatus
  dispose(): void
}

export function createMusicController(options: {
  playlistUri: string
  isDuckEnabled: () => boolean
  /** Avisado quando a redução de volume se mostra indisponível no aparelho. */
  onBoostBeeps: (boost: boolean) => void
  onChange: (status: MusicStatus) => void
}): MusicController {
  const { playlistUri, isDuckEnabled, onBoostBeeps, onChange } = options

  let active = false
  let playing = false
  let track: string | null = null
  let notice: string | null = null

  let baselineVolume: number | null = null
  let ducked = false
  let duckInFlight = false
  let duckingSupported = true
  let poller: ReturnType<typeof setInterval> | null = null

  const status = (): MusicStatus => ({ active, playing, track, notice })
  const emit = (): void => onChange(status())

  const fail = (reason: Failure): void => {
    notice = FAILURE_NOTICE[reason]
    emit()
  }

  const refresh = async (): Promise<void> => {
    const result = await fetchPlayerState()
    if (!result.ok) return
    const state = result.value
    playing = state?.isPlaying ?? false
    track = state?.track ?? null
    // Enquanto abaixado, o volume lido é o reduzido — guardar isso apagaria
    // o valor original, e a música nunca voltaria ao normal.
    if (!ducked && typeof state?.volume === 'number') baselineVolume = state.volume
    emit()
  }

  const startPolling = (): void => {
    if (poller !== null) return
    poller = setInterval(() => void refresh(), POLL_MS)
  }

  const stopPolling = (): void => {
    if (poller !== null) clearInterval(poller)
    poller = null
  }

  const applyVolume = async (percent: number): Promise<boolean> => {
    const result = await setVolume(percent)
    if (result.ok) return true

    // O cliente iOS do Spotify recusa o comando de volume. Em vez de insistir,
    // desligamos a redução para esta sessão e compensamos no volume dos bipes.
    duckingSupported = false
    ducked = false
    onBoostBeeps(true)
    notice =
      'Não dá para abaixar o volume neste dispositivo — é uma limitação do Spotify. Os bipes foram reforçados.'
    emit()
    return false
  }

  return {
    async start() {
      const result = await play(playlistUri)
      if (!result.ok) {
        fail(result.reason)
        return
      }
      active = true
      playing = true
      notice = null
      emit()
      startPolling()
      void refresh()
    },

    async togglePlay() {
      const wasPlaying = playing
      // Otimista: a interface responde na hora e a consulta seguinte corrige
      // se o Spotify discordar.
      playing = !wasPlaying
      notice = null
      emit()

      const result = wasPlaying ? await pause() : await play()
      if (!result.ok) {
        playing = wasPlaying
        fail(result.reason)
      }
    },

    async turnOff() {
      stopPolling()
      if (ducked && baselineVolume !== null) await applyVolume(baselineVolume)
      ducked = false
      await pause()
      active = false
      playing = false
      track = null
      notice = null
      emit()
    },

    async skip() {
      notice = null
      const result = await nextTrack()
      if (!result.ok) {
        fail(result.reason)
        return
      }
      // A faixa nova demora um instante para aparecer no estado do player.
      setTimeout(() => void refresh(), 600)
    },

    setDucked(next) {
      if (!active || !duckingSupported || !isDuckEnabled()) return
      if (next === ducked || duckInFlight) return
      if (baselineVolume === null) return

      const target = next ? Math.round(baselineVolume * DUCK_FACTOR) : baselineVolume
      ducked = next
      duckInFlight = true
      void applyVolume(target).finally(() => {
        duckInFlight = false
      })
    },

    getStatus: status,

    dispose() {
      stopPolling()
      // Sair da tela não mexe na música: ela continua tocando, por desenho.
      // Só desfazemos a redução de volume, que é coisa nossa e não do usuário.
      if (ducked && baselineVolume !== null) {
        ducked = false
        void setVolume(baselineVolume)
      }
    },
  }
}
