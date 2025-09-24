import { afterEach, describe, expect, it, vi } from 'vitest'
import { rollEventFromProbs } from '../baseball'
import { createEventProbs, mockRandomSequence } from '../../test/factories'

const baseProbs = createEventProbs({ OUT: 0.7, BB: 0.2, HBP: 0, '1B': 0.1, '2B': 0, '3B': 0, HR: 0 })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('rollEventFromProbs', () => {
  it('devuelve el evento con probabilidad positiva aunque sea el único', () => {
    const event = rollEventFromProbs(createEventProbs({ OUT: 0, BB: 0, HBP: 0, '1B': 0, '2B': 0, '3B': 0, HR: 1 }))

    expect(event).toBe('HR')
  })

  it('selecciona el evento correspondiente al intervalo generado', () => {
    mockRandomSequence([0, 0.8, 0.95])

    expect(rollEventFromProbs(baseProbs)).toBe('OUT')
    expect(rollEventFromProbs(baseProbs)).toBe('BB')
    expect(rollEventFromProbs(baseProbs)).toBe('1B')
  })

  it('retorna OUT si todas las probabilidades son cero o negativas', () => {
    mockRandomSequence([0.42])

    expect(rollEventFromProbs(createEventProbs({ OUT: 0, BB: 0, HBP: 0, '1B': 0, '2B': 0, '3B': 0, HR: 0 }))).toBe('OUT')
  })
})
