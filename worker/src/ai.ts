import { z } from 'zod';
import { ApiProblem } from './http';
import type { Env, MarketSource } from './types';

const evidenceItem = z.object({ name: z.string().min(1).max(90), evidence: z.string().min(1).max(500) });
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

const scoreSchema = z.object({
  experience: z.number().min(0).max(100),
  skills: z.number().min(0).max(100),
  competencies: z.number().min(0).max(100),
  education: z.number().min(0).max(100),
  certifications: z.number().min(0).max(100),
  preferences: z.number().min(0).max(100)
});

const marketSourceSchema = z.object({ source_index: z.number().int().min(0).max(13) });
export const rolesSchema = z.object({ roles: z.array(z.object({
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
  market_sources: z.array(marketSourceSchema).min(1).max(4),
  success_signal: z.string().min(1).max(300)
})).min(8).max(10) });

export const materialsSchema = z.object({
  resume_markdown: z.string().min(150).max(12_000),
  cover_letter_markdown: z.string().min(150).max(8_000),
  linkedin_summary_markdown: z.string().min(100).max(4_000)
});

const dnaJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    competencies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, evidence: { type: 'string' } }, required: ['name', 'evidence'] } },
    skills: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, evidence: { type: 'string' } }, required: ['name', 'evidence'] } },
    transferable: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, evidence: { type: 'string' } }, required: ['name', 'evidence'] } },
    education: { type: 'array', items: { type: 'string' } }, certifications: { type: 'array', items: { type: 'string' } }, preferences: { type: 'array', items: { type: 'string' } }, search_titles: { type: 'array', items: { type: 'string' } }
  },
  required: ['summary', 'competencies', 'skills', 'transferable', 'education', 'certifications', 'preferences', 'search_titles']
};

const roleItemJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, role_type: { type: 'string', enum: ['Direct', 'Adjacent', 'Unexpected', 'Stretch'] }, note: { type: 'string' }, why_qualify: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } }, gaps: { type: 'array', items: { type: 'string' } },
    transition_difficulty: { type: 'string', enum: ['Low', 'Low–Moderate', 'Moderate', 'Moderate–High', 'High'] }, evidence_quote: { type: 'string' }, evidence_source: { type: 'string' },
    path_steps: { type: 'array', items: { type: 'string' } },
    score_breakdown: { type: 'object', additionalProperties: false, properties: { experience: { type: 'number' }, skills: { type: 'number' }, competencies: { type: 'number' }, education: { type: 'number' }, certifications: { type: 'number' }, preferences: { type: 'number' } }, required: ['experience', 'skills', 'competencies', 'education', 'certifications', 'preferences'] },
    market_evidence: { type: 'string' }, market_sources: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { source_index: { type: 'number' } }, required: ['source_index'] } }, success_signal: { type: 'string' }
  },
  required: ['title', 'role_type', 'note', 'why_qualify', 'strengths', 'gaps', 'transition_difficulty', 'evidence_quote', 'evidence_source', 'path_steps', 'score_breakdown', 'market_evidence', 'market_sources', 'success_signal']
};

const rolesJsonSchema = { type: 'object', additionalProperties: false, properties: { roles: { type: 'array', items: roleItemJsonSchema } }, required: ['roles'] };
const materialsJsonSchema = { type: 'object', additionalProperties: false, properties: { resume_markdown: { type: 'string' }, cover_letter_markdown: { type: 'string' }, linkedin_summary_markdown: { type: 'string' } }, required: ['resume_markdown', 'cover_letter_markdown', 'linkedin_summary_markdown'] };

async function runStructured<T>(env: Env, schema: z.ZodType<T>, jsonSchema: object, messages: Array<{ role: 'system' | 'user'; content: string }>, maxTokens: number): Promise<T> {
  const model = env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  let lastFailure = 'invalid structured response';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const output = await env.AI.run(model as keyof AiModels, {
        messages: attempt === 0 ? messages : [...messages, { role: 'user', content: 'Return a complete JSON object that follows every required field and array-size constraint exactly. Do not include commentary.' }],
        max_tokens: maxTokens,
        temperature: 0.15,
        response_format: { type: 'json_schema', json_schema: jsonSchema }
      } as never) as { response?: unknown };
      const candidate = typeof output.response === 'string' ? JSON.parse(output.response) : output.response;
      const parsed = schema.safeParse(candidate);
      if (parsed.success) return parsed.data;
      lastFailure = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).slice(0, 5).join('; ');
    } catch (caught) {
      lastFailure = caught instanceof Error ? caught.message : String(caught);
    }
  }
  console.error('ai_structured_output_failed', lastFailure);
  throw new ApiProblem(502, 'analysis_generation_failed', 'The analysis engine returned an incomplete result. Please try again.');
}

export async function analyzeExperience(env: Env, experience: string, region: string) {
  return runStructured(env, dnaSchema, dnaJsonSchema, [
    { role: 'system', content: `You are Rated N's evidence auditor. Extract only capabilities explicitly supported by the user's career story. Never infer a technology, credential, education, budget responsibility, or preference not stated. Evidence must quote a short exact span from the story. search_titles must contain 2–6 plausible job-search titles grounded in demonstrated capability, or an empty array when no capability evidence exists. Empty arrays are correct when evidence is absent.` },
    { role: 'user', content: `Career story:\n${experience}\n\nPreferred market/location: ${region || 'Remote / not specified'}` }
  ], 4_000);
}

export async function generateRoles(env: Env, experience: string, dna: z.infer<typeof dnaSchema>, sources: MarketSource[], region: string) {
  const sourceText = sources.map((source, index) => `[${index}] ${source.title} | ${source.employer} | ${source.location}\n${source.description || 'Public job card only; no description was available.'}`).join('\n\n');
  return runStructured(env, rolesSchema, rolesJsonSchema, [
    { role: 'system', content: `You are Rated N's rigorous career-path analyst. Produce 8–10 distinct opportunities tied to the supplied current public job postings. Use exact or normalized titles from those postings, cite valid source indexes, and span Direct, Adjacent, Unexpected, and Stretch when evidence supports them. Scores are evidence overlap, never optimism: each breakdown dimension is 0–100, and missing evidence is 0. Gaps must be actual posting requirements absent from the career story—never list something the user already demonstrated. evidence_quote must be one short verbatim substring of the career story, not its whole text. Do not invent credentials, employers, achievements, or numbers. Market evidence must name concrete employers/locations or posting requirements from the supplied records.` },
    { role: 'user', content: `Career story:\n${experience}\n\nVerified Professional DNA:\n${JSON.stringify(dna)}\n\nRegion: ${region || 'Remote / not specified'}\n\nCurrent public job postings:\n${sourceText}` }
  ], 8_000);
}

export async function generateMaterials(env: Env, experience: string, role: { title: string; why_qualify: string | null; strengths: string[]; gaps: string[]; market_evidence: string | null }) {
  return runStructured(env, materialsSchema, materialsJsonSchema, [
    { role: 'system', content: `Create a targeted résumé, cover letter, and LinkedIn About summary in Markdown. Use only facts explicitly present in the supplied career story. Never invent names, employers, dates, metrics, degrees, credentials, tools, or accomplishments. Use neutral placeholders such as [Your name] only where essential. Address gaps honestly through positioning or a learning plan rather than pretending they are closed.` },
    { role: 'user', content: `Target role: ${role.title}\nWhy it fits: ${role.why_qualify || ''}\nStrengths: ${role.strengths.join(', ')}\nKnown gaps: ${role.gaps.join(', ')}\nMarket evidence: ${role.market_evidence || ''}\n\nCareer story:\n${experience}` }
  ], 7_000);
}
