import { fetchPlayerState, nextTrack, pause, play, setVolume, type Failure } from './api'

/** Fração do volume original durante a contagem regressiva. */
const DUCK_FACTOR = 0.3
const POLL_MS = 5000

export interface MusicStatus {
  /** Controla a exibição da barra. Verdadeiro até o usuário desligar a música. */
  active: boolean
  playing: boolean
  track: string | null
  /** Mensagem a exibir quando algo não sai como esperado. */
  notice: string | null
  /**
   * Verdadeiro quando o Spotify não tem nenhum dispositivo tocando. A tela usa
   * isto para oferecer o atalho de abrir o Spotify e tentar de novo.
   */
  needsDevice: boolean
}

const FAILURE_NOTICE: Record<Failure, string> = {
  'no-session': 'A sessão do Spotify expirou. Entre de novo nas Preferências.',
  'no-device':
    'O Spotify precisa estar tocando em algum aparelho para receber comandos. Abra o Spotify, dê play em qualquer música e volte aqui.',
  forbidden: 'O Spotify recusou o comando. O controle remoto exige uma conta Premium.',
  offline: 'Sem internet — a música não pôde ser comandada. O treino continua normalmente.',
  error: 'O Spotify não respondeu como esperado.',
}

export interface MusicController {
  /** Único disparo automático do app. Tudo o mais parte de um toque do usuário. */
  start(): Promise<void>
  /** Liga a música se estiver parada, pausa se estiver tocando. */
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

  // A barra nasce visível. Escondê-la enquanto o primeiro play não desse certo
  // deixava o usuário sem nenhum controle justamente quando algo dava errado.
  let active = true
  let playing = false
  let track: string | null = null
  let notice: string | null = null
  let needsDevice = false
  let startedContext = false

  let baselineVolume: number | null = null
  let ducked = false
  let duckInFlight = false
  let duckingSupported = true
  let poller: ReturnType<typeof setInterval> | null = null

  const status = (): MusicStatus => ({ active, playing, track, notice, needsDevice })
  const emit = (): void => onChange(status())

  const fail = (reason: Failure): void => {
    notice = FAILURE_NOTICE[reason]
    needsDevice = reason === 'no-device'
    emit()
  }

  const refresh = async (): Promise<void> => {
    const result = await fetchPlayerState()
    if (!result.ok) {
      // A consulta periódica não deve encher a tela de avisos; ela só corrige
      // o caso em que o aparelho voltou a existir.
      if (result.reason === 'no-device') needsDevice = true
      emit()
      return
    }

    const state = result.value
    playing = state?.isPlaying ?? false
    track = state?.track ?? null

    if (state !== null) {
      needsDevice = false
      if (playing) notice = null
    }

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
      'Não dá para abaixar o volume neste aparelho — é uma limitação do Spotify. Os bipes foram reforçados.'
    emit()
    return false
  }

  /** Liga a playlist do treino. Serve tanto para o começo quanto para o "tentar de novo". */
  const playContext = async (): Promise<void> => {
    const result = await play(playlistUri)
    if (!result.ok) {
      playing = false
      fail(result.reason)
      return
    }
    startedContext = true
    playing = true
    notice = null
    needsDevice = false
    emit()
    setTimeout(() => void refresh(), 800)
  }

  return {
    async start() {
      startPolling()
      await playContext()
    },

    async togglePlay() {
      if (playing) {
        playing = false
        notice = null
        emit()
        const result = await pause()
        if (!result.ok) {
          playing = true
          fail(result.reason)
        }
        return
      }

      // Nada tocando: se a playlist nunca chegou a rodar, é ela que deve
      // começar; se já rodou, retomamos de onde parou.
      if (!startedContext) {
        await playContext()
        return
      }

      playing = true
      notice = null
      emit()
      const result = await play()
      if (!result.ok) {
        playing = false
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
      needsDevice = false
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
      setTimeout(() => void refresh(), 800)
    },

    setDucked(next) {
      if (!active || !playing || !duckingSupported || !isDuckEnabled()) return
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
