import { z } from 'zod';

const evidenceItem = z.object({
  name: z.string().min(1).max(90),
  evidence: z.string().min(1).max(500)
});

export const dnaSchema = z.object({
  summary: z.string().min(1).max(500),
  competencies: z.array(evidenceItem).max(16),
  skills: z.array(evidenceItem).max(20),
  transferable: z.array(evidenceItem).max(16),
  education: z.array(z.string().min(1).max(160)).max(8),
  certifications: z.array(z.string().min(1).max(160)).max(8),
  preferences: z.array(z.string().min(1).max(160)).max(10),
  search_titles: z.array(z.string().min(2).max(100)).max(6)
});

export const scoreSchema = z.object({
  experience: z.number().min(0).max(100),
  skills: z.number().min(0).max(100),
  competencies: z.number().min(0).max(100),
  education: z.number().min(0).max(100),
  certifications: z.number().min(0).max(100),
  preferences: z.number().min(0).max(100)
});

export const marketSourceSchema = z.object({
  title: z.string(),
  employer: z.string(),
  location: z.string(),
  url: z.string(),
  description: z.string().optional()
});

const marketSourceIndexSchema = z.object({ source_index: z.number().int().min(0).max(13) });

export const generatedRoleSchema = z.object({
  title: z.string().min(2).max(120),
  role_type: z.enum(['Direct', 'Adjacent', 'Unexpected', 'Stretch']),
  note: z.string().min(1).max(240),
  why_qualify: z.string().min(1).max(900),
  strengths: z.array(z.string().min(1).max(100)).min(1).max(8),
  gaps: z.array(z.string().min(1).max(180)).max(7),
  transition_difficulty: z.enum(['Low', 'Low–Moderate', 'Moderate', 'Moderate–High', 'High']),
  evidence_quote: z.string().min(1).max(700),
  evidence_source: z.string().min(1).max(100),
  path_steps: z.array(z.string().min(1).max(260)).min(3).max(5),
  score_breakdown: scoreSchema,
  market_evidence: z.string().min(1).max(900),
  market_sources: z.array(marketSourceIndexSchema).min(1).max(4),
  success_signal: z.string().min(1).max(300)
});

export const rolesSchema = z.object({
  roles: z.array(generatedRoleSchema).min(8).max(10)
});

export const materialsSchema = z.object({
  resume_markdown: z.string().min(150).max(12_000),
  cover_letter_markdown: z.string().min(150).max(8_000),
  linkedin_summary_markdown: z.string().min(100).max(4_000)
});

export const stringListSchema = z.array(z.string());

export type Dna = z.infer<typeof dnaSchema>;
export type ScoreBreakdown = z.infer<typeof scoreSchema>;
export type GeneratedRole = z.infer<typeof generatedRoleSchema>;
export type Materials = z.infer<typeof materialsSchema>;

export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = toJsonSchema(value);
      required.push(key);
    }
    return { type: 'object', additionalProperties: false, properties, required };
  }
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: toJsonSchema(schema.element) };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: [...schema.options] };
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodOptional) return toJsonSchema(schema.unwrap());
  throw new Error(`Unsupported Zod type: ${schema.constructor.name}`);
}

export const dnaJsonSchema = toJsonSchema(dnaSchema);
export const rolesJsonSchema = toJsonSchema(rolesSchema);
export const materialsJsonSchema = toJsonSchema(materialsSchema);

// Without a JSON grammar the model answers in whatever shape it likes: an
// evidence item may arrive as {name, evidence}, as a bare capability string, or
// under a differently spelled key. Accept all of it, then let evidence.ts
// decide what is actually supported by the story.
const looseItem = z.union([
  z.object({
    name: z.string().min(1).max(90),
    evidence: z.string().min(1).max(500)
  }),
  z.string().min(1).max(500).transform((value) => ({ name: value.slice(0, 90), evidence: value }))
]);

const looseItems = z.array(looseItem).optional().default([]);
const looseStringList = z.array(z.union([z.string(), z.number()]).transform(String)).optional().default([]);

export const looseDnaSchema = z.object({
  summary: z.string().optional().default(''),
  competencies: looseItems,
  skills: looseItems,
  transferable: looseItems,
  education: looseStringList,
  certifications: looseStringList,
  preferences: looseStringList,
  search_titles: looseStringList
});

const KEY_ALIASES: Record<string, keyof Dna> = {
  capabilities: 'competencies',
  competences: 'competencies',
  hard_skills: 'skills',
  technical_skills: 'skills',
  transferable_skills: 'transferable',
  transferrable: 'transferable',
  job_titles: 'search_titles',
  titles: 'search_titles'
};

function withAliases(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  const mapped: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    const normalized = key.replace(/^_+/u, '').toLowerCase();
    const target = normalized in KEY_ALIASES ? KEY_ALIASES[normalized] : normalized;
    if (mapped[target] === undefined) mapped[target] = entry;
  }
  return mapped;
}

export function parseLooseDna(value: unknown): Dna | null {
  const parsed = looseDnaSchema.safeParse(withAliases(value));
  if (!parsed.success) return null;
  return {
    summary: parsed.data.summary.trim().slice(0, 500),
    competencies: parsed.data.competencies.slice(0, 16),
    skills: parsed.data.skills.slice(0, 20),
    transferable: parsed.data.transferable.slice(0, 16),
    education: parsed.data.education.filter((item) => item.trim().length > 0).slice(0, 8),
    certifications: parsed.data.certifications.filter((item) => item.trim().length > 0).slice(0, 8),
    preferences: parsed.data.preferences.filter((item) => item.trim().length > 0).slice(0, 10),
    search_titles: parsed.data.search_titles.filter((item) => item.trim().length >= 2).slice(0, 6)
  };
}

export function dnaIsPopulated(dna: Dna): boolean {
  return dna.competencies.length + dna.skills.length + dna.transferable.length > 0;
}

/**
 * One attempt often answers half the contract: the constrained call returns
 * education and titles with no capabilities, the free-form call returns
 * capabilities with no titles. Keep whatever each attempt did supply instead of
 * discarding a partial answer and reporting nothing.
 */
export function mergeDna(base: Dna | null, next: Dna): Dna {
  if (!base) return next;
  const byName = <T extends { name: string }>(left: T[], right: T[]): T[] => {
    const seen = new Set(left.map((item) => item.name.trim().toLowerCase()));
    return [...left, ...right.filter((item) => !seen.has(item.name.trim().toLowerCase()))];
  };
  const unique = (left: string[], right: string[]): string[] => [...new Set([...left, ...right])];
  return {
    summary: base.summary || next.summary,
    competencies: byName(base.competencies, next.competencies).slice(0, 16),
    skills: byName(base.skills, next.skills).slice(0, 20),
    transferable: byName(base.transferable, next.transferable).slice(0, 16),
    education: unique(base.education, next.education).slice(0, 8),
    certifications: unique(base.certifications, next.certifications).slice(0, 8),
    preferences: unique(base.preferences, next.preferences).slice(0, 10),
    search_titles: unique(base.search_titles, next.search_titles).slice(0, 6)
  };
}

// The AI layer accepts a short list so a partial answer can still contribute;
// analysis.ts holds the real "enough distinct opportunities" gate.
export const looseRolesSchema = z.object({
  roles: z.array(generatedRoleSchema).min(1).max(10)
});
