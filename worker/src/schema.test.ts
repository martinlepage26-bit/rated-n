import { describe, expect, it } from 'vitest';
import { dnaJsonSchema, mergeDna, parseLooseDna, rolesJsonSchema, toJsonSchema } from './schema';
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
