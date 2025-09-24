import { vi } from 'vitest'
import {
  DEFAULT_RULES,
  initialState,
  type EventProbs,
  type GameState,
  type Rules,
} from '../engine/baseball'

type RulesWithToggles = Rules & { stochasticBaseRunning?: boolean }
export type GameStateOverrides = Partial<Omit<GameState, 'bases' | 'rules' | 'status'>> & {
  bases?: Partial<GameState['bases']>
  rules?: Partial<RulesWithToggles>
  status?: GameState['status']
}

const DEFAULT_EVENT_PROBS: EventProbs = {
  OUT: 0.7,
  BB: 0.08,
  HBP: 0.02,
  '1B': 0.12,
  '2B': 0.04,
  '3B': 0.01,
  HR: 0.03,
}

export function createEventProbs(overrides: Partial<EventProbs> = {}): EventProbs {
  return { ...DEFAULT_EVENT_PROBS, ...overrides }
}

export function createGameState(overrides: GameStateOverrides = {}): GameState {
  const baseRules: RulesWithToggles = {
    ...((initialState.rules as RulesWithToggles | undefined) ?? DEFAULT_RULES),
  }
  if (overrides.rules) Object.assign(baseRules, overrides.rules)

  const status = overrides.status ? { ...overrides.status } : { ...initialState.status }

  return {
    ...initialState,
    ...overrides,
    bases: { ...initialState.bases, ...overrides.bases },
    rules: baseRules,
    status,
  }
}

export function mockRandomSequence(values: number[], fallback = 0.999) {
  const queue = [...values]
  return vi.spyOn(Math, 'random').mockImplementation(() => {
    if (queue.length === 0) return fallback
    const value = queue.shift()
    return typeof value === 'number' ? value : fallback
  })
}
