import { describe, it, expect } from 'vitest'
import {
  WEIGHT_DAYS,
  chartGeometry,
  emptyLog,
  formatDelta,
  formatWeight,
  normalizeLog,
  parseWeight,
  summarize,
  type WeightLog,
} from './index'

function logFrom(entries: Record<number, number>): WeightLog {
  const log = emptyLog()
  for (const [day, value] of Object.entries(entries)) log[Number(day) - 1] = value
  return log
}

describe('emptyLog', () => {
  it('tem quinze dias, todos vazios', () => {
    const log = emptyLog()
    expect(log).toHaveLength(WEIGHT_DAYS)
    expect(log.every((v) => v === null)).toBe(true)
  })
})

describe('parseWeight', () => {
  it('aceita ponto e vírgula', () => {
    expect(parseWeight('82.4')).toBe(82.4)
    expect(parseWeight('82,4')).toBe(82.4)
  })

  it('ignora espaços em volta', () => {
    expect(parseWeight('  75 ')).toBe(75)
  })

  it('campo vazio limpa o dia', () => {
    expect(parseWeight('')).toBeNull()
    expect(parseWeight('   ')).toBeNull()
  })

  it('recusa texto e números fora da faixa', () => {
    expect(parseWeight('abc')).toBeUndefined()
    expect(parseWeight('0')).toBeUndefined()
    expect(parseWeight('900')).toBeUndefined()
    expect(parseWeight('-70')).toBeUndefined()
  })

  it('arredonda para uma casa decimal', () => {
    expect(parseWeight('82,46')).toBe(82.5)
  })
})

describe('formatação', () => {
  it('mostra o peso com vírgula', () => {
    expect(formatWeight(82.4)).toBe('82,4')
    expect(formatWeight(75)).toBe('75,0')
  })

  it('mostra a variação com sinal explícito', () => {
    expect(formatDelta(-2.4)).toBe('−2,4')
    expect(formatDelta(0.8)).toBe('+0,8')
    expect(formatDelta(0)).toBe('0,0')
  })
})

describe('normalizeLog', () => {
  it('devolve registro vazio diante de lixo', () => {
    expect(normalizeLog(null)).toEqual(emptyLog())
    expect(normalizeLog('nada disso')).toEqual(emptyLog())
  })

  it('descarta valores fora da faixa e mantém os válidos', () => {
    const log = normalizeLog([82.4, 999, 'x', null, 80])
    expect(log[0]).toBe(82.4)
    expect(log[1]).toBeNull()
    expect(log[2]).toBeNull()
    expect(log[4]).toBe(80)
  })

  it('corta o excedente em quinze dias', () => {
    expect(normalizeLog(Array.from({ length: 40 }, () => 80))).toHaveLength(WEIGHT_DAYS)
  })
})

describe('summarize', () => {
  it('não inventa variação com o registro vazio', () => {
    const s = summarize(emptyLog())
    expect(s.count).toBe(0)
    expect(s.delta).toBeNull()
    expect(s.first).toBeNull()
  })

  it('não calcula variação com um único registro', () => {
    const s = summarize(logFrom({ 1: 82 }))
    expect(s.count).toBe(1)
    expect(s.first).toBe(82)
    expect(s.delta).toBeNull()
  })

  it('mede do primeiro ao último dia preenchido', () => {
    const s = summarize(logFrom({ 2: 82.4, 5: 81, 9: 80 }))
    expect(s.count).toBe(3)
    expect(s.first).toBe(82.4)
    expect(s.last).toBe(80)
    expect(s.delta).toBe(-2.4)
    expect(s.firstDay).toBe(2)
    expect(s.lastDay).toBe(9)
  })

  it('acha mínimo e máximo mesmo fora de ordem', () => {
    const s = summarize(logFrom({ 1: 80, 2: 84, 3: 79 }))
    expect(s.min).toBe(79)
    expect(s.max).toBe(84)
    // A variação é do primeiro ao último, e não do mínimo ao máximo.
    expect(s.delta).toBe(-1)
  })

  it('registra ganho de peso com sinal positivo', () => {
    expect(summarize(logFrom({ 1: 78, 4: 79.5 })).delta).toBe(1.5)
  })
})

describe('chartGeometry', () => {
  const width = 300
  const height = 100
  const padding = 10

  it('devolve nenhum ponto para registro vazio', () => {
    expect(chartGeometry(emptyLog(), width, height, padding).points).toEqual([])
  })

  it('coloca o dia 1 na esquerda e o dia 15 na direita', () => {
    const { points } = chartGeometry(logFrom({ 1: 80, 15: 78 }), width, height, padding)
    expect(points[0]?.x).toBe(padding)
    expect(points[1]?.x).toBe(width - padding)
  })

  it('desenha o peso maior acima do menor', () => {
    const { points } = chartGeometry(logFrom({ 1: 84, 2: 80 }), width, height, padding)
    expect((points[0] as { y: number }).y).toBeLessThan((points[1] as { y: number }).y)
  })

  it('mantém os pontos dentro da área de desenho', () => {
    const { points } = chartGeometry(
      logFrom({ 1: 84, 5: 80, 10: 90, 15: 70 }),
      width,
      height,
      padding,
    )
    for (const p of points) {
      expect(p.y).toBeGreaterThanOrEqual(padding)
      expect(p.y).toBeLessThanOrEqual(height - padding)
    }
  })

  it('não divide por zero quando o peso não muda', () => {
    const { points, scaleMin, scaleMax } = chartGeometry(
      logFrom({ 1: 80, 2: 80, 3: 80 }),
      width,
      height,
      padding,
    )
    expect(scaleMin).toBeLessThan(scaleMax)
    for (const p of points) expect(Number.isFinite(p.y)).toBe(true)
    // Linha reta fica no meio vertical, não colada numa borda.
    expect(points[0]?.y).toBeCloseTo(height / 2, 5)
  })

  it('dá folga acima e abaixo dos extremos', () => {
    const { scaleMin, scaleMax } = chartGeometry(logFrom({ 1: 80, 2: 90 }), width, height, padding)
    expect(scaleMin).toBeLessThan(80)
    expect(scaleMax).toBeGreaterThan(90)
  })
})
