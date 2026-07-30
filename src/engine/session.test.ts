import { describe, it, expect, vi } from 'vitest'
import { createSession } from './session'
import type { Workout } from '../types'

const T0 = 1_000_000

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'w1',
    name: 'Teste',
    exerciseIds: ['a', 'b'],
    prepareSec: 10,
    workSec: 40,
    restSec: 20,
    rounds: 2,
    roundRestSec: 60,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

/** Sequência: prepare 10, work 40, rest 20, work 40, roundRest 60, work 40, rest 20, work 40 */
function startedSession(overrides: Partial<Workout> = {}) {
  const session = createSession(makeWorkout(overrides))
  session.start(T0)
  return session
}

describe('início', () => {
  it('começa na preparação com o tempo cheio', () => {
    const state = startedSession().getState(T0)
    expect(state.phase).toBe('running')
    expect(state.segment?.kind).toBe('prepare')
    expect(state.remainingSec).toBe(10)
    expect(state.segmentProgress).toBe(0)
  })

  it('termina de imediato um treino sem exercícios', () => {
    const session = createSession(makeWorkout({ exerciseIds: [] }))
    session.start(T0)
    expect(session.getState(T0).phase).toBe('finished')
  })

  it('expõe a duração total em milissegundos', () => {
    expect(startedSession().totalDurationMs).toBe(270_000)
  })
})

describe('passagem do tempo', () => {
  it('conta para baixo dentro do segmento', () => {
    const session = startedSession()
    expect(session.getState(T0 + 3_000).remainingSec).toBe(7)
    expect(session.getState(T0 + 9_500).remainingSec).toBe(1)
  })

  it('vira o segmento no instante exato', () => {
    const session = startedSession()
    expect(session.getState(T0 + 9_999).segment?.kind).toBe('prepare')
    expect(session.getState(T0 + 10_000).segment?.kind).toBe('work')
  })

  it('avisa a troca de segmento uma única vez', () => {
    const session = startedSession()
    const spy = vi.fn()
    session.on('segmentChange', spy)
    session.tick(T0 + 10_000)
    session.tick(T0 + 10_200)
    session.tick(T0 + 10_400)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('não deixa o tempo restante ficar negativo', () => {
    const session = startedSession({ exerciseIds: ['a'], rounds: 1, prepareSec: 0 })
    expect(session.getState(T0 + 999_999).remainingMs).toBe(0)
  })
})

describe('recuperação por timestamp', () => {
  it('atravessa vários segmentos de um salto só', () => {
    const session = startedSession()
    // 10 preparação + 40 esforço + 20 intervalo = 70 s. Em 75 s estamos no
    // segundo esforço, com 35 s restantes.
    const state = session.getState(T0 + 75_000)
    expect(state.segment?.kind).toBe('work')
    expect(state.segment?.exerciseId).toBe('b')
    expect(state.remainingSec).toBe(35)
  })

  it('não derrapa: o excedente de um segmento entra no seguinte', () => {
    const session = startedSession()
    // Consultado só depois da virada, o segmento novo já deve ter consumido
    // os 500 ms excedentes em vez de recomeçar do zero.
    const state = session.getState(T0 + 10_500)
    expect(state.segment?.kind).toBe('work')
    expect(state.elapsedInSegmentMs).toBe(500)
  })

  it('chega ao fim quando o salto passa do treino inteiro', () => {
    const session = startedSession()
    const finish = vi.fn()
    session.on('finish', finish)
    expect(session.getState(T0 + 500_000).phase).toBe('finished')
    expect(finish).toHaveBeenCalledTimes(1)
  })
})

describe('pausa e retomada', () => {
  it('congela o tempo restante enquanto pausado', () => {
    const session = startedSession()
    session.pause(T0 + 4_000)
    expect(session.getState(T0 + 4_000).remainingSec).toBe(6)
    expect(session.getState(T0 + 30_000).remainingSec).toBe(6)
    expect(session.getState(T0 + 30_000).phase).toBe('paused')
  })

  it('continua do ponto exato ao retomar', () => {
    const session = startedSession()
    session.pause(T0 + 4_000)
    session.resume(T0 + 30_000)
    expect(session.getState(T0 + 31_000).remainingSec).toBe(5)
  })

  it('não avança segmento enquanto pausado', () => {
    const session = startedSession()
    session.pause(T0 + 4_000)
    expect(session.getState(T0 + 100_000).segment?.kind).toBe('prepare')
  })

  it('acumula várias pausas', () => {
    const session = startedSession()
    session.pause(T0 + 2_000)
    session.resume(T0 + 12_000)
    session.pause(T0 + 14_000)
    session.resume(T0 + 24_000)
    // 4 s de treino consumidos ao todo.
    expect(session.getState(T0 + 24_000).remainingSec).toBe(6)
  })

  it('toggle alterna nos dois sentidos', () => {
    const session = startedSession()
    session.toggle(T0 + 1_000)
    expect(session.getState(T0 + 1_000).phase).toBe('paused')
    session.toggle(T0 + 2_000)
    expect(session.getState(T0 + 2_000).phase).toBe('running')
  })
})

describe('pular e voltar', () => {
  it('pular avança um segmento e zera o tempo', () => {
    const session = startedSession()
    session.skip(T0 + 3_000)
    const state = session.getState(T0 + 3_000)
    expect(state.segment?.kind).toBe('work')
    expect(state.remainingSec).toBe(40)
  })

  it('pular no último segmento termina o treino', () => {
    const session = startedSession({ exerciseIds: ['a'], rounds: 1, prepareSec: 0 })
    const finish = vi.fn()
    session.on('finish', finish)
    session.skip(T0 + 1_000)
    expect(session.getState(T0 + 1_000).phase).toBe('finished')
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('voltar retrocede um segmento', () => {
    const session = startedSession()
    session.skip(T0 + 3_000)
    session.previous(T0 + 4_000)
    expect(session.getState(T0 + 4_000).segment?.kind).toBe('prepare')
  })

  it('voltar no primeiro segmento apenas recomeça ele', () => {
    const session = startedSession()
    session.previous(T0 + 5_000)
    const state = session.getState(T0 + 5_000)
    expect(state.segmentIndex).toBe(0)
    expect(state.remainingSec).toBe(10)
  })

  it('pular enquanto pausado mantém a pausa', () => {
    const session = startedSession()
    session.pause(T0 + 2_000)
    session.skip(T0 + 2_000)
    const state = session.getState(T0 + 60_000)
    expect(state.phase).toBe('paused')
    expect(state.segment?.kind).toBe('work')
    expect(state.remainingSec).toBe(40)
  })
})

describe('progresso total', () => {
  it('acumula o tempo dos segmentos anteriores', () => {
    const session = startedSession()
    expect(session.getState(T0 + 15_000).totalElapsedMs).toBe(15_000)
  })

  it('parar volta ao estado ocioso', () => {
    const session = startedSession()
    session.stop()
    expect(session.getState(T0 + 5_000).phase).toBe('idle')
  })
})
