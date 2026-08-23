import { ApiProblem } from './http';
import {
  dnaIsPopulated,
  dnaJsonSchema,
  materialsJsonSchema,
  materialsSchema,
  mergeDna,
  parseLooseDna,
  parseLooseRoles,
  rolesJsonSchema,
  type Dna,
  type GeneratedRole,
  type Materials
} from './schema';
import type { Env, MarketSource } from './types';

type ChatMessage = { role: 'system' | 'user'; content: string };
type Mode = 'json_object' | 'text' | 'json_schema';

/**
 * Constrained `json_schema` decoding degrades this model badly: on the same
 * story and prompt it returns an empty summary and empty capability arrays,
 * while `json_object` returns a complete extraction. A grammar-shaped blank was
 * the reason a real career story could come back as a successful zero, so the
 * grammar is now the last resort rather than the first call.
 */
const LADDER: Mode[] = ['json_object', 'text', 'json_schema'];

const ENGINE_UNAVAILABLE = 'analysis_engine_unavailable';
const GENERATION_FAILED = 'analysis_generation_failed';

function engineUnavailable(detail: string): ApiProblem {
  return new ApiProblem(503, ENGINE_UNAVAILABLE, 'The analysis engine is temporarily unavailable. Please try again shortly.', detail.slice(0, 200));
}

function generationFailed(): ApiProblem {
  return new ApiProblem(502, GENERATION_FAILED, 'The analysis engine returned an incomplete result. Please try again.');
}

export function isEngineUnavailable(caught: unknown): boolean {
  return caught instanceof ApiProblem && caught.code === ENGINE_UNAVAILABLE;
}

/** Model replies arrive as an object, as bare JSON, or as JSON wrapped in prose or fences. */
export function extractJson(value: unknown): unknown {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  let text = value.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callModel(env: Env, mode: Mode, messages: ChatMessage[], maxTokens: number, jsonSchema: object): Promise<unknown> {
  const model = env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const input: Record<string, unknown> = { messages, max_tokens: maxTokens, temperature: 0.15 };
  if (mode === 'json_object') input.response_format = { type: 'json_object' };
  if (mode === 'json_schema') input.response_format = { type: 'json_schema', json_schema: jsonSchema };
  const output = await env.AI.run(model as keyof AiModels, input as unknown as Parameters<Ai['run']>[1]);
  const response = output && typeof output === 'object' && 'response' in output ? (output as { response?: unknown }).response : output;
  return extractJson(response);
}

interface LadderOptions<T> {
  messages: (mode: Mode) => ChatMessage[];
  maxTokens: number;
  jsonSchema: object;
  parse: (candidate: unknown) => T | null;
  /** Combine a usable-but-incomplete attempt with what earlier attempts supplied. */
  merge?: (base: T | null, next: T) => T;
  accept: (candidate: T) => boolean;
  /** Return an unaccepted-but-parsed answer instead of failing. */
  allowPartial?: boolean;
  label: string;
}

/**
 * Walk the ladder until an attempt produces a usable answer. A binding-level
 * throw (neuron quota, upstream outage) is reported as an unavailable engine so
 * callers can fail honestly instead of publishing an empty result as success.
 */
async function runLadder<T>(env: Env, options: LadderOptions<T>): Promise<T> {
  let best: T | null = null;
  let bindingFailure = '';
  let contentFailure = '';
  for (const mode of LADDER) {
    let candidate: unknown;
    try {
      candidate = await callModel(env, mode, options.messages(mode), options.maxTokens, options.jsonSchema);
    } catch (caught) {
      bindingFailure = caught instanceof Error ? caught.message : String(caught);
      console.error(`${options.label}_binding_failed`, mode, bindingFailure);
      continue;
    }
    const parsed = candidate === null ? null : options.parse(candidate);
    if (!parsed) {
      contentFailure = `${mode}: unusable response`;
      continue;
    }
    best = options.merge ? options.merge(best, parsed) : parsed;
    if (options.accept(best)) return best;
    contentFailure = `${mode}: incomplete response`;
  }
  if (best && options.allowPartial) return best;
  console.error(`${options.label}_failed`, contentFailure || bindingFailure);
  if (bindingFailure && !contentFailure) throw engineUnavailable(bindingFailure);
  throw generationFailed();
}

const DNA_SYSTEM = `You are Rated N's evidence auditor. Extract only capabilities explicitly supported by the user's career story. Never infer a technology, credential, education, budget responsibility, or preference that is not stated. Every "evidence" value must be a short exact substring copied from the story.`;

const DNA_SHAPE = `Return one JSON object with exactly these keys:
"summary": one sentence describing this person's professional profile — never empty,
"competencies": array of {"name","evidence"},
"skills": array of {"name","evidence"},
"transferable": array of {"name","evidence"},
"education": array of strings,
"certifications": array of strings — include licences, tickets, permits and trade credentials, not only formal certificates,
"preferences": array of strings,
"search_titles": array of 2-6 job-search titles grounded in the extracted capabilities.
When the story describes any professional activity, populate competencies, skills and transferable with three to six entries each — cover every distinct area of work the story mentions, not just the first two. Empty arrays are only correct when the text contains no professional activity at all. Reply with the JSON object only: no commentary, no code fences.`;

export async function analyzeExperience(env: Env, experience: string, region: string): Promise<Dna> {
  const context = `Career story:\n${experience}\n\nPreferred market/location: ${region || 'Remote / not specified'}`;
  return runLadder<Dna>(env, {
    label: 'ai_dna',
    maxTokens: 4_000,
    jsonSchema: dnaJsonSchema,
    parse: parseLooseDna,
    merge: mergeDna,
    // A blank summary next to empty arrays is the grammar artifact, not a
    // finding. A written summary with no capabilities is a considered verdict
    // and is allowed through so a genuinely non-professional story can still
    // come back empty.
    accept: (dna) => dnaIsPopulated(dna) || dna.summary.trim().length > 0,
    messages: (mode) => {
      const messages: ChatMessage[] = [
        { role: 'system', content: DNA_SYSTEM },
        { role: 'user', content: context }
      ];
      // The grammar rung already pins the shape; the others have to be told it.
      if (mode !== 'json_schema') messages.push({ role: 'user', content: DNA_SHAPE });
      return messages;
    }
  });
}

const ROLES_SYSTEM = `You are Rated N's rigorous career-path analyst. Produce 8-10 distinct opportunities tied to the supplied current public job postings. Use exact or normalized titles from those postings, cite valid source indexes, and span Direct, Adjacent, Unexpected, and Stretch when evidence supports them. Score each breakdown dimension 0-100 as how strongly that part of the candidate's verified DNA supports THIS role. experience: depth and relevance of their work history to this posting. skills: overlap between their listed skills and the work described. competencies: overlap between their competencies and transferable capabilities and what this role demands. education: relevance of the education they list. certifications: relevance of the credentials, licences and tickets they already hold — a portable credential still counts where it transfers to this role, even when the posting does not name it. preferences: fit with their stated location and work preferences. Score 0 only where they have no evidence of that kind or none of it transfers. These are overlap judgements, never optimism. Gaps must be actual posting requirements absent from the career story—never list something the user already demonstrated. evidence_quote must be one short verbatim substring of the career story, not its whole text. Do not invent credentials, employers, achievements, or numbers. Market evidence must name concrete employers/locations or posting requirements from the supplied records.`;

const ROLES_SHAPE = `Return one JSON object shaped {"roles":[...]} with 8-10 entries. Each entry has exactly these keys:
"title" (string), "role_type" (one of Direct, Adjacent, Unexpected, Stretch), "note" (string),
"why_qualify" (string), "strengths" (1-8 strings), "gaps" (0-7 strings),
"transition_difficulty" (one of Low, Low–Moderate, Moderate, Moderate–High, High),
"evidence_quote" (short verbatim substring of the career story), "evidence_source" (string),
"path_steps" (3-5 strings),
"score_breakdown" {"experience","skills","competencies","education","certifications","preferences"} — each a number 0-100,
"market_evidence" (string), "market_sources" (1-4 entries of {"source_index": number}), "success_signal" (string).
Reply with the JSON object only: no commentary, no code fences.`;

export async function generateRoles(env: Env, experience: string, dna: Dna, sources: MarketSource[], region: string) {
  const sourceText = sources.map((source, index) => `[${index}] ${source.title} | ${source.employer} | ${source.location}\n${source.description || 'Public job card only; no description was available.'}`).join('\n\n');
  const context = `Career story:\n${experience}\n\nVerified Professional DNA:\n${JSON.stringify(dna)}\n\nRegion: ${region || 'Remote / not specified'}\n\nCurrent public job postings (cite these source indexes):\n${sourceText}`;
  return runLadder<{ roles: GeneratedRole[] }>(env, {
    label: 'ai_roles',
    maxTokens: 8_000,
    jsonSchema: rolesJsonSchema,
    parse: (candidate) => {
      const parsed = parseLooseRoles(candidate);
      if (!parsed) return null;
      // Salvage is silent otherwise, and a quietly thinned list is how a real
      // comparison decays into a constant without anything looking broken.
      if (parsed.dropped) console.error('ai_roles_entries_dropped', parsed.dropped, 'kept', parsed.roles.length);
      return parsed.roles.length ? { roles: parsed.roles } : null;
    },
    accept: (candidate) => candidate.roles.length >= 8,
    allowPartial: true,
    messages: (mode) => {
      const messages: ChatMessage[] = [
        { role: 'system', content: ROLES_SYSTEM },
        { role: 'user', content: context }
      ];
      if (mode !== 'json_schema') messages.push({ role: 'user', content: ROLES_SHAPE });
      return messages;
    }
  });
}

const MATERIALS_SHAPE = `Return one JSON object with exactly these keys, each a Markdown string: "resume_markdown", "cover_letter_markdown", "linkedin_summary_markdown". Reply with the JSON object only: no commentary, no code fences.`;

export async function generateMaterials(env: Env, experience: string, role: { title: string; why_qualify: string | null; strengths: string[]; gaps: string[]; market_evidence: string | null }): Promise<Materials> {
  const context = `Target role: ${role.title}\nWhy it fits: ${role.why_qualify || ''}\nStrengths: ${role.strengths.join(', ')}\nKnown gaps: ${role.gaps.join(', ')}\nMarket evidence: ${role.market_evidence || ''}\n\nCareer story:\n${experience}`;
  return runLadder<Materials>(env, {
    label: 'ai_materials',
    maxTokens: 7_000,
    jsonSchema: materialsJsonSchema,
    parse: (candidate) => {
      const parsed = materialsSchema.safeParse(candidate);
      return parsed.success ? parsed.data : null;
    },
    accept: () => true,
    allowPartial: true,
    messages: (mode) => {
      const messages: ChatMessage[] = [
        { role: 'system', content: `Create a targeted résumé, cover letter, and LinkedIn About summary in Markdown. Use only facts explicitly present in the supplied career story. Never invent names, employers, dates, metrics, degrees, credentials, tools, or accomplishments. Use neutral placeholders such as [Your name] only where essential. Address gaps honestly through positioning or a learning plan rather than pretending they are closed.` },
        { role: 'user', content: context }
      ];
      if (mode !== 'json_schema') messages.push({ role: 'user', content: MATERIALS_SHAPE });
      return messages;
    }
  });
}
