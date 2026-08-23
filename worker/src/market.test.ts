import { describe, expect, it } from 'vitest';
import { condense } from './market';

describe('condense', () => {
  it('leaves a short description untouched', () => {
    expect(condense('Coordinate study visits. GCP training required.')).toBe('Coordinate study visits. GCP training required.');
  });

  it('cuts a long description at the last full sentence', () => {
    const body = `${'Coordinate study visits and maintain regulatory documentation. '.repeat(40)}Benefits include dental.`;
    const result = condense(body);
    expect(result.length).toBeLessThanOrEqual(1_200);
    expect(result.endsWith('.')).toBe(true);
    expect(result).not.toContain('Benefits include dental');
  });

  it('falls back to a word boundary when there is no sentence break', () => {
    const result = condense('requirement '.repeat(400));
    expect(result.length).toBeLessThanOrEqual(1_201);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toMatch(/requiremen…$/u);
  });

  it('keeps the opening requirements rather than the tail boilerplate', () => {
    const body = `Clinical Research Coordinator. Requires GCP training and two years on site. ${'Equal opportunity employer boilerplate. '.repeat(60)}`;
    expect(condense(body)).toContain('Requires GCP training');
  });
});
