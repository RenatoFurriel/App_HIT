import { h, icon, ICONS, clear } from './dom'
import { confirmSheet, closeSheet } from './sheet'
import { createSession } from '../engine/session'
import type { Segment } from '../engine/timeline'
import { createAnimation, getExercise, REST_POSE, exerciseName } from '../exercises'
import { createWakeLock } from './wakelock'
import type { AppContext } from './context'

const RING_RADIUS = 88
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const PHASE_LABEL: Record<Segment['kind'], string> = {
  prepare: 'Prepare-se',
  work: 'Esforço',
  rest: 'Intervalo',
  roundRest: 'Descanso',
}

export function renderRun(ctx: AppContext, id: string): HTMLElement {
  const workout = ctx.storage.getWorkout(id)

  if (!workout || workout.exerciseIds.length === 0) {
    return h(
      'div',
      { class: 'screen' },
      h('div', { class: 'empty', text: 'Treino não encontrado.' }),
      h('button', {
        class: 'primary-btn',
        text: 'Voltar',
        on: { click: () => ctx.navigate('#/') },
      }),
    )
  }

  const session = createSession(workout)
  const wakeLock = createWakeLock()
  const totalRounds = workout.rounds

  const screen = h('div', { class: 'screen run' })

  // ---- estrutura fixa, montada uma vez e atualizada a cada quadro ----------

  const roundText = h('span', { text: '' })
  const positionText = h('span', { text: '' })
  const phaseLabel = h('div', { class: 'phase-label', text: '' })
  const countText = h('div', { class: 'count', text: '0' })

  const ringValue = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  ringValue.setAttribute('class', 'value')
  ringValue.setAttribute('cx', '100')
  ringValue.setAttribute('cy', '100')
  ringValue.setAttribute('r', String(RING_RADIUS))
  ringValue.setAttribute('stroke-dasharray', String(RING_CIRCUMFERENCE))
  ringValue.setAttribute('stroke-dashoffset', '0')

  const ringTrack = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  ringTrack.setAttribute('class', 'track')
  ringTrack.setAttribute('cx', '100')
  ringTrack.setAttribute('cy', '100')
  ringTrack.setAttribute('r', String(RING_RADIUS))

  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  ring.setAttribute('class', 'ring')
  ring.setAttribute('viewBox', '0 0 200 200')
  ring.setAttribute('aria-hidden', 'true')
  ring.append(ringTrack, ringValue)

  const art = h('div', { class: 'art' })
  const exerciseTitle = h('div', { class: 'title', text: '' })
  const exerciseCue = h('div', { class: 'cue', text: '' })
  const nextUp = h('div', { class: 'next-up', text: '' })

  const mainButton = h(
    'button',
    { class: 'control main', attrs: { 'aria-label': 'Pausar' } },
    icon(ICONS.pause, 24),
  )

  const controls = h(
    'div',
    { class: 'controls' },
    h(
      'button',
      {
        class: 'control',
        attrs: { 'aria-label': 'Sair do treino' },
        on: { click: () => askExit() },
      },
      icon(ICONS.close, 22),
    ),
    h(
      'button',
      {
        class: 'control',
        attrs: { 'aria-label': 'Voltar um passo' },
        on: { click: () => session.previous(Date.now()) },
      },
      icon(ICONS.prev, 20),
    ),
    mainButton,
    h(
      'button',
      {
        class: 'control',
        attrs: { 'aria-label': 'Pular um passo' },
        on: { click: () => session.skip(Date.now()) },
      },
      icon(ICONS.next, 20),
    ),
  )

  const warning = h('div', { class: 'warning' })
  warning.hidden = true

  const body = h(
    'div',
    {},
    h('div', { class: 'run-top' }, roundText, positionText),
    phaseLabel,
    h('div', { class: 'ring-wrap' }, ring, h('div', {}, countText, h('div', { class: 'count-unit', text: 'segundos' }))),
    h(
      'div',
      { class: 'exercise-block' },
      art,
      h('div', {}, exerciseTitle, exerciseCue),
    ),
    nextUp,
    warning,
  )

  screen.append(h('div', { class: 'spacer' }), body, h('div', { class: 'spacer' }), controls)

  // ---- comportamento ------------------------------------------------------

  /**
   * Índice do segmento cujos bipes já estão agendados. Guardar isto é o que
   * impede a rajada de sons ao voltar de um longo período em segundo plano:
   * o engine pode ter atravessado cinco segmentos de uma vez, mas só o
   * segmento em que realmente caímos agenda áudio, e pelo tempo que de fato
   * resta nele.
   */
  let scheduledIndex = -1

  const syncAudio = (state: ReturnType<typeof session.getState>): void => {
    if (state.phase !== 'running' || !state.segment) return
    if (state.segmentIndex === scheduledIndex) return
    scheduledIndex = state.segmentIndex
    ctx.beeper.cancel()
    // O tom de abertura só soa se o segmento estiver mesmo começando agora.
    const justStarted = state.elapsedInSegmentMs < 400
    ctx.beeper.scheduleSegment(state.segment.kind, state.remainingMs, justStarted)
  }

  const dropScheduledAudio = (): void => {
    ctx.beeper.cancel()
    scheduledIndex = -1
  }

  mainButton.addEventListener('click', () => {
    const now = Date.now()
    const wasRunning = session.getState(now).phase === 'running'
    session.toggle(now)
    dropScheduledAudio()
    if (!wasRunning) void wakeLock.request()
  })

  const askExit = (): void => {
    session.pause(Date.now())
    dropScheduledAudio()
    confirmSheet('Sair do treino?', 'Sair', () => {
      finish(false)
      ctx.navigate('#/')
    })
  }

  let currentExerciseKey = ''
  const paintExercise = (segment: Segment): void => {
    const exercise =
      segment.kind === 'work' ? getExercise(segment.exerciseId) ?? REST_POSE : REST_POSE
    const key = `${segment.kind}:${exercise.id}`
    if (key === currentExerciseKey) return
    currentExerciseKey = key
    clear(art)
    art.append(createAnimation(exercise))
    exerciseTitle.textContent =
      segment.kind === 'work' ? exercise.name : PHASE_LABEL[segment.kind]
    exerciseCue.textContent = exercise.cue
  }

  const paintNextUp = (segment: Segment): void => {
    if (segment.kind === 'work') {
      nextUp.textContent = segment.nextExerciseId
        ? `Depois: ${exerciseName(segment.nextExerciseId)}`
        : 'Último exercício do treino'
    } else {
      nextUp.textContent = `A seguir: ${exerciseName(segment.nextExerciseId)}`
    }
  }

  session.on('finish', () => {
    ctx.beeper.cancel()
    ctx.beeper.playFinish()
  })

  let finished = false
  const showFinished = (): void => {
    if (finished) return
    finished = true
    stopLoop()
    void wakeLock.release()
    screen.classList.remove('is-work', 'is-rest')
    clear(screen)
    screen.append(
      h('div', { class: 'spacer' }),
      h(
        'div',
        { class: 'finished' },
        h('div', { class: 'big', text: 'Treino concluído' }),
        h('div', { class: 'sub', text: workout.name }),
      ),
      h('div', { class: 'spacer' }),
      h('button', {
        class: 'primary-btn',
        text: 'Voltar ao início',
        on: { click: () => ctx.navigate('#/') },
      }),
      h('div', { class: 'credit', text: 'By Renato Furriel' }),
    )
  }

  let lastPaused: boolean | null = null
  let frame = 0
  const stopLoop = (): void => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }

  const paint = (): void => {
    const state = session.getState(Date.now())

    if (state.phase === 'finished') {
      showFinished()
      return
    }

    syncAudio(state)

    const segment = state.segment
    if (segment) {
      const isWork = segment.kind === 'work'
      screen.classList.toggle('is-work', isWork)
      screen.classList.toggle('is-rest', !isWork)

      phaseLabel.textContent = PHASE_LABEL[segment.kind]
      roundText.textContent = `Volta ${segment.round} de ${totalRounds}`
      positionText.textContent =
        segment.kind === 'prepare'
          ? 'Começando'
          : `Exercício ${segment.indexInRound}/${workout.exerciseIds.length}`
      countText.textContent = String(state.remainingSec)
      ringValue.setAttribute(
        'stroke-dashoffset',
        String(RING_CIRCUMFERENCE * Math.min(1, state.segmentProgress)),
      )
      paintExercise(segment)
      paintNextUp(segment)
    }

    // Só troca o ícone quando o estado muda. Refazer o conteúdo do botão a
    // cada quadro é desperdício e, num toque, o elemento sob o dedo some no
    // meio do gesto.
    const paused = state.phase === 'paused'
    if (paused !== lastPaused) {
      lastPaused = paused
      mainButton.replaceChildren(icon(paused ? ICONS.play : ICONS.pause, 24))
      mainButton.setAttribute('aria-label', paused ? 'Retomar' : 'Pausar')
    }

    frame = requestAnimationFrame(paint)
  }

  const finish = (playSound: boolean): void => {
    stopLoop()
    session.stop()
    ctx.beeper.cancel()
    if (playSound) ctx.beeper.playFinish()
    void wakeLock.release()
    closeSheet()
    document.removeEventListener('visibilitychange', onVisibility)
  }

  const onVisibility = (): void => {
    if (document.visibilityState !== 'visible') return
    // Voltar do segundo plano: o cronômetro se recompõe sozinho pelo relógio.
    // Basta descartar o áudio antigo — o próximo quadro reagenda só o que
    // ainda faz sentido tocar. O bloqueio de tela precisa ser pedido de novo,
    // e o contexto de áudio costuma voltar suspenso do iOS.
    void wakeLock.request()
    void ctx.beeper.unlock()
    dropScheduledAudio()
  }

  document.addEventListener('visibilitychange', onVisibility)

  // Arranque: o áudio já foi liberado pelo toque no botão de play da lista.
  void ctx.beeper.unlock().then(() => {
    if (!wakeLock.isSupported()) {
      warning.hidden = false
      warning.textContent =
        'Este navegador não mantém a tela acesa sozinho. Aumente o tempo de bloqueio do aparelho para o treino não ser interrompido.'
    }
  })
  void wakeLock.request()

  session.start(Date.now())
  paint()

  // O roteador chama isto ao trocar de tela, para nada continuar rodando.
  ;(screen as HTMLElement & { dispose?: () => void }).dispose = () => finish(false)

  return screen
}
