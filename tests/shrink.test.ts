import { describe, expect, it } from 'vitest'
import { fitWithin } from '@/lib/shrink-client'

describe('client-side shrink', () => {
  it('fits the longest side inside the limit and keeps the aspect ratio', () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(3000, 6000, 2048)).toEqual({ width: 1024, height: 2048 })
  })

  it('never enlarges a small photo', () => {
    expect(fitWithin(1200, 900, 2048)).toEqual({ width: 1200, height: 900 })
  })
})
