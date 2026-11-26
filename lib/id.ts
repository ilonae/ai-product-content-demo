import { randomBytes } from 'node:crypto'

export const RUN_ID_RE = /^[A-Za-z0-9_-]{8,32}$/

/** 12-character URL-safe id for /r/<id> permalinks. */
export const newRunId = () => randomBytes(9).toString('base64url')
