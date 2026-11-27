/** How long visitors' data is kept. Gallery runs and the owner's showcase drafts are kept. */
const days = (name: string, fallback: number) => {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const retention = () => ({
  /** Live runs: images and result page. */
  runDays: days('RETENTION_DAYS', 30),
  /** Visitors' demo-store drafts. */
  draftDays: days('DRAFT_RETENTION_DAYS', 7),
})
