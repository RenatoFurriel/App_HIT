import { h, icon, ICONS } from './dom'
import { openSheet, closeSheet } from './sheet'
import { workoutDurationSec, formatDuration } from '../engine/timeline'
import type { AppContext } from './context'
import type { Workout } from '../types'

const CREDIT = 'By Renato Furriel'

function workoutCard(workout: Workout, ctx: AppContext): HTMLElement {
  const duration = workoutDurationSec(workout)

  const play = h(
    'button',
    {
      class: 'play-btn',
      attrs: { 'aria-label': `Iniciar ${workout.name}` },
      on: {
        click: (event) => {
          event.stopPropagation()
          // O áudio precisa ser liberado dentro do gesto do usuário, e este é
          // o último gesto antes da tela de execução.
          void ctx.beeper.unlock()
          ctx.navigate(`#/run/${workout.id}`)
        },
      },
    },
    icon(ICONS.play, 20),
  )

  return h(
    'button',
    {
      class: 'workout-card',
      on: { click: () => ctx.navigate(`#/edit/${workout.id}`) },
    },
    h(
      'div',
      { class: 'info' },
      h('div', { class: 'name', text: workout.name }),
      h(
        'div',
        { class: 'tags' },
        h('span', {
          class: 'tag',
          text: `${workout.exerciseIds.length} ${workout.exerciseIds.length === 1 ? 'exercício' : 'exercícios'}`,
        }),
        h('span', { class: 'tag', text: `${workout.workSec}/${workout.restSec}` }),
        h('span', {
          class: 'tag',
          text: `${workout.rounds} ${workout.rounds === 1 ? 'volta' : 'voltas'}`,
        }),
        h('span', { class: 'tag', text: formatDuration(duration) }),
      ),
    ),
    play,
  )
}

/**
 * Estado do áudio em texto claro. Existe porque som mudo no celular não gera
 * erro nenhum — sem isto, a única informação disponível é "não ouvi nada".
 */
function audioDiagnostics(ctx: AppContext): HTMLElement {
  const diag = ctx.beeper.diagnostics()

  let status: string
  if (!diag.supported) status = 'Este navegador não consegue gerar som.'
  else if (diag.state === 'running') status = 'Áudio ativo.'
  else if (diag.state === 'ausente') status = 'Áudio ainda não iniciado — toque no aviso de teste.'
  else status = `Áudio ${diag.state} — toque no aviso de teste para reativar.`

  const silentSwitch = diag.playbackSession
    ? 'Os bipes tocam mesmo com o telefone no silencioso.'
    : 'Este navegador não permite ignorar o interruptor de silencioso. Se não ouvir nada, tire o telefone do silencioso.'

  return h(
    'div',
    { class: 'sheet-note' },
    h('p', { text: status }),
    h('p', { text: silentSwitch }),
  )
}

function settingsSheet(ctx: AppContext): void {
  const settings = ctx.getSettings()

  const soundRow = h(
    'button',
    {
      class: 'sheet-item',
      on: {
        click: () => {
          const next = { ...ctx.getSettings(), soundEnabled: !ctx.getSettings().soundEnabled }
          ctx.setSettings(next)
          closeSheet()
          settingsSheet(ctx)
        },
      },
    },
    icon(settings.soundEnabled ? ICONS.sound : ICONS.muted, 22),
    h('span', { text: settings.soundEnabled ? 'Som ligado' : 'Som desligado' }),
  )

  const volumeValue = h('span', {
    class: 'tag',
    text: `${Math.round(settings.volume * 100)}%`,
  })

  const slider = h('input', {
    class: 'volume',
    attrs: {
      type: 'range',
      min: '0',
      max: '100',
      step: '5',
      value: String(Math.round(settings.volume * 100)),
      'aria-label': 'Volume dos avisos',
    },
    on: {
      input: (event) => {
        const value = Number((event.target as HTMLInputElement).value)
        volumeValue.textContent = `${value}%`
        ctx.setSettings({ ...ctx.getSettings(), volume: value / 100 })
      },
    },
  })

  const body = h(
    'div',
    { class: 'sheet-list' },
    soundRow,
    h(
      'div',
      { class: 'sheet-item' },
      h('span', { text: 'Volume' }),
      h('span', { class: 'spacer' }),
      volumeValue,
    ),
    h('div', { class: 'sheet-item' }, slider),
    h('button', {
      class: 'sheet-item',
      text: 'Tocar um aviso de teste',
      on: {
        click: () => {
          void ctx.beeper.unlock().then(() => {
            ctx.beeper.scheduleSegment('work', 0)
            // Reabre para o diagnóstico refletir o estado depois do toque.
            closeSheet()
            settingsSheet(ctx)
          })
        },
      },
    }),
    audioDiagnostics(ctx),
  )

  openSheet('Preferências', body)
}

export function renderHome(ctx: AppContext): HTMLElement {
  const workouts = ctx.storage.loadWorkouts()

  const list = h('div', {})
  if (workouts.length === 0) {
    list.append(
      h('div', {
        class: 'empty',
        text: 'Nenhum treino ainda. Crie o primeiro e comece a suar.',
      }),
    )
  } else {
    for (const workout of workouts) list.append(workoutCard(workout, ctx))
  }

  return h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'topbar' },
      h('h1', { text: 'Seus treinos' }),
      h(
        'div',
        { class: 'topbar-actions' },
        h(
          'button',
          {
            class: 'icon-btn',
            attrs: { 'aria-label': 'Acompanhamento de peso' },
            on: { click: () => ctx.navigate('#/peso') },
          },
          icon(ICONS.chart, 22),
        ),
        h(
          'button',
          {
            class: 'icon-btn',
            attrs: { 'aria-label': 'Preferências' },
            on: { click: () => settingsSheet(ctx) },
          },
          icon(ICONS.settings, 22),
        ),
      ),
    ),
    list,
    h(
      'button',
      {
        class: 'add-btn',
        on: { click: () => ctx.navigate('#/edit/new') },
      },
      icon(ICONS.plus, 18),
      h('span', { text: 'Criar treino' }),
    ),
    h('div', { class: 'spacer' }),
    h('div', { class: 'credit', text: CREDIT }),
  )
}
