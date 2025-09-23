import { describe, expect, it } from 'vitest'
import { buffToRunsPF, ipGate, ipToOuts, withBuffedPitch } from '../eraBuff'

describe('ipToOuts', () => {
  it('convierte innings completos a outs', () => {
    expect(ipToOuts(6)).toBe(18)
    expect(ipToOuts(1)).toBe(3)
  })

  it('interpreta decimales .1 y .2 como tercios', () => {
    expect(ipToOuts(6.1)).toBe(19)
    expect(ipToOuts(2.2)).toBe(8)
  })

  it('aproxima otros decimales al tercio más cercano', () => {
    expect(ipToOuts(5.33)).toBe(16)
    expect(ipToOuts(4.7)).toBe(14)
  })

  it('retorna 0 para valores no positivos', () => {
    expect(ipToOuts(0)).toBe(0)
    expect(ipToOuts(-3)).toBe(0)
  })
})

describe('ipGate', () => {
  it('crece suavemente y se mantiene en el rango [0,1]', () => {
    expect(ipGate(0, 20)).toBe(0)
    expect(ipGate(20, 20)).toBeCloseTo(1 - Math.exp(-1), 5)
    expect(ipGate(120, 20)).toBeCloseTo(1, 2)
  })
})

describe('buffToRunsPF', () => {
  it('convierte buff en factor de carreras con límites de seguridad', () => {
    expect(buffToRunsPF(0.1)).toBeCloseTo(0.9, 5)
    expect(buffToRunsPF(0.8)).toBe(0.6)
    expect(buffToRunsPF(-0.9)).toBe(1.4)
  })
})

describe('withBuffedPitch', () => {
  it('aplica el buff al ERA respetando los clamps', () => {
    expect(withBuffedPitch({ ERA: 4.5 }, 0.1).ERA).toBeCloseTo(4.05, 5)
    expect(withBuffedPitch({ ERA: 20 }, -0.5).ERA).toBe(15)
    expect(withBuffedPitch({ ERA: 0.7 }, 0.8).ERA).toBe(0.5)
  })
})
