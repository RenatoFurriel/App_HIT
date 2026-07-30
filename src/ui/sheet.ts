import { h, clear } from './dom'
import { EXERCISES, createAnimation, type Exercise } from '../exercises'

let openBackdrop: HTMLElement | null = null

export function closeSheet(): void {
  openBackdrop?.remove()
  openBackdrop = null
}

/** Folha que sobe de baixo. Toque fora fecha, como em qualquer app de celular. */
export function openSheet(title: string, body: HTMLElement): void {
  closeSheet()
  const sheet = h('div', { class: 'sheet' }, h('div', { class: 'sheet-title', text: title }), body)
  const backdrop = h(
    'div',
    {
      class: 'sheet-backdrop',
      on: {
        click: (event) => {
          if (event.target === backdrop) closeSheet()
        },
      },
    },
    sheet,
  )
  openBackdrop = backdrop
  document.body.append(backdrop)
}

/**
 * Seletor de valores por rolagem. Preferido ao teclado numérico porque é mais
 * rápido de operar com a mão suada e não permite digitar um número absurdo.
 */
export function pickNumber(
  title: string,
  options: number[],
  current: number,
  format: (value: number) => string,
  onPick: (value: number) => void,
): void {
  const list = h('div', { class: 'sheet-list' })
  let selected: HTMLElement | null = null

  for (const value of options) {
    const isCurrent = value === current
    const item = h('button', {
      class: `sheet-item${isCurrent ? ' selected' : ''}`,
      text: format(value),
      on: {
        click: () => {
          onPick(value)
          closeSheet()
        },
      },
    })
    if (isCurrent) selected = item
    list.append(item)
  }

  openSheet(title, list)
  selected?.scrollIntoView({ block: 'center' })
}

export function pickExercise(onPick: (exercise: Exercise) => void): void {
  const list = h('div', { class: 'sheet-list' })

  for (const exercise of EXERCISES) {
    const thumb = h('div', { class: 'thumb' })
    thumb.append(createAnimation(exercise))
    const item = h(
      'button',
      {
        class: 'sheet-item',
        on: {
          click: () => {
            onPick(exercise)
            closeSheet()
          },
        },
      },
      thumb,
      h(
        'span',
        {},
        h('span', { text: exercise.name }),
        h('span', { class: 'cue', text: exercise.cue }),
      ),
    )
    list.append(item)
  }

  openSheet('Adicionar exercício', list)
}

export function confirmSheet(
  title: string,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  const list = h('div', { class: 'sheet-list' })
  list.append(
    h('button', {
      class: 'sheet-item',
      text: confirmLabel,
      on: {
        click: () => {
          closeSheet()
          onConfirm()
        },
      },
    }),
    h('button', {
      class: 'sheet-item',
      text: 'Cancelar',
      on: { click: closeSheet },
    }),
  )
  openSheet(title, list)
}

export function rebuild(container: HTMLElement, content: HTMLElement): void {
  clear(container)
  container.append(content)
}
