import type { Workout } from '../types'
import { buildTimeline, totalDurationSec, type Segment } from './timeline'

export type Phase = 'idle' | 'running' | 'paused' | 'finished'

export interface SessionState {
  phase: Phase
  segmentIndex: number
  segment: Segment | null
  /** Milissegundos restantes no segmento atual, nunca negativo. */
  remainingMs: number
  /** O número que a tela mostra. Conta 40, 39, ... 1, e vira. */
  remainingSec: number
  elapsedInSegmentMs: number
  totalElapsedMs: number
  totalDurationMs: number
  /** Fração de 0 a 1 percorrida do segmento atual, para o anel de progresso. */
  segmentProgress: number
}

type Listener = {
  segmentChange: (segment: Segment, index: number) => void
  finish: () => void
}

export interface Session {
  readonly segments: readonly Segment[]
  readonly totalDurationMs: number
  start(now: number): void
  pause(now: number): void
  resume(now: number): void
  toggle(now: number): void
  skip(now: number): void
  previous(now: number): void
  stop(): void
  /**
   * Reconcilia o estado com o relógio. A interface chama isto periodicamente;
   * é aqui que os segmentos avançam e os eventos são emitidos. O engine não
   * tem temporizador próprio de propósito — assim ele é testável sem navegador.
   */
  tick(now: number): void
  getState(now: number): SessionState
  on<K extends keyof Listener>(event: K, handler: Listener[K]): void
}

export function createSession(workout: Workout): Session {
  const segments = buildTimeline(workout)
  const totalDurationMs = totalDurationSec(segments) * 1000

  // Somas acumuladas das durações anteriores a cada índice, para o progresso
  // total não precisar percorrer a lista a cada quadro.
  const elapsedBefore: number[] = []
  let running = 0
  for (const s of segments) {
    elapsedBefore.push(running)
    running += s.durationSec * 1000
  }

  let phase: Phase = 'idle'
  let index = 0
  let segmentStartedAt = 0
  let pausedAccumMs = 0
  let pausedAt: number | null = null

  const handlers: { [K in keyof Listener]: Listener[K][] } = {
    segmentChange: [],
    finish: [],
  }

  const emitSegmentChange = (): void => {
    const segment = segments[index]
    if (segment) for (const h of handlers.segmentChange) h(segment, index)
  }

  const emitFinish = (): void => {
    for (const h of handlers.finish) h()
  }

  /**
   * Tempo decorrido no segmento atual, sempre derivado do relógio — nunca
   * acumulado a cada tique. É isto que faz o cronômetro estar certo depois de
   * o app passar tempo em segundo plano.
   */
  const elapsedIn = (now: number): number => {
    const reference = phase === 'paused' && pausedAt !== null ? pausedAt : now
    return Math.max(0, reference - segmentStartedAt - pausedAccumMs)
  }

  const beginSegment = (at: number): void => {
    segmentStartedAt = at
    pausedAccumMs = 0
    pausedAt = null
  }

  const advanceIfDue = (now: number): void => {
    if (phase !== 'running') return

    // Laço, e não `if`, porque um salto grande de tempo — app em segundo plano
    // — pode ter atravessado vários segmentos de uma vez.
    for (;;) {
      const segment = segments[index]
      if (!segment) break

      const durationMs = segment.durationSec * 1000
      const elapsed = elapsedIn(now)
      if (elapsed < durationMs) break

      const overshoot = elapsed - durationMs
      index += 1

      if (index >= segments.length) {
        index = segments.length
        phase = 'finished'
        emitFinish()
        return
      }

      // O excedente é levado adiante para que a soma dos segmentos não
      // derrape ao longo de um treino inteiro.
      beginSegment(now - overshoot)
      emitSegmentChange()
    }
  }

  return {
    segments,
    totalDurationMs,

    start(now) {
      if (segments.length === 0) {
        phase = 'finished'
        return
      }
      index = 0
      phase = 'running'
      beginSegment(now)
      emitSegmentChange()
    },

    pause(now) {
      if (phase !== 'running') return
      phase = 'paused'
      pausedAt = now
    },

    resume(now) {
      if (phase !== 'paused' || pausedAt === null) return
      pausedAccumMs += now - pausedAt
      pausedAt = null
      phase = 'running'
    },

    toggle(now) {
      if (phase === 'running') this.pause(now)
      else if (phase === 'paused') this.resume(now)
    },

    skip(now) {
      if (phase !== 'running' && phase !== 'paused') return
      index += 1
      if (index >= segments.length) {
        index = segments.length
        phase = 'finished'
        emitFinish()
        return
      }
      beginSegment(now)
      if (phase === 'paused') pausedAt = now
      emitSegmentChange()
    },

    previous(now) {
      if (phase !== 'running' && phase !== 'paused') return
      if (index > 0) index -= 1
      beginSegment(now)
      if (phase === 'paused') pausedAt = now
      emitSegmentChange()
    },

    stop() {
      phase = 'idle'
      index = 0
      pausedAt = null
      pausedAccumMs = 0
    },

    tick(now) {
      advanceIfDue(now)
    },

    getState(now) {
      advanceIfDue(now)

      const segment = segments[index] ?? null
      if (!segment || phase === 'finished') {
        return {
          phase: phase === 'finished' ? 'finished' : phase,
          segmentIndex: Math.min(index, Math.max(0, segments.length - 1)),
          segment: null,
          remainingMs: 0,
          remainingSec: 0,
          elapsedInSegmentMs: 0,
          totalElapsedMs: totalDurationMs,
          totalDurationMs,
          segmentProgress: 1,
        }
      }

      const durationMs = segment.durationSec * 1000
      const elapsed = phase === 'idle' ? 0 : Math.min(elapsedIn(now), durationMs)
      const remainingMs = Math.max(0, durationMs - elapsed)

      return {
        phase,
        segmentIndex: index,
        segment,
        remainingMs,
        remainingSec: Math.ceil(remainingMs / 1000),
        elapsedInSegmentMs: elapsed,
        totalElapsedMs: (elapsedBefore[index] ?? 0) + elapsed,
        totalDurationMs,
        segmentProgress: durationMs === 0 ? 1 : elapsed / durationMs,
      }
    },

    on(event, handler) {
      handlers[event].push(handler)
    },
  }
}
