import { describe, expect, it } from 'vitest';
import { evidenceIsSupported, gapIsAlreadyCovered, tokenize, weightedScore } from './profiles';

describe('evidence-backed scoring', () => {
  it('has no artificial score floor', () => {
    expect(weightedScore({ experience: 0, skills: 0, competencies: 0, education: 0, certifications: 0, preferences: 0 })).toBe(0);
  });

  it('uses the documented weighted dimensions', () => {
    expect(weightedScore({ experience: 100, skills: 100, competencies: 100, education: 0, certifications: 0, preferences: 0 })).toBe(76);
  });
});

describe('computed gap checks', () => {
  it('does not call budget ownership a gap when budgets were managed', () => {
    expect(gapIsAlreadyCovered('budget ownership', 'Managed budgets and led delivery programs.')).toBe(true);
  });

  it('retains a requirement that is not in the career story', () => {
    expect(gapIsAlreadyCovered('PMP certification', 'Managed budgets and led delivery programs.')).toBe(false);
  });

  it('normalizes common inflections', () => {
    expect(tokenize('managed budgets')).toEqual(['manag', 'budget']);
  });
});

describe('evidence checks', () => {
  it('accepts case, punctuation, and whitespace differences from the model', () => {
    expect(evidenceIsSupported('Managed  client-facing operations.', 'I managed client-facing operations across three teams.')).toBe(true);
  });

  it('does not accept unsupported evidence', () => {
    expect(evidenceIsSupported('Built Python forecasting models', 'I coordinated schedules and trained new hires.')).toBe(false);
  });
});
