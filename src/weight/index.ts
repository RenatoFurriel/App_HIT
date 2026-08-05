/** Quantos dias o acompanhamento cobre. */
export const WEIGHT_DAYS = 15

/** Limites de sanidade, para barrar erro de digitação e não para julgar ninguém. */
export const MIN_KG = 20
export const MAX_KG = 400

/** Um registro por dia, na posição correspondente. `null` é dia não preenchido. */
export type WeightLog = (number | null)[]

export function emptyLog(): WeightLog {
  return Array.from({ length: WEIGHT_DAYS }, () => null)
}

/** Normaliza qualquer coisa vinda do armazenamento para um registro válido. */
export function normalizeLog(raw: unknown): WeightLog {
  const log = emptyLog()
  if (!Array.isArray(raw)) return log
  for (let day = 0; day < WEIGHT_DAYS; day++) {
    const value = raw[day]
    if (typeof value === 'number' && Number.isFinite(value) && inRange(value)) {
      log[day] = round1(value)
    }
  }
  return log
}

function inRange(value: number): boolean {
  return value >= MIN_KG && value <= MAX_KG
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Lê o peso digitado. Aceita vírgula e ponto porque um teclado brasileiro
 * oferece vírgula, e exigir ponto seria implicância com o usuário.
 * Devolve `null` para campo vazio e `undefined` para entrada inválida — a
 * diferença importa: um limpa o dia, o outro deve ser recusado.
 */
export function parseWeight(input: string): number | null | undefined {
  const trimmed = input.trim().replace(',', '.')
  if (trimmed === '') return null

  const value = Number(trimmed)
  if (!Number.isFinite(value)) return undefined
  if (!inRange(value)) return undefined
  return round1(value)
}

export function formatWeight(kg: number): string {
  return kg.toFixed(1).replace('.', ',')
}

/** Variação com sinal explícito: "+0,8" e "−2,4" se distinguem de relance. */
export function formatDelta(kg: number): string {
  const rounded = round1(kg)
  if (rounded === 0) return '0,0'
  const sign = rounded > 0 ? '+' : '−'
  return `${sign}${formatWeight(Math.abs(rounded))}`
}

export interface WeightSummary {
  /** Quantos dias têm peso registrado. */
  count: number
  first: number | null
  last: number | null
  /** Último menos primeiro. `null` com menos de dois registros. */
  delta: number | null
  /** Último menos o penúltimo registro — o resultado do dia. */
  lastDelta: number | null
  /** Dia do penúltimo registro, para dizer "desde o dia N". */
  previousDay: number | null
  min: number | null
  max: number | null
  /** Dia (1-indexado) do primeiro e do último registro. */
  firstDay: number | null
  lastDay: number | null
}

export function summarize(log: WeightLog): WeightSummary {
  const entries: { day: number; value: number }[] = []
  log.forEach((value, index) => {
    if (value !== null) entries.push({ day: index + 1, value })
  })

  const first = entries[0]
  const last = entries[entries.length - 1]

  if (!first || !last) {
    return {
      count: 0,
      first: null,
      last: null,
      delta: null,
      lastDelta: null,
      previousDay: null,
      min: null,
      max: null,
      firstDay: null,
      lastDay: null,
    }
  }

  const values = entries.map((e) => e.value)
  const previous = entries[entries.length - 2]

  return {
    count: entries.length,
    first: first.value,
    last: last.value,
    // Um único registro não define variação nenhuma.
    delta: entries.length >= 2 ? round1(last.value - first.value) : null,
    lastDelta: previous ? round1(last.value - previous.value) : null,
    previousDay: previous?.day ?? null,
    min: Math.min(...values),
    max: Math.max(...values),
    firstDay: first.day,
    lastDay: last.day,
  }
}

/**
 * Variação de cada dia em relação ao dia preenchido anterior — o resultado
 * daquele dia. `null` em dia vazio e no primeiro registro, que não tem
 * anterior com que se comparar.
 */
export function dailyDeltas(log: WeightLog): (number | null)[] {
  const deltas: (number | null)[] = Array.from({ length: WEIGHT_DAYS }, () => null)
  let previous: number | null = null

  log.forEach((value, index) => {
    if (value === null) return
    if (previous !== null) deltas[index] = round1(value - previous)
    previous = value
  })

  return deltas
}

export interface ChartPoint {
  day: number
  value: number
  x: number
  y: number
}

export interface ChartGeometry {
  points: ChartPoint[]
  /** Extremos da escala vertical, já com folga. */
  scaleMin: number
  scaleMax: number
}

/**
 * Converte o registro em coordenadas de desenho. Fica aqui, e não na tela,
 * porque é a única parte do gráfico que pode dar errado silenciosamente.
 */
export function chartGeometry(
  log: WeightLog,
  width: number,
  height: number,
  padding: number,
): ChartGeometry {
  const entries: { day: number; value: number }[] = []
  log.forEach((value, index) => {
    if (value !== null) entries.push({ day: index + 1, value })
  })

  const values = entries.map((e) => e.value)
  const rawMin = values.length > 0 ? Math.min(...values) : 0
  const rawMax = values.length > 0 ? Math.max(...values) : 0

  // Uma linha reta — todos os dias com o mesmo peso — não pode virar divisão
  // por zero, nem colar no topo do desenho: damos uma faixa mínima.
  const span = rawMax - rawMin
  const margin = span === 0 ? 1 : span * 0.2
  const scaleMin = round1(rawMin - margin)
  const scaleMax = round1(rawMax + margin)
  const scaleSpan = scaleMax - scaleMin || 1

  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2

  const points = entries.map(({ day, value }) => ({
    day,
    value,
    x: padding + ((day - 1) / (WEIGHT_DAYS - 1)) * usableWidth,
    // y cresce para baixo no SVG, então o peso maior fica em cima.
    y: padding + (1 - (value - scaleMin) / scaleSpan) * usableHeight,
  }))

  return { points, scaleMin, scaleMax }
}
