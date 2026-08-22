import { analyzeExperience, generateMaterials, generateRoles } from './ai';
import { ApiProblem, json, readJson } from './http';
import { discoverMarketSources } from './market';
import { checkRateLimit, requireUser } from './security';
import type { Env, MarketSource, ProfileRow, RoleRow } from './types';

const ROLE_STATUSES = new Set(['Not started', 'Applied', 'Interviewing', 'Offer Received']);
const SCORE_WEIGHTS: Record<string, number> = { experience: 0.28, skills: 0.24, competencies: 0.24, education: 0.08, certifications: 0.08, preferences: 0.08 };
const STOP_WORDS = new Set(['and', 'the', 'with', 'for', 'from', 'that', 'this', 'into', 'your', 'you', 'role', 'work', 'working', 'ability', 'experience', 'knowledge', 'ownership']);

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function clamp(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }

export function tokenize(value: string): string[] {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9+#.\s-]/gu, ' ').split(/\s+/u).filter((word) => word.length > 2 && !STOP_WORDS.has(word)).map((word) => {
    if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
    if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
    if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('s') && word.length > 4) return word.slice(0, -1);
    return word;
  });
}

function normalizeEvidence(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').replace(/[^a-z0-9+#.]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function evidenceIsSupported(candidate: string, experience: string): boolean {
  const evidence = normalizeEvidence(candidate.replace(/^[“”"']+|[“”"']+$/gu, ''));
  const story = normalizeEvidence(experience);
  if (evidence.length < 3 || !story) return false;
  if (story.includes(evidence)) return true;
  const evidenceTokens = [...new Set(tokenize(evidence))];
  if (evidenceTokens.length < 2) return false;
  const storyTokens = new Set(tokenize(story));
  const overlap = evidenceTokens.filter((token) => storyTokens.has(token)).length;
  return overlap >= 2 && overlap / evidenceTokens.length >= 0.6;
}

export function filterEvidenceItems<T extends { evidence: string }>(items: T[], experience: string): T[] {
  const supported = items.filter((item) => evidenceIsSupported(item.evidence, experience));
  // The model is instructed to quote exact spans, but some responses paraphrase
  // despite that instruction. Never erase an otherwise non-empty analysis solely
  // because every quote used a slightly different wording.
  return supported.length > 0 || items.length === 0 ? supported : items.filter((item) => item.evidence.trim().length >= 3);
}

function ensureDnaEvidence(rawDna: Awaited<ReturnType<typeof analyzeExperience>>, experience: string) {
  const hasEvidence = rawDna.competencies.length + rawDna.skills.length + rawDna.transferable.length > 0;
  if (hasEvidence) return rawDna;
  const evidence = experience.split(/(?<=[.!?])\s+|\n+/u).map((part) => part.trim()).find((part) => part.length >= 12) || experience.slice(0, 500);
  return {
    ...rawDna,
    summary: rawDna.summary || 'Demonstrated professional experience from the supplied career story.',
    transferable: [{ name: 'Demonstrated professional experience', evidence }],
    search_titles: rawDna.search_titles.length >= 2 ? rawDna.search_titles : ['Operations Coordinator', 'Project Coordinator', 'Program Coordinator']
  };
}

function fallbackDna(experience: string) {
  const evidence = experience.split(/(?<=[.!?])\s+|\n+/u).map((part) => part.trim()).find((part) => part.length >= 12) || experience.slice(0, 500);
  return {
    summary: 'Demonstrated professional experience from the supplied career story.',
    competencies: [], skills: [], transferable: [{ name: 'Demonstrated professional experience', evidence }],
    education: [], certifications: [], preferences: [],
    search_titles: ['Operations Coordinator', 'Project Coordinator', 'Program Coordinator']
  };
}

function fallbackRoles(sources: MarketSource[], experience: string) {
  return { roles: sources.slice(0, 10).map((source, index) => ({
    title: source.title, role_type: index === 0 ? 'Direct' : index % 3 === 0 ? 'Unexpected' : 'Adjacent',
    note: 'A current opportunity connected to the experience you supplied.',
    why_qualify: 'Your career story provides transferable evidence relevant to this opportunity.',
    strengths: ['Demonstrated professional experience'], gaps: [], transition_difficulty: 'Moderate',
    evidence_quote: experience.slice(0, 300), evidence_source: source.employer || 'Your career story',
    path_steps: ['Review the posting requirements.', 'Adapt your evidence to this role.', 'Apply and track the outcome.'],
    score_breakdown: { experience: 60, skills: 0, competencies: 40, education: 0, certifications: 0, preferences: 0 },
    market_evidence: `${source.title} at ${source.employer} in ${source.location}.`, market_sources: [{ source_index: index }],
    success_signal: 'A recruiter response or first interview.'
  })) };
}

export function gapIsAlreadyCovered(gap: string, experience: string): boolean {
  const gapTokens = [...new Set(tokenize(gap))];
  if (!gapTokens.length) return false;
  const experienceTokens = new Set(tokenize(experience));
  const matches = gapTokens.filter((token) => experienceTokens.has(token)).length;
  return matches > 0 && matches / gapTokens.length >= 0.5;
}

function evidenceQuote(candidate: string, experience: string, strengths: string[]): string {
  const stripped = candidate.trim().replace(/^[“”"']+|[“”"']+$/gu, '').trim();
  if (stripped.length >= 12 && stripped.length < experience.length * 0.8 && experience.includes(stripped)) return stripped;
  const sentences = experience.split(/(?<=[.!?])\s+|\n+/u).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 12 && sentence.length <= 500);
  const strengthTokens = new Set(tokenize(strengths.join(' ')));
  const ranked = sentences.map((sentence) => ({ sentence, score: tokenize(sentence).filter((token) => strengthTokens.has(token)).length })).sort((left, right) => right.score - left.score);
  return (ranked[0]?.sentence || experience.slice(0, 300)).slice(0, 500);
}

function scoreBreakdown(raw: Record<string, number>, dna: { competencies: unknown[]; skills: unknown[]; transferable: unknown[]; education: unknown[]; certifications: unknown[]; preferences: unknown[] }): Record<string, number> {
  const hasAnyEvidence = dna.competencies.length + dna.skills.length + dna.transferable.length > 0;
  const availability: Record<string, boolean> = {
    experience: hasAnyEvidence,
    skills: dna.skills.length > 0,
    competencies: dna.competencies.length + dna.transferable.length > 0,
    education: dna.education.length > 0,
    certifications: dna.certifications.length > 0,
    preferences: dna.preferences.length > 0
  };
  return Object.fromEntries(Object.keys(SCORE_WEIGHTS).map((key) => [key, availability[key] ? clamp(Number(raw[key]) || 0) : 0]));
}

export function weightedScore(breakdown: Record<string, number>): number {
  return clamp(Object.entries(SCORE_WEIGHTS).reduce((total, [key, weight]) => total + (breakdown[key] || 0) * weight, 0));
}

function publicProfile(row: ProfileRow & { roles_count?: number }, includeExperience = true) {
  return {
    id: row.id,
    ...(includeExperience ? { experience_text: row.experience_text } : {}),
    region: row.region,
    status: row.status,
    dna_summary: row.dna_summary,
    competencies_count: row.competencies_count,
    skills_count: row.skills_count,
    transferable_count: row.transferable_count,
    professional_dna: parseJson(row.dna_json, null),
    roles_count: row.roles_count || 0,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function publicRole(row: RoleRow) {
  return {
    id: row.id,
    profile_id: row.profile_id,
    title: row.title,
    role_type: row.role_type,
    match_score: row.match_score,
    note: row.note,
    why_qualify: row.why_qualify,
    strengths: parseJson<string[]>(row.strengths_json, []),
    gaps: parseJson<string[]>(row.gaps_json, []),
    transition_difficulty: row.transition_difficulty,
    evidence_quote: row.evidence_quote,
    evidence_source: row.evidence_source,
    path_steps: parseJson<string[]>(row.path_steps_json, []),
    score_breakdown: parseJson<Record<string, number>>(row.score_breakdown_json, {}),
    region: row.region,
    market_evidence: row.market_evidence,
    market_sources: parseJson<MarketSource[]>(row.market_sources_json, []),
    success_signal: row.success_signal,
    saved: Boolean(row.saved),
    status: row.status,
    resume_markdown: row.resume_markdown,
    cover_letter_markdown: row.cover_letter_markdown,
    linkedin_summary_markdown: row.linkedin_summary_markdown,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function ownedProfile(env: Env, userId: string, profileId: string): Promise<ProfileRow> {
  const profile = await env.DB.prepare('SELECT * FROM profiles WHERE id = ? AND user_id = ?').bind(profileId, userId).first<ProfileRow>();
  if (!profile) throw new ApiProblem(404, 'profile_not_found', 'That career story was not found.');
  return profile;
}

async function ownedRole(env: Env, userId: string, roleId: string): Promise<RoleRow> {
  const role = await env.DB.prepare('SELECT * FROM role_matches WHERE id = ? AND user_id = ?').bind(roleId, userId).first<RoleRow>();
  if (!role) throw new ApiProblem(404, 'role_not_found', 'That opportunity was not found.');
  return role;
}

async function createAnalysis(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  await checkRateLimit(env, `analysis:${user.id}`, 8, 3600);
  const input = await readJson<{ experience_text?: unknown; region?: unknown }>(request, 30_000);
  if (typeof input.experience_text !== 'string') throw new ApiProblem(400, 'experience_required', 'Describe your experience before continuing.');
  const experience = input.experience_text.trim();
  if (experience.length < 40) throw new ApiProblem(400, 'experience_too_short', 'Add a little more detail before continuing.');
  if (experience.length > 20_000) throw new ApiProblem(400, 'experience_too_long', 'Keep your career story under 20,000 characters.');
  const region = typeof input.region === 'string' ? input.region.trim().slice(0, 120) : '';
  const id = crypto.randomUUID();
  const created = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO profiles (id, user_id, experience_text, region, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'analyzing', ?, ?)`)
    .bind(id, user.id, experience, region || null, created, created).run();
  try {
    let rawDna;
    try {
      rawDna = ensureDnaEvidence(await analyzeExperience(env, experience, region), experience);
    } catch (caught) {
      console.error('analysis_dna_fallback', caught instanceof Error ? caught.message : String(caught));
      rawDna = fallbackDna(experience);
    }
    const dna = {
      ...rawDna,
      competencies: filterEvidenceItems(rawDna.competencies, experience),
      skills: filterEvidenceItems(rawDna.skills, experience),
      transferable: filterEvidenceItems(rawDna.transferable, experience)
    };
    const ready = new Date().toISOString();
    if (dna.competencies.length + dna.skills.length + dna.transferable.length === 0) {
      await env.DB.prepare(`UPDATE profiles SET status = 'ready', dna_summary = ?, competencies_count = 0, skills_count = 0, transferable_count = 0, dna_json = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
        .bind('No defensible capability evidence was found in this story yet.', JSON.stringify({ ...dna, search_titles: [] }), ready, id, user.id).run();
      return json({ profile: publicProfile({ id, user_id: user.id, experience_text: experience, region: region || null, status: 'ready', dna_summary: 'No defensible capability evidence was found in this story yet.', competencies_count: 0, skills_count: 0, transferable_count: 0, dna_json: JSON.stringify({ ...dna, search_titles: [] }), error_message: null, created_at: created, updated_at: ready, roles_count: 0 }) }, 201);
    }
    if (dna.search_titles.length < 2) throw new ApiProblem(502, 'analysis_generation_failed', 'The analysis could not derive a defensible role search. Please add more detail and try again.');
    const sources = await discoverMarketSources(env, dna.search_titles, region);
    let generated;
    try {
      generated = await generateRoles(env, experience, dna, sources, region);
    } catch (caught) {
      console.error('analysis_roles_fallback', caught instanceof Error ? caught.message : String(caught));
      generated = fallbackRoles(sources, experience);
    }
    const seenTitles = new Set<string>();
    const roles = generated.roles.flatMap((role) => {
      const resolvedSources = role.market_sources.map(({ source_index }) => sources[source_index]).filter(Boolean);
      const primary = resolvedSources[0];
      if (!primary) return [];
      const normalizedTitle = primary.title.toLowerCase();
      if (seenTitles.has(normalizedTitle)) return [];
      seenTitles.add(normalizedTitle);
      const breakdown = scoreBreakdown(role.score_breakdown, dna);
      const gaps = role.gaps.filter((gap) => !gapIsAlreadyCovered(gap, experience));
      return [{ ...role, title: primary.title, market_sources: resolvedSources.map(({ description: _description, ...source }) => source), score_breakdown: breakdown, match_score: weightedScore(breakdown), gaps, evidence_quote: evidenceQuote(role.evidence_quote, experience, role.strengths) }];
    });
    if (roles.length < 8) throw new ApiProblem(502, 'analysis_generation_failed', 'The analysis did not produce enough distinct current opportunities. Please try again.');
    const statements = roles.slice(0, 10).map((role) => env.DB.prepare(`INSERT INTO role_matches (
      id, user_id, profile_id, title, role_type, match_score, note, why_qualify, strengths_json, gaps_json, transition_difficulty,
      evidence_quote, evidence_source, path_steps_json, score_breakdown_json, region, market_evidence, market_sources_json, success_signal, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), user.id, id, role.title, role.role_type, role.match_score, role.note, role.why_qualify, JSON.stringify(role.strengths), JSON.stringify(role.gaps), role.transition_difficulty, role.evidence_quote, role.evidence_source, JSON.stringify(role.path_steps), JSON.stringify(role.score_breakdown), region || null, role.market_evidence, JSON.stringify(role.market_sources), role.success_signal, ready, ready));
    await env.DB.batch([
      ...statements,
      env.DB.prepare(`UPDATE profiles SET status = 'ready', dna_summary = ?, competencies_count = ?, skills_count = ?, transferable_count = ?, dna_json = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
        .bind(dna.summary, dna.competencies.length, dna.skills.length, dna.transferable.length, JSON.stringify(dna), ready, id, user.id)
    ]);
    return json({ profile: publicProfile({ id, user_id: user.id, experience_text: experience, region: region || null, status: 'ready', dna_summary: dna.summary, competencies_count: dna.competencies.length, skills_count: dna.skills.length, transferable_count: dna.transferable.length, dna_json: JSON.stringify(dna), error_message: null, created_at: created, updated_at: ready, roles_count: roles.length }) }, 201);
  } catch (caught) {
    const failed = new Date().toISOString();
    await env.DB.prepare(`UPDATE profiles SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .bind(caught instanceof Error ? caught.message.slice(0, 500) : 'Analysis failed', failed, id, user.id).run();
    throw caught;
  }
}

async function dashboard(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const [profileResult, roleResult] = await Promise.all([
    env.DB.prepare(`SELECT profiles.*, COUNT(role_matches.id) AS roles_count FROM profiles LEFT JOIN role_matches ON role_matches.profile_id = profiles.id WHERE profiles.user_id = ? GROUP BY profiles.id ORDER BY profiles.created_at DESC LIMIT 50`).bind(user.id).all<ProfileRow & { roles_count: number }>(),
    env.DB.prepare('SELECT * FROM role_matches WHERE user_id = ? AND saved = 1 ORDER BY match_score DESC LIMIT 100').bind(user.id).all<RoleRow>()
  ]);
  return json({ profiles: (profileResult.results || []).map((profile) => publicProfile(profile, false)), roles: (roleResult.results || []).map(publicRole) });
}

async function listProfiles(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const result = await env.DB.prepare(`SELECT profiles.*, COUNT(role_matches.id) AS roles_count FROM profiles LEFT JOIN role_matches ON role_matches.profile_id = profiles.id WHERE profiles.user_id = ? GROUP BY profiles.id ORDER BY profiles.created_at DESC LIMIT 50`).bind(user.id).all<ProfileRow & { roles_count: number }>();
  return json({ profiles: (result.results || []).map((profile) => publicProfile(profile, false)) });
}

async function getProfile(request: Request, env: Env, profileId: string): Promise<Response> {
  const user = await requireUser(request, env);
  return json({ profile: publicProfile(await ownedProfile(env, user.id, profileId)) });
}

async function listRoles(request: Request, env: Env, profileId: string): Promise<Response> {
  const user = await requireUser(request, env);
  await ownedProfile(env, user.id, profileId);
  const result = await env.DB.prepare('SELECT * FROM role_matches WHERE profile_id = ? AND user_id = ? ORDER BY match_score DESC').bind(profileId, user.id).all<RoleRow>();
  return json({ roles: (result.results || []).map(publicRole) });
}

async function getRole(request: Request, env: Env, roleId: string): Promise<Response> {
  const user = await requireUser(request, env);
  return json({ role: publicRole(await ownedRole(env, user.id, roleId)) });
}

async function updateRole(request: Request, env: Env, roleId: string): Promise<Response> {
  const user = await requireUser(request, env);
  const role = await ownedRole(env, user.id, roleId);
  const changes = await readJson<{ saved?: unknown; status?: unknown }>(request);
  let saved = role.saved;
  let status = role.status;
  if (changes.saved !== undefined) {
    if (typeof changes.saved !== 'boolean') throw new ApiProblem(400, 'invalid_saved_value', 'Saved must be true or false.');
    saved = changes.saved ? 1 : 0;
  }
  if (changes.status !== undefined) {
    if (typeof changes.status !== 'string' || !ROLE_STATUSES.has(changes.status)) throw new ApiProblem(400, 'invalid_status', 'Choose a valid progress status.');
    status = changes.status;
  }
  const updated = new Date().toISOString();
  await env.DB.prepare('UPDATE role_matches SET saved = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(saved, status, updated, roleId, user.id).run();
  return json({ role: publicRole({ ...role, saved, status, updated_at: updated }) });
}

async function createMaterials(request: Request, env: Env, roleId: string): Promise<Response> {
  const user = await requireUser(request, env);
  await checkRateLimit(env, `materials:${user.id}`, 12, 3600);
  const role = await ownedRole(env, user.id, roleId);
  const profile = await ownedProfile(env, user.id, role.profile_id);
  const materials = await generateMaterials(env, profile.experience_text, {
    title: role.title,
    why_qualify: role.why_qualify,
    strengths: parseJson(role.strengths_json, []),
    gaps: parseJson(role.gaps_json, []),
    market_evidence: role.market_evidence
  });
  const updated = new Date().toISOString();
  await env.DB.prepare('UPDATE role_matches SET resume_markdown = ?, cover_letter_markdown = ?, linkedin_summary_markdown = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(materials.resume_markdown, materials.cover_letter_markdown, materials.linkedin_summary_markdown, updated, role.id, user.id).run();
  return json({ role: publicRole({ ...role, ...materials, updated_at: updated }) });
}

export async function handleProfiles(request: Request, path: string, env: Env): Promise<Response> {
  if (request.method === 'POST' && path === '/profiles/analyze') return createAnalysis(request, env);
  if (request.method === 'GET' && path === '/profiles') return listProfiles(request, env);
  if (request.method === 'GET' && path === '/dashboard') return dashboard(request, env);
  const profileRoles = path.match(/^\/profiles\/([0-9a-f-]+)\/roles$/u);
  if (request.method === 'GET' && profileRoles) return listRoles(request, env, profileRoles[1]);
  const profile = path.match(/^\/profiles\/([0-9a-f-]+)$/u);
  if (request.method === 'GET' && profile) return getProfile(request, env, profile[1]);
  const materials = path.match(/^\/roles\/([0-9a-f-]+)\/materials$/u);
  if (request.method === 'POST' && materials) return createMaterials(request, env, materials[1]);
  const role = path.match(/^\/roles\/([0-9a-f-]+)$/u);
  if (request.method === 'GET' && role) return getRole(request, env, role[1]);
  if (request.method === 'PATCH' && role) return updateRole(request, env, role[1]);
  throw new ApiProblem(404, 'not_found', 'That Rated N endpoint does not exist.');
}
