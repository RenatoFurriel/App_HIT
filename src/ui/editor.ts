import { h, icon, ICONS } from './dom'
import { pickNumber, pickExercise, confirmSheet } from './sheet'
import { createAnimation, getExercise } from '../exercises'
import { workoutDurationSec, formatDuration } from '../engine/timeline'
import { newWorkoutId } from '../storage'
import { DEFAULT_WORKOUT, type Workout } from '../types'
import { isLoggedIn } from '../spotify/auth'
import { pickPlaylist } from './spotify-ui'
import type { AppContext } from './context'

const SECONDS_OPTIONS = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120, 150, 180,
]
const WORK_OPTIONS = SECONDS_OPTIONS.filter((s) => s >= 5)
const ROUND_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1)

function seconds(value: number): string {
  return value === 0 ? 'nenhum' : `${value} s`
}

interface Field {
  label: string
  key: 'prepareSec' | 'workSec' | 'restSec' | 'roundRestSec' | 'rounds'
  options: number[]
  step: number
  min: number
  format: (value: number) => string
  accent?: boolean
}

const FIELDS: Field[] = [
  { label: 'Preparação', key: 'prepareSec', options: SECONDS_OPTIONS, step: 5, min: 0, format: seconds },
  { label: 'Esforço', key: 'workSec', options: WORK_OPTIONS, step: 5, min: 5, format: seconds, accent: true },
  { label: 'Intervalo', key: 'restSec', options: SECONDS_OPTIONS, step: 5, min: 0, format: seconds },
  { label: 'Voltas', key: 'rounds', options: ROUND_OPTIONS, step: 1, min: 1, format: (v) => String(v) },
  { label: 'Descanso entre voltas', key: 'roundRestSec', options: SECONDS_OPTIONS, step: 5, min: 0, format: seconds },
]

export function renderEditor(ctx: AppContext, id: string): HTMLElement {
  const isNew = id === 'new'
  const existing = isNew ? null : ctx.storage.getWorkout(id)

  if (!isNew && !existing) {
    return h(
      'div',
      { class: 'screen' },
      h('div', { class: 'empty', text: 'Este treino não existe mais.' }),
      h('button', {
        class: 'primary-btn',
        text: 'Voltar',
        on: { click: () => ctx.navigate('#/') },
      }),
    )
  }

  const draft: Workout = existing
    ? { ...existing, exerciseIds: [...existing.exerciseIds] }
    : { ...DEFAULT_WORKOUT, id: newWorkoutId(), createdAt: Date.now(), updatedAt: Date.now() }

  const screen = h('div', { class: 'screen' })

  const render = (): void => {
    screen.replaceChildren(...build())
  }

  const numberRow = (field: Field): HTMLElement => {
    const value = draft[field.key]
    const display = h('button', {
      class: `value${field.accent ? ' accent' : ''}`,
      text: field.format(value),
      on: {
        click: () =>
          pickNumber(field.label, field.options, value, field.format, (picked) => {
            draft[field.key] = picked
            render()
          }),
      },
    })

    const nudge = (delta: number): void => {
      draft[field.key] = Math.max(field.min, draft[field.key] + delta)
      render()
    }

    return h(
      'div',
      { class: 'row' },
      h('span', { text: field.label }),
      h(
        'div',
        { class: 'stepper' },
        h(
          'button',
          { attrs: { 'aria-label': `Diminuir ${field.label}` }, on: { click: () => nudge(-field.step) } },
          icon(ICONS.minus, 18),
        ),
        display,
        h(
          'button',
          { attrs: { 'aria-label': `Aumentar ${field.label}` }, on: { click: () => nudge(field.step) } },
          icon(ICONS.plus, 18),
        ),
      ),
    )
  }

  const exerciseRow = (exerciseId: string, index: number): HTMLElement => {
    const exercise = getExercise(exerciseId)
    const thumb = h('div', { class: 'thumb' })
    if (exercise) thumb.append(createAnimation(exercise))

    const move = (delta: number): void => {
      const target = index + delta
      if (target < 0 || target >= draft.exerciseIds.length) return
      const list = draft.exerciseIds
      const [moved] = list.splice(index, 1)
      if (moved !== undefined) list.splice(target, 0, moved)
      render()
    }

    return h(
      'div',
      { class: 'ex-row' },
      thumb,
      h('span', { class: 'label', text: exercise?.name ?? 'Exercício removido' }),
      h(
        'button',
        { attrs: { 'aria-label': 'Mover para cima' }, on: { click: () => move(-1) } },
        icon(ICONS.up, 17),
      ),
      h(
        'button',
        { attrs: { 'aria-label': 'Mover para baixo' }, on: { click: () => move(1) } },
        icon(ICONS.down, 17),
      ),
      h(
        'button',
        {
          attrs: { 'aria-label': 'Remover' },
          on: {
            click: () => {
              draft.exerciseIds.splice(index, 1)
              render()
            },
          },
        },
        icon(ICONS.close, 17),
      ),
    )
  }

  /**
   * A playlist é opcional e só aparece com o Spotify conectado. Sem ela o
   * treino funciona igual — o Spotify nunca é dependência para treinar.
   */
  const playlistRow = (): HTMLElement => {
    const connected = isLoggedIn()
    const label = draft.spotifyPlaylistName ?? (draft.spotifyPlaylistUri ? 'Playlist salva' : null)

    if (!connected) {
      return h(
        'div',
        { class: 'summary' },
        h('span', { class: 'muted' }, icon(ICONS.music, 16), h('span', { text: ' Playlist' })),
        h('span', { class: 'muted', text: 'conecte o Spotify' }),
      )
    }

    return h(
      'button',
      {
        class: 'summary tappable',
        on: {
          click: () =>
            pickPlaylist((playlist) => {
              if (playlist) {
                draft.spotifyPlaylistUri = playlist.uri
                draft.spotifyPlaylistName = playlist.name
              } else {
                delete draft.spotifyPlaylistUri
                delete draft.spotifyPlaylistName
              }
              render()
            }),
        },
      },
      h('span', { class: 'muted' }, icon(ICONS.music, 16), h('span', { text: ' Playlist' })),
      h('span', { text: label ?? 'escolher' }),
    )
  }

  const save = (): void => {
    if (draft.exerciseIds.length === 0) return
    draft.name = draft.name.trim() || 'Treino sem nome'
    draft.updatedAt = Date.now()
    ctx.storage.upsertWorkout(draft)
    ctx.navigate('#/')
  }

  const build = (): HTMLElement[] => {
    const duration = workoutDurationSec(draft)
    const canSave = draft.exerciseIds.length > 0

    const nameInput = h('input', {
      class: 'name-input',
      attrs: {
        type: 'text',
        value: draft.name,
        maxlength: '40',
        'aria-label': 'Nome do treino',
        enterkeyhint: 'done',
      },
      on: {
        input: (event) => {
          draft.name = (event.target as HTMLInputElement).value
        },
        keydown: (event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
        },
      },
    })

    const exerciseList = h('div', {})
    if (draft.exerciseIds.length === 0) {
      exerciseList.append(
        h('div', {
          class: 'empty',
          text: 'Um treino precisa de pelo menos um exercício.',
        }),
      )
    } else {
      draft.exerciseIds.forEach((exerciseId, index) => {
        exerciseList.append(exerciseRow(exerciseId, index))
      })
    }

    const summary = h(
      'div',
      { class: `summary${canSave ? '' : ' disabled'}` },
      h('span', { class: 'muted', text: 'Duração total' }),
      h('span', { text: canSave ? formatDuration(duration) : '—' }),
    )

    const topbar = h(
      'div',
      { class: 'topbar' },
      h(
        'button',
        {
          class: 'icon-btn',
          attrs: { 'aria-label': 'Voltar' },
          on: { click: () => ctx.navigate('#/') },
        },
        icon(ICONS.back, 22),
      ),
      h('h1', { text: isNew ? 'Novo treino' : 'Editar treino' }),
      h('button', {
        class: 'text-btn',
        text: 'Salvar',
        attrs: canSave ? {} : { disabled: 'true', style: 'color:var(--dim)' },
        on: { click: save },
      }),
    )

    const nodes: HTMLElement[] = [
      topbar,
      nameInput,
      h('div', { class: 'section-label', text: 'Tempos' }),
      ...FIELDS.map(numberRow),
      h('div', {
        class: 'section-label',
        text: `Exercícios · ${draft.exerciseIds.length}`,
      }),
      exerciseList,
      h(
        'button',
        {
          class: 'add-btn',
          on: {
            click: () =>
              pickExercise((exercise) => {
                draft.exerciseIds.push(exercise.id)
                render()
              }),
          },
        },
        icon(ICONS.plus, 18),
        h('span', { text: 'Adicionar exercício' }),
      ),
      summary,
      playlistRow(),
    ]

    if (!isNew) {
      nodes.push(
        h('div', { class: 'spacer' }),
        h('button', {
          class: 'text-btn danger',
          text: 'Apagar treino',
          on: {
            click: () =>
              confirmSheet(`Apagar "${draft.name}"?`, 'Apagar', () => {
                ctx.storage.deleteWorkout(draft.id)
                ctx.navigate('#/')
              }),
          },
        }),
      )
    }

    return nodes
  }

  render()
  return screen
}
