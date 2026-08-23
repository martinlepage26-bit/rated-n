import { describe, expect, it } from 'vitest';
import { dnaJsonSchema, mergeDna, parseLooseDna, parseLooseRoles, rolesJsonSchema, toJsonSchema } from './schema';
import { z } from 'zod';

describe('toJsonSchema', () => {
  it('emits a closed object contract from Zod', () => {
    const schema = toJsonSchema(z.object({ name: z.string(), count: z.number() }));
    expect(schema).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: { name: { type: 'string' }, count: { type: 'number' } },
      required: ['name', 'count']
    });
  });

  it('builds DNA and roles JSON Schema from the same Zod models', () => {
    expect(rolesJsonSchema).toMatchObject({ type: 'object', additionalProperties: false, required: ['roles'] });
  });

  it('requires every DNA field so an empty object is not a legal answer', () => {
    expect(dnaJsonSchema.required).toEqual([
      'summary', 'competencies', 'skills', 'transferable', 'education', 'certifications', 'preferences', 'search_titles'
    ]);
  });
});

describe('parseLooseDna', () => {
  it('accepts capabilities returned as bare strings', () => {
    const dna = parseLooseDna({ summary: 'A profile.', skills: ['patient scheduling', 'shipment logistics'] });
    expect(dna?.skills).toEqual([
      { name: 'patient scheduling', evidence: 'patient scheduling' },
      { name: 'shipment logistics', evidence: 'shipment logistics' }
    ]);
  });

  it('maps the alternate key spellings the model reaches for', () => {
    const dna = parseLooseDna({ summary: '', _capabilities: ['coordinated trials'], titles: ['Clinical Trial Coordinator', 'Research Assistant'] });
    expect(dna?.competencies).toHaveLength(1);
    expect(dna?.search_titles).toEqual(['Clinical Trial Coordinator', 'Research Assistant']);
  });

  it('keeps an empty summary empty so the caller can ground it in the story', () => {
    expect(parseLooseDna({ summary: '' })?.summary).toBe('');
  });

  it('rejects a response that is not an object', () => {
    expect(parseLooseDna('not json')).toBeNull();
  });
});

describe('mergeDna', () => {
  const base = {
    summary: '', competencies: [], skills: [], transferable: [],
    education: ['BSc Sociology'], certifications: [], preferences: [], search_titles: ['Clinical Trial Coordinator']
  };

  it('keeps what each attempt supplied instead of discarding a partial answer', () => {
    const merged = mergeDna(base, {
      summary: 'Clinical trial coordinator.',
      competencies: [{ name: 'Trial management', evidence: 'coordinated oncology clinical trials' }],
      skills: [], transferable: [], education: [], certifications: [], preferences: [],
      search_titles: ['Research Assistant']
    });
    expect(merged.summary).toBe('Clinical trial coordinator.');
    expect(merged.competencies).toHaveLength(1);
    expect(merged.education).toEqual(['BSc Sociology']);
    expect(merged.search_titles).toEqual(['Clinical Trial Coordinator', 'Research Assistant']);
  });

  it('does not duplicate a capability both attempts named', () => {
    const item = { name: 'Trial management', evidence: 'coordinated oncology clinical trials' };
    const merged = mergeDna({ ...base, competencies: [item] }, { ...base, competencies: [{ ...item, evidence: 'coordinated trials' }] });
    expect(merged.competencies).toHaveLength(1);
  });
});

describe('parseLooseRoles', () => {
  const role = (overrides = {}) => ({
    title: 'Accounting Clerk',
    role_type: 'Direct',
    note: 'A current posting.',
    why_qualify: 'Your bookkeeping evidence carries.',
    strengths: ['Reconciliations'],
    gaps: [],
    transition_difficulty: 'Moderate',
    evidence_quote: 'full-cycle accounts payable and receivable',
    evidence_source: 'Your career story',
    path_steps: ['Review the posting.', 'Map your evidence.', 'Apply.'],
    score_breakdown: { experience: 70, skills: 60, competencies: 65, education: 0, certifications: 0, preferences: 40 },
    market_evidence: 'Ruby & Co. is hiring in Toronto.',
    market_sources: [{ source_index: 0 }],
    success_signal: 'A recruiter reply.',
    ...overrides
  });

  it('accepts an ASCII hyphen where the enum wants an en dash', () => {
    const parsed = parseLooseRoles({ roles: [role({ transition_difficulty: 'Low-Moderate' })] });
    expect(parsed?.dropped).toBe(0);
    expect(parsed?.roles[0].transition_difficulty).toBe('Low–Moderate');
  });

  it('keeps the good roles when one entry is malformed', () => {
    // The real failure: one mistyped dash in one role discarded all ten.
    const roles = [role(), role(), role({ title: '' }), role(), role()];
    const parsed = parseLooseRoles({ roles });
    expect(parsed?.roles).toHaveLength(4);
    expect(parsed?.dropped).toBe(1);
  });

  it('repairs transcription slips rather than rejecting the role', () => {
    const parsed = parseLooseRoles({ roles: [role({
      role_type: 'direct',
      score_breakdown: { experience: '70', skills: 120, competencies: -5, education: null, certifications: 0, preferences: 40 },
      path_steps: ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.'],
      strengths: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
    })] });
    const first = parsed?.roles[0];
    expect(first?.role_type).toBe('Direct');
    expect(first?.score_breakdown).toMatchObject({ experience: 70, skills: 100, competencies: 0, education: 0 });
    expect(first?.path_steps).toHaveLength(5);
    expect(first?.strengths).toHaveLength(8);
  });

  it('returns null when there is no roles array at all', () => {
    expect(parseLooseRoles({ summary: 'nope' })).toBeNull();
    expect(parseLooseRoles('nope')).toBeNull();
  });

  it('reports every entry dropped rather than inventing replacements', () => {
    const parsed = parseLooseRoles({ roles: [{ title: 'x' }, { nope: true }] });
    expect(parsed?.roles).toHaveLength(0);
    expect(parsed?.dropped).toBe(2);
  });
});
