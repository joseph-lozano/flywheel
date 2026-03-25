import { describe, it, expect } from 'vitest'
import { easeOut, lerp } from '../../src/renderer/src/scroll/animator'

describe('easeOut', () => {
  it('returns 0 at t=0', () => { expect(easeOut(0)).toBe(0) })
  it('returns 1 at t=1', () => { expect(easeOut(1)).toBe(1) })
  it('progresses faster at the start', () => {
    const early = easeOut(0.3)
    const late = easeOut(0.7) - easeOut(0.4)
    expect(early).toBeGreaterThan(late)
  })
  it('is monotonically increasing', () => {
    let prev = 0
    for (let t = 0.1; t <= 1.0; t += 0.1) {
      const val = easeOut(t)
      expect(val).toBeGreaterThan(prev)
      prev = val
    }
  })
})

describe('lerp', () => {
  it('returns from at t=0', () => { expect(lerp(100, 200, 0)).toBe(100) })
  it('returns to at t=1', () => { expect(lerp(100, 200, 1)).toBe(200) })
  it('returns midpoint at t=0.5', () => { expect(lerp(100, 200, 0.5)).toBe(150) })
  it('works with negative values', () => { expect(lerp(-100, 100, 0.5)).toBe(0) })
})
