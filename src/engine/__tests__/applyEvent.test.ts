import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyEvent } from '../baseball'
import { createGameState, mockRandomSequence } from '../../test/factories'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('applyEvent', () => {
  it('anota y mantiene las bases llenas con base por bolas', () => {
    const gs = createGameState({ bases: { first: true, second: true, third: true }, rules: { stochasticBaseRunning: false } })

    const result = applyEvent(gs, 'BB')

    expect(result).toBe('Base por bolas (BB)')
    expect(gs.scoreAway).toBe(1)
    expect(gs.bases).toEqual({ first: true, second: true, third: true })
    expect(gs.outs).toBe(0)
  })

  it('limpia las bases con un home run', () => {
    const gs = createGameState({ bases: { first: true, second: true, third: true }, rules: { stochasticBaseRunning: false } })

    const result = applyEvent(gs, 'HR')

    expect(result).toBe('Home run (HR)')
    expect(gs.scoreAway).toBe(4)
    expect(gs.bases).toEqual({ first: false, second: false, third: false })
  })

  it('genera doble play rodado cuando el aleatorio cae en GB y el DP se concreta', () => {
    mockRandomSequence([0.3, 0.05])

    const gs = createGameState({ bases: { first: true }, outs: 0, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, 'OUT')

    expect(result).toBe('Rodado (GB) a Doble play')
    expect(gs.outs).toBe(2)
    expect(gs.bases.first).toBe(false)
  })

  it('coloca las bases llenas tras sencillo determinista', () => {
    const gs = createGameState({ bases: { first: true, second: true }, rules: { stochasticBaseRunning: false } })

    const result = applyEvent(gs, '1B')

    expect(result).toBe('Sencillo (1B)')
    expect(gs.scoreAway).toBe(0)
    expect(gs.bases).toEqual({ first: true, second: true, third: true })
  })

  it('anota dos carreras con doble determinista y bases llenas', () => {
    const gs = createGameState({ bases: { first: true, second: true, third: true }, rules: { stochasticBaseRunning: false } })

    const result = applyEvent(gs, '2B')

    expect(result).toBe('Doble (2B)')
    expect(gs.scoreAway).toBe(2)
    expect(gs.bases).toEqual({ first: false, second: true, third: true })
  })

  it('anota desde primera con triple determinista', () => {
    const gs = createGameState({ bases: { first: true }, rules: { stochasticBaseRunning: false } })

    const result = applyEvent(gs, '3B')

    expect(result).toBe('Triple (3B)')
    expect(gs.scoreAway).toBe(1)
    expect(gs.bases).toEqual({ first: false, second: false, third: true })
  })

  it('produce elevado de sacrificio cuando el FB permite anotar desde 3B', () => {
    mockRandomSequence([0.85, 0.01])

    const gs = createGameState({ bases: { third: true }, outs: 1, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, 'OUT')

    expect(result).toBe('Elevado de sacrificio (SF)')
    expect(gs.outs).toBe(2)
    expect(gs.scoreAway).toBe(1)
    expect(gs.bases.third).toBe(false)
  })

  it('sencillo estocástico permite anotar al corredor en 3B con probabilidad alta', () => {
    mockRandomSequence([0.1])

    const gs = createGameState({ bases: { third: true }, outs: 0, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, '1B')

    expect(result).toBe('Sencillo (1B)')
    expect(gs.scoreAway).toBe(1)
    expect(gs.bases).toEqual({ first: true, second: false, third: false })
  })

  it('sencillo estocástico con corredores en 1B y 2B empuja al de 1B a 3B', () => {
    mockRandomSequence([0.4, 0.9, 0.1])

    const gs = createGameState({ bases: { first: true, second: true }, outs: 0, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, '1B')

    expect(result).toBe('Sencillo (1B)')
    expect(gs.scoreAway).toBe(1)
    expect(gs.bases).toEqual({ first: true, second: false, third: true })
  })

  it('sencillo estocástico deja al corredor de 1B en 2B cuando no hay agresividad', () => {
    mockRandomSequence([0.9, 0.9])

    const gs = createGameState({ bases: { first: true }, outs: 0, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, '1B')

    expect(result).toBe('Sencillo (1B)')
    expect(gs.scoreAway).toBe(0)
    expect(gs.bases).toEqual({ first: true, second: true, third: false })
  })

  it('doble estocástico anota al corredor de primera si el random lo permite', () => {
    mockRandomSequence([0.1])

    const gs = createGameState({ bases: { first: true }, outs: 1, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, '2B')

    expect(result).toBe('Doble (2B)')
    expect(gs.scoreAway).toBe(1)
    expect(gs.bases).toEqual({ first: false, second: true, third: false })
  })

  it('doble estocástico coloca al corredor de primera en tercera si no anota', () => {
    mockRandomSequence([0.99, 0.2])

    const gs = createGameState({ bases: { first: true, third: true }, outs: 0, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, '2B')

    expect(result).toBe('Doble (2B)')
    expect(gs.scoreAway).toBe(1)
    expect(gs.bases).toEqual({ first: false, second: true, third: true })
  })

  it('sencillo estocástico con dos outs y bases llenas produce dos carreras forzadas', () => {
    mockRandomSequence([0.5, 0.5, 0.5])

    const gs = createGameState({ bases: { first: true, second: true, third: true }, outs: 2, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, '1B')

    expect(result).toBe('Sencillo (1B)')
    expect(gs.scoreAway).toBe(2)
    expect(gs.bases).toEqual({ first: true, second: true, third: false })
  })

  it('doble estocástico con dos outs y bases llenas deja corredores en 2B y 3B', () => {
    mockRandomSequence([0.95, 0.95, 0.4])

    const gs = createGameState({ bases: { first: true, second: true, third: true }, outs: 2, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, '2B')

    expect(result).toBe('Doble (2B)')
    expect(gs.scoreAway).toBe(2)
    expect(gs.bases).toEqual({ first: false, second: true, third: true })
  })

  it('triple estocástico con dos outs y bases llenas anota a todos', () => {
    const gs = createGameState({ bases: { first: true, second: true, third: true }, outs: 2, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, '3B')

    expect(result).toBe('Triple (3B)')
    expect(gs.scoreAway).toBe(3)
    expect(gs.bases).toEqual({ first: false, second: false, third: true })
  })
})
