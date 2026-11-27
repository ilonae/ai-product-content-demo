import { getStore } from '../store'
import type { Connector, ProductPayload, PublishContext } from './types'

/**
 * The built-in demo store: a sandbox "shop" inside this app (page /store). Every visitor can
 * publish here, so the full publish flow is visible without anyone's real store credentials.
 * Each visitor sees only their own drafts plus the owner's showcase drafts.
 */
export const demoStore: Connector = {
  id: 'demo',
  label: 'Demo store',
  ownerOnly: false,
  configured: () => true,
  async publish(p: ProductPayload, ctx?: PublishContext) {
    if (!p.sourceRunId) throw new Error('Demo store needs the run id.')
    if (!ctx?.visitor) throw new Error('Demo store needs the visitor.')
    const { image: _image, ...product } = p
    await getStore().saveDemoProduct({ runId: p.sourceRunId, visitor: ctx.visitor, createdAt: new Date().toISOString(), lang: p.lang ?? 'en', product })
    return { connector: 'demo', externalId: p.sourceRunId, adminUrl: `/store#${p.sourceRunId}` }
  },
}
