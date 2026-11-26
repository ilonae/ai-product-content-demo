import { demoStore } from './demo'
import { shopify } from './shopify'
import type { Connector } from './types'
import { webhook } from './webhook'
import { woocommerce } from './woocommerce'

/** Add a CMS by implementing `Connector` and registering it here. */
export const CONNECTORS: Connector[] = [demoStore, shopify, woocommerce, webhook]

export const findConnector = (id: string) => CONNECTORS.find((c) => c.id === id)

export { toCsv } from './csv'
export { payloadFromRun } from './payload'
export type { Connector, ProductPayload, PublishResult } from './types'
