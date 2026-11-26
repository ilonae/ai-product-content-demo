import { getStore } from '../store'
import type { Connector, ProductPayload } from './types'

/**
 * The built-in demo store: a sandbox "shop" inside this app (page /store). Every visitor can
 * publish here, so the full publish flow is visible without anyone's real store credentials.
 */
export const demoStore: Connector = {
  id: 'demo',
  label: 'Demo store',
  ownerOnly: false,
  configured: () => true,
  async publish(p: ProductPayload) {
    if (!p.sourceRunId) throw new Error('Demo store needs the run id.')
    const { image: _image, ...product } = p
    await getStore().saveDemoProduct({ runId: p.sourceRunId, createdAt: new Date().toISOString(), lang: p.lang ?? 'en', product })
    return { connector: 'demo', externalId: p.sourceRunId, adminUrl: `/store#${p.sourceRunId}` }
  },
}
