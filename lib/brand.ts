export interface BrandProfile {
  id: string
  name: string
  bio: string
  tone: string
  /** Two sentences in the brand's voice (English); the model matches the rhythm, not the content. */
  voiceExample?: string
  /** How product names are built for this brand. */
  nameStyle?: string
  avoid: string[]
}

/** SFW example brands. A visitor can also paste their own company bio. */
export const BRAND_PRESETS: BrandProfile[] = [
  {
    id: 'nordhaus',
    name: 'Nordhaus',
    bio: 'Scandinavian home goods made to be used every day for decades. Small batches, honest materials, no trends.',
    tone: 'calm, precise and warm; short sentences; no exclamation marks',
    voiceExample: 'Thrown on the wheel and glazed twice. It sits on the windowsill for years and never asks for attention.',
    nameStyle: 'colour or form + material + product, e.g. "Deep Blue Stoneware Vase"',
    avoid: ['luxury', 'must-have', 'stunning'],
  },
  {
    id: 'trailmark',
    name: 'Trailmark',
    bio: 'Outdoor gear tested on long-distance trails. Every gram has to earn its place in the pack.',
    tone: 'direct and practical, with a little dry humour',
    voiceExample: 'Fifty grams lighter than last year. You will notice it on the last climb, not in the shop.',
    nameStyle: 'key property + product, e.g. "Lightweight Trail Runner" or "24 h Insulated Bottle"',
    avoid: ['epic', 'ultimate', 'game-changer'],
  },
  {
    id: 'kaffeewerk',
    name: 'Kaffeewerk Berlin',
    bio: 'Specialty coffee roastery and brewing-equipment shop from Berlin-Neukölln.',
    tone: 'confident and sensory, knowledgeable without snobbery',
    voiceExample: 'Medium roast with notes of cocoa and dried cherry. Brew it slowly, or don’t; it forgives.',
    nameStyle: 'what it is + one sensory or technical detail, e.g. "Gooseneck Kettle, Matte Black"',
    avoid: ['perfect cup', 'barista-quality'],
  },
]

export const MAX_BIO = 600

export function resolveBrand(presetId?: string, customBio?: string): BrandProfile {
  const base = BRAND_PRESETS.find((b) => b.id === presetId) ?? BRAND_PRESETS[0]
  const bio = customBio?.trim()
  if (!bio) return base
  return { id: 'custom', name: 'Your brand', bio: bio.slice(0, MAX_BIO), tone: 'match the voice of the bio', avoid: [] }
}
