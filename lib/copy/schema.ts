import { z } from 'zod'

const perLang = <T extends z.ZodTypeAny>(t: T) => z.object({ de: t, en: t, es: t })

/** Kept free of length constraints so it maps cleanly onto structured-output JSON schemas; limits are in the prompt. */
export const CopySchema = z.object({
  name: z.string(),
  descriptions: perLang(z.string()),
  bullets: perLang(z.array(z.string())),
  seo: perLang(z.object({ title: z.string(), description: z.string() })),
  tags: z.array(z.string()),
  altText: z.string(),
})
