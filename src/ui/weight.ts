import { h, icon, ICONS } from './dom'
import { confirmSheet } from './sheet'
import {
  WEIGHT_DAYS,
  chartGeometry,
  dailyDeltas,
  emptyLog,
  formatDelta,
  formatWeight,
  parseWeight,
  summarize,
  type WeightLog,
} from '../weight'
import type { AppContext } from './context'

const SVG_NS = 'http://www.w3.org/2000/svg'
const CHART_WIDTH = 320
const CHART_HEIGHT = 150
const CHART_PADDING = 18

function svg(tag: string, attrs: Record<string, string>, text?: string): SVGElement {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value)
  if (text !== undefined) el.textContent = text
  return el
}

/**
 * Gráfico de linha desenhado à mão em SVG. Um gráfico de quinze pontos não
 * justifica uma biblioteca — que custaria mais que o app inteiro e levaria
 * junto a promessa de funcionar offline.
 */
function chart(log: WeightLog): SVGElement {
  const { points, scaleMin, scaleMax } = chartGeometry(
    log,
    CHART_WIDTH,
    CHART_HEIGHT,
    CHART_PADDING,
  )

  const root = svg('svg', {
    viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
    class: 'weight-chart',
    role: 'img',
    'aria-label': `Evolução do peso ao longo dos ${WEIGHT_DAYS} dias`,
  })

  // Moldura horizontal: só o topo e a base da escala, para dar referência sem
  // encher o desenho de linhas.
  for (const y of [CHART_PADDING, CHART_HEIGHT - CHART_PADDING]) {
    root.append(
      svg('line', {
        x1: String(CHART_PADDING),
        y1: String(y),
        x2: String(CHART_WIDTH - CHART_PADDING),
        y2: String(y),
        class: 'grid',
      }),
    )
  }

  root.append(
    svg('text', { x: String(CHART_PADDING), y: '12', class: 'axis' }, `${formatWeight(scaleMax)} kg`),
    svg(
      'text',
      { x: String(CHART_PADDING), y: String(CHART_HEIGHT - 4), class: 'axis' },
      `${formatWeight(scaleMin)} kg`,
    ),
  )

  if (points.length >= 2) {
    root.append(
      svg('polyline', {
        points: points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
        class: 'line',
      }),
    )
  }

  for (const point of points) {
    const dot = svg('circle', {
      cx: point.x.toFixed(1),
      cy: point.y.toFixed(1),
      r: '4',
      class: 'dot',
    })
    dot.append(svg('title', {}, `Dia ${point.day}: ${formatWeight(point.value)} kg`))
    root.append(dot)
  }

  return root
}

export function renderWeight(ctx: AppContext): HTMLElement {
  const log = ctx.storage.loadWeights()
  const screen = h('div', { class: 'screen' })

  const persist = (): void => {
    ctx.storage.saveWeights(log)
  }

  const render = (): void => {
    screen.replaceChildren(...build())
  }

  const summaryBlock = (): HTMLElement => {
    const s = summarize(log)

    if (s.count === 0) {
      return h('div', {
        class: 'weight-summary empty',
        text: 'Registre o peso de pelo menos dois dias para ver a evolução.',
      })
    }

    if (s.delta === null || s.first === null || s.last === null) {
      return h(
        'div',
        { class: 'weight-summary' },
        h('div', { class: 'big', text: `${formatWeight(s.last ?? 0)} kg` }),
        h('div', { class: 'sub', text: 'Registre outro dia para ver a variação.' }),
      )
    }

    return h(
      'div',
      { class: 'weight-summary' },
      h('div', { class: 'big', text: `${formatDelta(s.delta)} kg` }),
      h('div', {
        class: 'sub',
        text: `acumulado do dia ${s.firstDay} ao dia ${s.lastDay} · ${formatWeight(s.first)} → ${formatWeight(s.last)} kg`,
      }),
      s.lastDelta !== null
        ? h('div', {
            class: 'day-delta',
            text: `${formatDelta(s.lastDelta)} kg desde o dia ${s.previousDay}`,
          })
        : null,
    )
  }

  const dayRow = (day: number, delta: number | null): HTMLElement => {
    const current = log[day - 1] ?? null

    const input = h('input', {
      class: 'weight-input',
      attrs: {
        type: 'text',
        inputmode: 'decimal',
        enterkeyhint: 'done',
        placeholder: '—',
        value: current === null ? '' : formatWeight(current),
        'aria-label': `Peso do dia ${day} em quilos`,
      },
      on: {
        change: (event) => {
          const field = event.target as HTMLInputElement
          const parsed = parseWeight(field.value)

          if (parsed === undefined) {
            // Entrada inválida não apaga o que já estava lá: devolvemos o
            // valor anterior em vez de punir o erro de digitação.
            field.value = current === null ? '' : formatWeight(current)
            field.classList.add('invalid')
            setTimeout(() => field.classList.remove('invalid'), 900)
            return
          }

          log[day - 1] = parsed
          persist()
          render()
        },
        keydown: (event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
        },
      },
    })

    return h(
      'div',
      { class: `weight-row${current === null ? '' : ' filled'}` },
      h('span', { class: 'day', text: `Dia ${day}` }),
      input,
      h('span', { class: 'unit', text: 'kg' }),
      // O resultado daquele dia, medido contra o dia preenchido anterior.
      h('span', { class: 'delta', text: delta === null ? '' : formatDelta(delta) }),
    )
  }

  const build = (): HTMLElement[] => {
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
      h('h1', { text: 'Seu peso' }),
      h('span', { class: 'icon-btn' }),
    )

    const deltas = dailyDeltas(log)
    const rows = h('div', { class: 'weight-list' })
    for (let day = 1; day <= WEIGHT_DAYS; day++) {
      rows.append(dayRow(day, deltas[day - 1] ?? null))
    }

    const hasAny = log.some((v) => v !== null)

    const nodes: HTMLElement[] = [topbar, summaryBlock()]

    // Sem nenhum registro não há escala nenhuma para desenhar, e um gráfico
    // com eixos inventados mente mais do que informa.
    if (hasAny) {
      const chartBox = h('div', { class: 'chart-box' })
      chartBox.append(chart(log))
      nodes.push(chartBox)
    }

    nodes.push(
      h('div', { class: 'section-label', text: `Dia 1 ao dia ${WEIGHT_DAYS}` }),
      rows,
    )

    if (hasAny) {
      nodes.push(
        h('button', {
          class: 'text-btn danger',
          text: 'Apagar todos os registros',
          on: {
            click: () =>
              confirmSheet('Apagar os quinze dias?', 'Apagar tudo', () => {
                const cleared = emptyLog()
                for (let i = 0; i < WEIGHT_DAYS; i++) log[i] = cleared[i] ?? null
                persist()
                render()
              }),
          },
        }),
      )
    }

    nodes.push(h('div', { class: 'credit', text: 'By Renato Furriel' }))
    return nodes
  }

  render()
  return screen
}
