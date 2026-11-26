import { getConfig } from '@/lib/config'
import { capacity, clientIp, getCounter, hashIp, remainingRuns } from '@/lib/guards'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Lets the page show "x of 2 runs left" or "at capacity" before anyone uploads. */
export async function GET(req: Request) {
  const cfg = getConfig()
  const max = cfg.maxRunsPerIpPerDay
  try {
    const c = getCounter()
    const { live } = await capacity(c, cfg)
    let remaining = max
    try {
      remaining = await remainingRuns(hashIp(clientIp(req.headers)), c, cfg)
    } catch {
      /* no salt configured: show the default */
    }
    return Response.json({ live, maxRunsPerIpPerDay: max, remaining, aiRetouch: cfg.aiRetouch }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ live: false, maxRunsPerIpPerDay: max, remaining: 0, aiRetouch: cfg.aiRetouch }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
