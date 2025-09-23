import { describe, expect, it } from 'vitest'
import { eventProbsForHalf, type EventProbs, type TeamBatSlash, type TeamPitch } from '../baseball'

const lowBat: TeamBatSlash = { AVG: 0.18, OBP: 0.28, SLG: 0.32 }
const highBat: TeamBatSlash = { AVG: 0.32, OBP: 0.39, SLG: 0.55 }
const strongPitch: TeamPitch = { ERA: 2.6, WHIP: 1.05 }
const weakPitch: TeamPitch = { ERA: 5.8, WHIP: 1.45 }

describe('eventProbsForHalf', () => {
  it('usa el slash del equipo correcto según la mitad de entrada', () => {
    const home = { bat: highBat, pitch: strongPitch }
    const away = { bat: lowBat, pitch: weakPitch }

    const top = eventProbsForHalf('top', home, away)
    const bottom = eventProbsForHalf('bottom', home, away)

    expect(bottom['1B']).toBeGreaterThan(top['1B'])
    expect(top.OUT).toBeGreaterThan(bottom.OUT)
  })

  it('respeta homeAdvOnly al no aplicar factores al equipo visitante', () => {
    const home = { bat: highBat, pitch: strongPitch }
    const away = { bat: lowBat, pitch: weakPitch }

    const park = { runsPF: 1.2, hrPF: 1.3, homeAdvOnly: true } as const

    const topBaseline = eventProbsForHalf('top', home, away)
    const topWithPark = eventProbsForHalf('top', home, away, park)

    for (const key of Object.keys(topBaseline) as Array<keyof EventProbs>) {
      expect(topWithPark[key]).toBeCloseTo(topBaseline[key], 8)
    }
  })

  it('aplica factores del parque al home en la baja', () => {
    const home = { bat: highBat, pitch: strongPitch }
    const away = { bat: lowBat, pitch: weakPitch }

    const park = { runsPF: 1.2, hrPF: 1.3, homeAdvOnly: true } as const

    const bottomBaseline = eventProbsForHalf('bottom', home, away)
    const bottomWithPark = eventProbsForHalf('bottom', home, away, park)

    const baselineHits = bottomBaseline['1B'] + bottomBaseline['2B'] + bottomBaseline['3B'] + bottomBaseline.HR
    const adjustedHits = bottomWithPark['1B'] + bottomWithPark['2B'] + bottomWithPark['3B'] + bottomWithPark.HR

    expect(adjustedHits).toBeGreaterThan(baselineHits)
    expect(bottomWithPark.HR).toBeGreaterThan(bottomBaseline.HR)
    expect(bottomWithPark.OUT).toBeLessThan(bottomBaseline.OUT)
  })
})
