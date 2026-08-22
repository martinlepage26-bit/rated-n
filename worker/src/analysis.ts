import { analyzeExperience, generateRoles, isEngineUnavailable } from './ai';
import { EMPTY_DNA_SUMMARY, extractFromStory, groundRoles, sanitizeDna, scoreBreakdown, weightedScore, type DnaOutcome, type GroundedRole, type SanitizedDna } from './evidence';
import { ApiProblem } from './http';
import { discoverMarketSources } from './market';
import type { Env, MarketSource } from './types';

export type AnalysisOutcome =
  | { kind: 'empty'; dna: SanitizedDna; summary: string }
  | { kind: 'ready'; dna: SanitizedDna; roles: GroundedRole[] };

/**
 * "No capability evidence" is a verdict about the story, so it may only be
 * returned when the engine actually answered. When the engine never answered —
 * quota, outage, unusable output — an empty result is a failure of Rated N, and
 * publishing it as a finished analysis is how a real career story ends up
 * reported as a successful zero.
 */
export async function extractDna(env: Env, experience: string, region: string): Promise<DnaOutcome> {
  let engineFailure: unknown = null;
  try {
    const fromModel = sanitizeDna(await analyzeExperience(env, experience, region), experience);
    if (fromModel.kind === 'grounded') return fromModel;
  } catch (caught) {
    engineFailure = caught;
    console.error('extract_dna_model_failed', caught instanceof Error ? caught.message : String(caught));
  }
  const fromStory = sanitizeDna(extractFromStory(experience), experience);
  if (fromStory.kind === 'grounded') return fromStory;
  if (!engineFailure) return fromStory;
  if (isEngineUnavailable(engineFailure)) throw engineFailure;
  throw new ApiProblem(502, 'analysis_generation_failed', 'The analysis could not extract quoted capability evidence from this story. Please try again.');
}

function rolesFromPostings(sources: MarketSource[], dna: SanitizedDna, experience: string): GroundedRole[] {
  const evidenceItems = [...dna.competencies, ...dna.skills, ...dna.transferable];
  const quote = evidenceItems[0]?.evidence || experience.slice(0, 300);
  const strengths = evidenceItems.map((item) => item.name).filter(Boolean).slice(0, 8);
  return sources.slice(0, 10).map((source) => {
    const breakdown = scoreBreakdown({
      experience: 55,
      skills: dna.skills.length ? 45 : 0,
      competencies: dna.competencies.length + dna.transferable.length ? 50 : 0,
      education: dna.education.length ? 40 : 0,
      certifications: dna.certifications.length ? 40 : 0,
      preferences: dna.preferences.length ? 40 : 0
    }, dna);
    return {
      title: source.title,
      role_type: 'Adjacent',
      note: `A current public posting at ${source.employer} in ${source.location}.`,
      why_qualify: dna.summary,
      strengths: strengths.length ? strengths : ['Quoted professional experience'],
      gaps: [],
      transition_difficulty: 'Moderate',
      evidence_quote: quote.slice(0, 500),
      evidence_source: 'Your career story',
      path_steps: ['Review the posting requirements.', 'Match your quoted evidence to this role.', 'Apply and track the outcome.'],
      score_breakdown: breakdown,
      match_score: weightedScore(breakdown),
      market_evidence: `${source.title} at ${source.employer} in ${source.location}.`,
      market_sources: [{ title: source.title, employer: source.employer, location: source.location, url: source.url }],
      success_signal: 'A recruiter response or first interview.'
    };
  });
}

export async function matchRoles(env: Env, experience: string, dna: SanitizedDna, region: string): Promise<GroundedRole[]> {
  // One occupation the story actually names is a defensible search; padding it
  // out with sentence fragments only produces junk queries.
  if (!dna.search_titles.length) {
    throw new ApiProblem(502, 'analysis_generation_failed', 'The analysis could not derive a defensible role search. Please add more detail and try again.');
  }
  const sources = await discoverMarketSources(env, dna.search_titles, region);
  try {
    const generated = await generateRoles(env, experience, dna, sources, region);
    const roles = groundRoles(generated.roles, sources, dna, experience);
    if (roles.length >= 8) return roles.slice(0, 10);
  } catch (caught) {
    console.error('match_roles_model_failed', caught instanceof Error ? caught.message : String(caught));
  }
  const fromPostings = rolesFromPostings(sources, dna, experience);
  if (fromPostings.length >= 8) return fromPostings;
  throw new ApiProblem(502, 'analysis_generation_failed', 'The analysis did not produce enough distinct current opportunities. Please try again.');
}

export async function runAnalysis(env: Env, experience: string, region: string): Promise<AnalysisOutcome> {
  const sanitized = await extractDna(env, experience, region);
  if (sanitized.kind === 'empty') {
    return { kind: 'empty', dna: sanitized.dna, summary: EMPTY_DNA_SUMMARY };
  }
  return { kind: 'ready', dna: sanitized.dna, roles: await matchRoles(env, experience, sanitized.dna, region) };
}

export async function persistAnalysisOutcome(
  env: Env,
  input: { profileId: string; userId: string; region: string | null; outcome: AnalysisOutcome }
): Promise<void> {
  const ready = new Date().toISOString();
  if (input.outcome.kind === 'empty') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM role_matches WHERE profile_id = ? AND user_id = ?').bind(input.profileId, input.userId),
      env.DB.prepare(`UPDATE profiles SET status = 'ready', dna_summary = ?, competencies_count = 0, skills_count = 0, transferable_count = 0, dna_json = ?, error_message = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'analyzing'`)
        .bind(input.outcome.summary, JSON.stringify(input.outcome.dna), ready, input.profileId, input.userId)
    ]);
    return;
  }
  const statements = input.outcome.roles.map((role) => env.DB.prepare(`INSERT INTO role_matches (
      id, user_id, profile_id, title, role_type, match_score, note, why_qualify, strengths_json, gaps_json, transition_difficulty,
      evidence_quote, evidence_source, path_steps_json, score_breakdown_json, region, market_evidence, market_sources_json, success_signal, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), input.userId, input.profileId, role.title, role.role_type, role.match_score, role.note, role.why_qualify, JSON.stringify(role.strengths), JSON.stringify(role.gaps), role.transition_difficulty, role.evidence_quote, role.evidence_source, JSON.stringify(role.path_steps), JSON.stringify(role.score_breakdown), input.region, role.market_evidence, JSON.stringify(role.market_sources), role.success_signal, ready, ready));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM role_matches WHERE profile_id = ? AND user_id = ?').bind(input.profileId, input.userId),
    ...statements,
    env.DB.prepare(`UPDATE profiles SET status = 'ready', dna_summary = ?, competencies_count = ?, skills_count = ?, transferable_count = ?, dna_json = ?, error_message = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'analyzing'`)
      .bind(input.outcome.dna.summary, input.outcome.dna.competencies.length, input.outcome.dna.skills.length, input.outcome.dna.transferable.length, JSON.stringify(input.outcome.dna), ready, input.profileId, input.userId)
  ]);
}

export async function markAnalysisFailed(env: Env, profileId: string, userId: string, caught: unknown): Promise<void> {
  const message = caught instanceof Error ? caught.message.slice(0, 500) : 'Analysis failed';
  await env.DB.prepare(`UPDATE profiles SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'analyzing'`)
    .bind(message, new Date().toISOString(), profileId, userId).run();
}
