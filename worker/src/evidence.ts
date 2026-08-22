import type { Dna, GeneratedRole, ScoreBreakdown } from './schema';
import type { MarketSource } from './types';

export const SCORE_WEIGHTS: Record<keyof ScoreBreakdown, number> = {
  experience: 0.28,
  skills: 0.24,
  competencies: 0.24,
  education: 0.08,
  certifications: 0.08,
  preferences: 0.08
};

export const EMPTY_DNA_SUMMARY = 'No defensible capability evidence was found in this story yet.';

const STOP_WORDS = new Set(['and', 'the', 'with', 'for', 'from', 'that', 'this', 'into', 'your', 'you', 'role', 'work', 'working', 'ability', 'experience', 'knowledge', 'ownership']);

export type SanitizedDna = Dna;
export type DnaOutcome =
  | { kind: 'empty'; dna: SanitizedDna }
  | { kind: 'grounded'; dna: SanitizedDna };

export type GroundedRole = Omit<GeneratedRole, 'market_sources' | 'score_breakdown'> & {
  match_score: number;
  score_breakdown: ScoreBreakdown;
  market_sources: Array<Omit<MarketSource, 'description'>>;
};

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

function storySpans(experience: string): string[] {
  return experience.split(/(?<=[.!?])\s+|\n+|;\s+/u).map((part) => part.trim()).filter((part) => part.length >= 12 && part.length <= 500);
}

export function alignEvidenceItem<T extends { name: string; evidence: string }>(item: T, experience: string): T | null {
  const evidence = item.evidence.trim().replace(/^[“”"']+|[“”"']+$/gu, '').trim();
  if (evidence.length < 3) return null;
  const story = normalizeEvidence(experience);
  if (story.includes(normalizeEvidence(evidence))) return { ...item, evidence };
  const queryTokens = new Set([...tokenize(evidence), ...tokenize(item.name)]);
  if (queryTokens.size < 2) return null;
  const ranked = storySpans(experience).map((span) => ({
    span,
    score: tokenize(span).filter((token) => queryTokens.has(token)).length
  })).sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score < 2) return null;
  return { ...item, evidence: best.span.slice(0, 500) };
}

// Occupational head nouns are a general feature of English job titles, not a
// list of the industries Rated N happens to have tested. Anything narrower
// (hotel, clinical, sociology...) silently returns nothing for every user
// outside that list.
const TITLE_HEAD = /\b((?:[a-z][\w.'-]*\s+){0,2}(?:coordinator|manager|assistant|associate|technician|technologist|analyst|engineer|specialist|supervisor|superintendent|operator|administrator|consultant|designer|developer|accountant|auditor|receptionist|concierge|teacher|instructor|professor|educator|nurse|paramedic|therapist|welder|machinist|electrician|plumber|carpenter|mechanic|driver|dispatcher|foreman|chef|cook|server|bartender|clerk|officer|director|advisor|agent|planner|scheduler|buyer|estimator|inspector|surveyor|researcher|scientist|writer|editor|translator|recruiter|controller|bookkeeper|cashier|stocker|labourer|laborer|apprentice|intern))\b/giu;

// "as a X", "became X", "I am a X", "worked as X" — how people name their own
// roles in prose, independent of the trade they are describing.
const ROLE_INTRO = /\b(?:as an?|became(?: an?)?|i(?:'m| am| was| have been)(?: an?)?|promoted to(?: an?)?|hired as an?)\s+((?:certified\s+|licensed\s+|senior\s+|junior\s+|lead\s+)?[a-z][\w.'-]*(?:\s+[a-z][\w.'-]*){0,3})/giu;

// A non-global twin so membership tests never move the shared lastIndex.
const TITLE_HEAD_TEST = new RegExp(TITLE_HEAD.source, 'iu');

/** A job-search query has to name an occupation, not recite a sentence. */
export function looksLikeJobTitle(value: string): boolean {
  const words = value.trim().split(/\s+/u).filter(Boolean);
  return words.length >= 1 && words.length <= 5 && TITLE_HEAD_TEST.test(value);
}

const TITLE_STOP = /\b(?:and|or|in|at|for|with|from|to|on|of|the|a|an|about|during|since|until|because|who|which|that|where|when|while)\b/iu;

function titleCase(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').split(' ')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ')
    .slice(0, 100);
}

// Determiners, pronouns and narration verbs ride along with a captured title
// ("a research assistant", "I became coordinator"); the occupation is what is
// left once they are dropped from the front.
const TITLE_LEAD_NOISE = new Set(['a', 'an', 'the', 'my', 'his', 'her', 'their', 'our', 'i', 'was', 'is', 'am', 'are', 'been', 'be', 'became', 'become', 'as', 'then', 'also', 'now', 'did', 'do', 'done', 'worked', 'work', 'working', 'moved', 'started', 'spent', 'served', 'hired', 'promoted', 'years', 'year', 'and', 'or', 'of', 'for', 'at', 'in', 'on', 'with', 'to']);

function trimToTitle(value: string): string {
  const stop = value.search(TITLE_STOP);
  const cut = stop > 0 ? value.slice(0, stop) : value;
  const words = cut.replace(/[^\w.'\s-]+/gu, ' ').trim().split(/\s+/u).filter(Boolean);
  while (words.length && TITLE_LEAD_NOISE.has(words[0].toLowerCase())) words.shift();
  return words.join(' ');
}

/** A leading line that reads like a job title rather than a sentence. */
function headlineTitle(experience: string): string[] {
  const first = experience.split(/\n/u)[0]?.trim() || '';
  const words = first.split(/\s+/u).filter(Boolean);
  if (!first || words.length < 2 || words.length > 8) return [];
  if (/[.!?;:]$/u.test(first) || first.includes(',')) return [];
  return [titleCase(first)];
}

export function titlesFromStory(experience: string): string[] {
  const found: string[] = [...headlineTitle(experience)];
  for (const match of experience.matchAll(TITLE_HEAD)) {
    const title = trimToTitle(match[1]);
    if (title.split(/\s+/u).length >= 1 && title.length >= 4) found.push(titleCase(title));
  }
  for (const match of experience.matchAll(ROLE_INTRO)) {
    const title = trimToTitle(match[1]);
    if (title.length >= 4 && TITLE_HEAD_TEST.test(title)) found.push(titleCase(title));
  }
  const seen = new Set<string>();
  return found.filter((title) => {
    const key = title.toLowerCase();
    if (seen.has(key) || STOP_WORDS.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function capabilityName(span: string): string {
  const words = span.replace(/[^a-zA-Z0-9+#.\s-]/gu, ' ').split(/\s+/u).filter((word) => word.length > 2 && !STOP_WORDS.has(word.toLowerCase()));
  const name = words.slice(0, 6).map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`).join(' ');
  return name.slice(0, 90);
}

/**
 * Last-resort extraction when the analysis engine gives nothing usable. It
 * quotes the story verbatim and never asserts a capability the story does not
 * contain, but it also does not pretend to classify: everything it recovers is
 * reported as transferable evidence rather than triple-counted as competencies,
 * skills, and transferable at once.
 */
export function extractFromStory(experience: string): Dna {
  const spans = storySpans(experience);
  const items = spans.map((span) => ({ span, content: [...new Set(tokenize(span))] }))
    .filter((entry) => entry.content.length >= 4)
    .map((entry) => ({ name: capabilityName(entry.span) || 'Professional experience', evidence: entry.span.slice(0, 500) }))
    .filter((item) => item.name.length >= 4);
  const summary = spans[0]?.slice(0, 500) || 'Professional experience from the supplied career story.';
  return {
    summary,
    competencies: [],
    skills: [],
    transferable: items.slice(0, 8),
    education: [],
    certifications: [],
    preferences: [],
    search_titles: titlesFromStory(experience)
  };
}

function searchTitlesFrom(dna: SanitizedDna, experience: string): string[] {
  const existing = dna.search_titles.map((title) => title.trim()).filter((title) => title.length >= 2);
  if (existing.length >= 2) return existing.slice(0, 6);
  const fromNames = [...dna.competencies, ...dna.skills, ...dna.transferable]
    .map((item) => item.name.trim())
    .filter((name) => name.length >= 4 && name.length <= 100 && looksLikeJobTitle(name));
  return [...new Set([...existing, ...titlesFromStory(experience), ...fromNames])].slice(0, 6);
}

export function sanitizeDna(raw: Dna, experience: string): DnaOutcome {
  const dna: SanitizedDna = {
    ...raw,
    competencies: raw.competencies.flatMap((item) => {
      const aligned = alignEvidenceItem(item, experience);
      return aligned ? [aligned] : [];
    }),
    skills: raw.skills.flatMap((item) => {
      const aligned = alignEvidenceItem(item, experience);
      return aligned ? [aligned] : [];
    }),
    transferable: raw.transferable.flatMap((item) => {
      const aligned = alignEvidenceItem(item, experience);
      return aligned ? [aligned] : [];
    })
  };
  if (!dna.summary.trim()) dna.summary = storySpans(experience)[0]?.slice(0, 500) || 'Professional experience from the supplied career story.';
  const grounded = dna.competencies.length + dna.skills.length + dna.transferable.length > 0;
  if (!grounded) return { kind: 'empty', dna: { ...dna, search_titles: [] } };
  return { kind: 'grounded', dna: { ...dna, search_titles: searchTitlesFrom(dna, experience) } };
}

export function gapIsAlreadyCovered(gap: string, experience: string): boolean {
  const gapTokens = [...new Set(tokenize(gap))];
  if (!gapTokens.length) return false;
  const experienceTokens = new Set(tokenize(experience));
  const matches = gapTokens.filter((token) => experienceTokens.has(token)).length;
  return matches > 0 && matches / gapTokens.length >= 0.5;
}

export function evidenceQuote(candidate: string, experience: string, strengths: string[]): string {
  const stripped = candidate.trim().replace(/^[“”"']+|[“”"']+$/gu, '').trim();
  if (stripped.length >= 12 && stripped.length < experience.length * 0.8 && experience.includes(stripped)) return stripped;
  const sentences = experience.split(/(?<=[.!?])\s+|\n+/u).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 12 && sentence.length <= 500);
  const strengthTokens = new Set(tokenize(strengths.join(' ')));
  const ranked = sentences.map((sentence) => ({ sentence, score: tokenize(sentence).filter((token) => strengthTokens.has(token)).length })).sort((left, right) => right.score - left.score);
  return (ranked[0]?.sentence || experience.slice(0, 300)).slice(0, 500);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreBreakdown(raw: ScoreBreakdown, dna: SanitizedDna): ScoreBreakdown {
  const hasAnyEvidence = dna.competencies.length + dna.skills.length + dna.transferable.length > 0;
  const availability: Record<keyof ScoreBreakdown, boolean> = {
    experience: hasAnyEvidence,
    skills: dna.skills.length > 0,
    competencies: dna.competencies.length + dna.transferable.length > 0,
    education: dna.education.length > 0,
    certifications: dna.certifications.length > 0,
    preferences: dna.preferences.length > 0
  };
  return {
    experience: availability.experience ? clamp(raw.experience) : 0,
    skills: availability.skills ? clamp(raw.skills) : 0,
    competencies: availability.competencies ? clamp(raw.competencies) : 0,
    education: availability.education ? clamp(raw.education) : 0,
    certifications: availability.certifications ? clamp(raw.certifications) : 0,
    preferences: availability.preferences ? clamp(raw.preferences) : 0
  };
}

export function weightedScore(breakdown: Record<string, number>): number {
  return clamp(Object.entries(SCORE_WEIGHTS).reduce((total, [key, weight]) => total + (breakdown[key] || 0) * weight, 0));
}

export function groundRoles(roles: GeneratedRole[], sources: MarketSource[], dna: SanitizedDna, experience: string): GroundedRole[] {
  const seenTitles = new Set<string>();
  return roles.flatMap((role) => {
    const resolvedSources = role.market_sources.map(({ source_index }) => sources[source_index]).filter(Boolean);
    const primary = resolvedSources[0];
    if (!primary) return [];
    const normalizedTitle = primary.title.toLowerCase();
    if (seenTitles.has(normalizedTitle)) return [];
    seenTitles.add(normalizedTitle);
    const breakdown = scoreBreakdown(role.score_breakdown, dna);
    return [{
      ...role,
      title: primary.title,
      market_sources: resolvedSources.map(({ description: _description, ...source }) => source),
      score_breakdown: breakdown,
      match_score: weightedScore(breakdown),
      gaps: role.gaps.filter((gap) => !gapIsAlreadyCovered(gap, experience)),
      evidence_quote: evidenceQuote(role.evidence_quote, experience, role.strengths)
    }];
  });
}
