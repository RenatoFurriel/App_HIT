import type { SegmentKind } from '../engine/timeline'
import type { Settings } from '../types'

/** Quantos segundos antes da virada os bipes começam. */
export const COUNTDOWN_SECONDS = 5

interface Tone {
  freq: number
  durationMs: number
  /** Ganho relativo, antes do volume do usuário. */
  level: number
}

const COUNTDOWN_TONE: Tone = { freq: 880, durationMs: 120, level: 0.6 }
const WORK_TONES: Tone[] = [
  { freq: 660, durationMs: 130, level: 0.9 },
  { freq: 990, durationMs: 220, level: 0.9 },
]
const REST_TONE: Tone[] = [{ freq: 440, durationMs: 450, level: 0.75 }]
const FINISH_TONES: Tone[] = [
  { freq: 523, durationMs: 160, level: 0.9 },
  { freq: 659, durationMs: 160, level: 0.9 },
  { freq: 784, durationMs: 420, level: 0.9 },
]

/** O que a tela de Preferências mostra para diagnosticar áudio mudo. */
export interface AudioDiagnostics {
  /** O navegador tem Web Audio. */
  supported: boolean
  /** 'ausente' antes do primeiro toque; depois, o estado do contexto. */
  state: 'ausente' | AudioContextState
  /**
   * Conseguimos declarar o áudio como reprodução em vez de som ambiente.
   * Sem isso, no iPhone o interruptor lateral no silencioso emudece os bipes.
   */
  playbackSession: boolean
  /** Quantos tons foram agendados desde que o app abriu. */
  scheduled: number
}

export interface Beeper {
  /** Precisa ser chamado dentro de um gesto do usuário; iOS exige isso. */
  unlock(): Promise<void>
  /**
   * Agenda o tom de abertura e a contagem regressiva de um segmento.
   * Ao retomar de uma pausa o tom de abertura é omitido — ele já soou.
   */
  scheduleSegment(kind: SegmentKind, remainingMs: number, playOpening?: boolean): void
  playFinish(): void
  /** Cancela tudo que estava agendado — pausa, pulo, saída. */
  cancel(): void
  /** Falso enquanto o navegador não tiver liberado o áudio. */
  isReady(): boolean
  diagnostics(): AudioDiagnostics
}

type AudioSessionCapable = Navigator & { audioSession?: { type: string } }

/**
 * Declara o áudio como reprodução, e não como som ambiente.
 *
 * No iPhone essa é a diferença entre os bipes tocarem e não tocarem: por
 * padrão, som gerado pela Web Audio é classificado como ambiente e o
 * interruptor lateral de silencioso o emudece por completo — sem erro, sem
 * aviso, simplesmente sem som. Disponível a partir do iOS 16.4.
 */
function requestPlaybackSession(): boolean {
  const session = (navigator as AudioSessionCapable).audioSession
  if (!session) return false
  try {
    session.type = 'playback'
    return true
  } catch {
    return false
  }
}

export function createBeeper(getSettings: () => Settings): Beeper {
  let ctx: AudioContext | null = null
  let scheduled: OscillatorNode[] = []
  let playbackSession = false
  let scheduledCount = 0

  const ensureContext = (): AudioContext | null => {
    if (ctx) return ctx
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    // A sessão é declarada antes de existir contexto: no iOS a classificação
    // vale para o que vier depois.
    playbackSession = requestPlaybackSession()
    ctx = new Ctor()
    return ctx
  }

  /**
   * Agenda um tom no relógio do próprio Web Audio. Usar `ctx.currentTime` em
   * vez de `setTimeout` é o que mantém os bipes no lugar mesmo quando a thread
   * principal está ocupada redesenhando a tela.
   */
  const tone = (audio: AudioContext, spec: Tone, atSeconds: number): void => {
    const settings = getSettings()
    const volume = settings.volume * spec.level
    if (volume <= 0) return

    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(spec.freq, atSeconds)

    // Ataque e decaimento curtos: sem eles o tom estala nas bordas.
    const end = atSeconds + spec.durationMs / 1000
    gain.gain.setValueAtTime(0, atSeconds)
    gain.gain.linearRampToValueAtTime(Math.min(1, volume), atSeconds + 0.012)
    gain.gain.setValueAtTime(Math.min(1, volume), Math.max(atSeconds + 0.012, end - 0.04))
    gain.gain.linearRampToValueAtTime(0, end)

    osc.connect(gain).connect(audio.destination)
    osc.start(atSeconds)
    osc.stop(end + 0.02)
    osc.onended = () => {
      scheduled = scheduled.filter((o) => o !== osc)
      gain.disconnect()
    }
    scheduled.push(osc)
    scheduledCount += 1
  }

  const playSequence = (tones: Tone[], startAt: number): void => {
    const audio = ensureContext()
    if (!audio || !getSettings().soundEnabled) return
    let at = startAt
    for (const t of tones) {
      tone(audio, t, at)
      at += t.durationMs / 1000 + 0.03
    }
  }

  /**
   * O iOS suspende o contexto por conta própria — ao voltar do segundo plano,
   * ao atender uma ligação. Reanimar antes de agendar evita o caso em que
   * tudo parece certo e nada soa.
   */
  const wake = (audio: AudioContext): void => {
    if (audio.state === 'suspended') void audio.resume()
  }

  return {
    async unlock() {
      const audio = ensureContext()
      if (!audio) return
      if (!playbackSession) playbackSession = requestPlaybackSession()
      if (audio.state === 'suspended') await audio.resume()
    },

    scheduleSegment(kind, remainingMs, playOpening = true) {
      const audio = ensureContext()
      if (!audio || !getSettings().soundEnabled) return
      wake(audio)

      const now = audio.currentTime
      if (playOpening) playSequence(kind === 'work' ? WORK_TONES : REST_TONE, now)

      // Bipes nos últimos segundos. O bipe do "zero" não é agendado: quem
      // marca a virada é o tom de abertura do segmento seguinte.
      for (let s = COUNTDOWN_SECONDS; s >= 1; s--) {
        const offsetMs = remainingMs - s * 1000
        if (offsetMs <= 0) continue
        tone(audio, COUNTDOWN_TONE, now + offsetMs / 1000)
      }
    },

    playFinish() {
      const audio = ensureContext()
      if (!audio) return
      wake(audio)
      playSequence(FINISH_TONES, audio.currentTime)
    },

    cancel() {
      for (const osc of scheduled) {
        try {
          osc.onended = null
          osc.stop()
          osc.disconnect()
        } catch {
          // Já parou sozinho; nada a fazer.
        }
      }
      scheduled = []
    },

    isReady() {
      return ctx !== null && ctx.state === 'running'
    },

    diagnostics() {
      const Ctor =
        globalThis.AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      return {
        supported: Boolean(Ctor),
        state: ctx?.state ?? 'ausente',
        playbackSession,
        scheduled: scheduledCount,
      }
    },
  }
}
