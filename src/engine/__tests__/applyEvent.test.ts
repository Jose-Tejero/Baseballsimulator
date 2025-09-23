import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RULES, applyEvent, type GameState, type Rules } from '../baseball'

type RulesWithToggle = Rules & { stochasticBaseRunning?: boolean }

type StateOverrides = Partial<GameState> & { rules?: Partial<RulesWithToggle> }

function createState(overrides: StateOverrides = {}): GameState {
  const rules: RulesWithToggle = { ...DEFAULT_RULES, stochasticBaseRunning: false }
  if (overrides.rules) {
    Object.assign(rules, overrides.rules)
  }

  const base: GameState = {
    inning: 1,
    half: 'top',
    outs: 0,
    bases: { first: false, second: false, third: false },
    scoreHome: 0,
    scoreAway: 0,
    status: { over: false, winner: null },
    rules,
  }

  return {
    ...base,
    ...overrides,
    bases: { ...base.bases, ...overrides.bases },
    status: overrides.status ?? base.status,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('applyEvent', () => {
  it('anota y mantiene las bases llenas con base por bolas', () => {
    const gs = createState({ bases: { first: true, second: true, third: true } })

    const result = applyEvent(gs, 'BB')

    expect(result).toBe('Base por bolas (BB)')
    expect(gs.scoreAway).toBe(1)
    expect(gs.bases).toEqual({ first: true, second: true, third: true })
    expect(gs.outs).toBe(0)
  })

  it('limpia las bases con un home run', () => {
    const gs = createState({ bases: { first: true, second: true, third: true } })

    const result = applyEvent(gs, 'HR')

    expect(result).toBe('Home run (HR)')
    expect(gs.scoreAway).toBe(4)
    expect(gs.bases).toEqual({ first: false, second: false, third: false })
  })

  it('genera doble play rodado cuando el aleatorio cae en GB y el DP se concreta', () => {
    vi.spyOn(Math, 'random')
      .mockImplementationOnce(() => 0.3) // rollOutType => GB
      .mockImplementationOnce(() => 0.05) // bernoulli(dpProb) => true

    const gs = createState({ bases: { first: true }, outs: 0, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, 'OUT')

    expect(result).toBe('Rodado (GB) a Doble play')
    expect(gs.outs).toBe(2)
    expect(gs.bases.first).toBe(false)
  })

  it('produce elevado de sacrificio cuando el FB permite anotar desde 3B', () => {
    vi.spyOn(Math, 'random')
      .mockImplementationOnce(() => 0.85) // rollOutType => FB
      .mockImplementationOnce(() => 0.01) // bernoulli(sfProb) => true

    const gs = createState({ bases: { third: true }, outs: 1, rules: { stochasticBaseRunning: true } })

    const result = applyEvent(gs, 'OUT')

    expect(result).toBe('Elevado de sacrificio (SF)')
    expect(gs.outs).toBe(2)
    expect(gs.scoreAway).toBe(1)
    expect(gs.bases.third).toBe(false)
  })
})
