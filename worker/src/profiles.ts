import { z } from 'zod';
import { generateMaterials } from './ai';
import { markAnalysisFailed } from './analysis';
import { ApiProblem, json, readJson } from './http';
import { dnaSchema, marketSourceSchema, materialsSchema, stringListSchema } from './schema';
import { checkRateLimit, requireUser } from './security';
import type { Env, ProfileRow, RoleRow } from './types';

const ROLE_STATUSES = new Set(['Not started', 'Applied', 'Interviewing', 'Offer Received']);
const storedSourcesSchema = z.array(marketSourceSchema);
const PROFILE_SELECT = `SELECT profiles.*, COUNT(role_matches.id) AS roles_count
  FROM profiles LEFT JOIN role_matches ON role_matches.profile_id = profiles.id
  WHERE profiles.user_id = ? GROUP BY profiles.id ORDER BY profiles.created_at DESC LIMIT 50`;

function parseJson<T>(raw: string | null, schema: z.ZodType<T>, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

function parseOptionalJson<T>(raw: string | null, schema: z.ZodType<T>): T | null {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
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
    professional_dna: parseOptionalJson(row.dna_json, dnaSchema),
    error_message: row.error_message,
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
    strengths: parseJson(row.strengths_json, stringListSchema, []),
    gaps: parseJson(row.gaps_json, stringListSchema, []),
    transition_difficulty: row.transition_difficulty,
    evidence_quote: row.evidence_quote,
    evidence_source: row.evidence_source,
    path_steps: parseJson(row.path_steps_json, stringListSchema, []),
    score_breakdown: parseJson(row.score_breakdown_json, z.record(z.number()), {}),
    region: row.region,
    market_evidence: row.market_evidence,
    market_sources: parseJson(row.market_sources_json, storedSourcesSchema, []),
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

async function loadPublicProfile(env: Env, userId: string, profileId: string, includeExperience = true) {
  const row = await env.DB.prepare(`SELECT profiles.*, COUNT(role_matches.id) AS roles_count
    FROM profiles LEFT JOIN role_matches ON role_matches.profile_id = profiles.id
    WHERE profiles.id = ? AND profiles.user_id = ? GROUP BY profiles.id`)
    .bind(profileId, userId).first<ProfileRow & { roles_count: number }>();
  if (!row) throw new ApiProblem(404, 'profile_not_found', 'That career story was not found.');
  return publicProfile(row, includeExperience);
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
    await env.ANALYSIS.create({ id, params: { profileId: id, userId: user.id } });
  } catch (caught) {
    await markAnalysisFailed(env, id, user.id, caught);
    throw new ApiProblem(503, 'analysis_queue_unavailable', 'Live analysis could not be started. Please try again shortly.');
  }
  return json({ profile: await loadPublicProfile(env, user.id, id) }, 202);
}

async function dashboard(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const [profileResult, roleResult] = await Promise.all([
    env.DB.prepare(PROFILE_SELECT).bind(user.id).all<ProfileRow & { roles_count: number }>(),
    env.DB.prepare('SELECT * FROM role_matches WHERE user_id = ? AND saved = 1 ORDER BY match_score DESC LIMIT 100').bind(user.id).all<RoleRow>()
  ]);
  return json({ profiles: (profileResult.results || []).map((profile) => publicProfile(profile, false)), roles: (roleResult.results || []).map(publicRole) });
}

async function listProfiles(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const result = await env.DB.prepare(PROFILE_SELECT).bind(user.id).all<ProfileRow & { roles_count: number }>();
  return json({ profiles: (result.results || []).map((profile) => publicProfile(profile, false)) });
}

async function getProfile(request: Request, env: Env, profileId: string): Promise<Response> {
  const user = await requireUser(request, env);
  return json({ profile: await loadPublicProfile(env, user.id, profileId) });
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
  const materials = materialsSchema.parse(await generateMaterials(env, profile.experience_text, {
    title: role.title,
    why_qualify: role.why_qualify,
    strengths: parseJson(role.strengths_json, stringListSchema, []),
    gaps: parseJson(role.gaps_json, stringListSchema, []),
    market_evidence: role.market_evidence
  }));
  const updated = new Date().toISOString();
  await env.DB.prepare('UPDATE role_matches SET resume_markdown = ?, cover_letter_markdown = ?, linkedin_summary_markdown = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(materials.resume_markdown, materials.cover_letter_markdown, materials.linkedin_summary_markdown, updated, role.id, user.id).run();
  return json({ role: publicRole(await ownedRole(env, user.id, roleId)) });
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
