import { describe, expect, it } from 'vitest';
import { analyzeExperience, extractJson, isEngineUnavailable } from './ai';
import { ApiProblem } from './http';
import type { Env } from './types';

const STORY = 'I coordinated oncology clinical trials across four hospital sites and maintained regulatory binders for Health Canada inspections.';

/** What the model actually returns under a JSON grammar: shape intact, content gone. */
const GRAMMAR_BLANK = {
  summary: '',
  competencies: [], skills: [], transferable: [],
  education: ['BSc in Sociology from Concordia University'],
  certifications: [], preferences: ['Montreal'],
  search_titles: ['Clinical Trial Coordinator']
};

const POPULATED = {
  summary: 'Clinical trial coordinator.',
  competencies: [{ name: 'Trial coordination', evidence: 'coordinated oncology clinical trials' }],
  skills: [{ name: 'Regulatory compliance', evidence: 'maintained regulatory binders' }],
  transferable: [], education: [], certifications: [], preferences: [],
  search_titles: ['Clinical Research Coordinator']
};

function mode(input: { response_format?: { type: string } }): string {
  return input.response_format?.type ?? 'text';
}

function envWith(handler: (mode: string, call: number) => unknown): { env: Env; modes: string[] } {
  const modes: string[] = [];
  const env = {
    AI_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    AI: {
      run: async (_model: string, input: { response_format?: { type: string } }) => {
        const used = mode(input);
        modes.push(used);
        const result = handler(used, modes.length);
        if (result instanceof Error) throw result;
        return { response: result };
      }
    }
  } as unknown as Env;
  return { env, modes };
}

describe('extractJson', () => {
  it('reads JSON out of a fenced reply', () => {
    expect(extractJson('```json\n{"summary":"hi"}\n```')).toEqual({ summary: 'hi' });
  });

  it('reads JSON out of a reply wrapped in commentary', () => {
    expect(extractJson('Sure! {"summary":"hi"} Hope that helps.')).toEqual({ summary: 'hi' });
  });

  it('returns null when there is no object at all', () => {
    expect(extractJson('I cannot help with that.')).toBeNull();
  });
});

describe('analyzeExperience', () => {
  it('asks for json_object before reaching for the grammar that empties the answer', async () => {
    const { env, modes } = envWith(() => POPULATED);
    const dna = await analyzeExperience(env, STORY, 'Montreal');
    expect(modes).toEqual(['json_object']);
    expect(dna.competencies).toHaveLength(1);
  });

  it('does not accept the grammar-shaped blank as the answer', async () => {
    const { env, modes } = envWith((used) => (used === 'json_object' ? GRAMMAR_BLANK : POPULATED));
    const dna = await analyzeExperience(env, STORY, 'Montreal');
    expect(modes.length).toBeGreaterThan(1);
    expect(dna.competencies).toHaveLength(1);
    expect(dna.skills).toHaveLength(1);
  });

  it('keeps the fields a partial attempt did supply', async () => {
    const { env } = envWith((used) => (used === 'json_object' ? GRAMMAR_BLANK : POPULATED));
    const dna = await analyzeExperience(env, STORY, 'Montreal');
    expect(dna.education).toEqual(['BSc in Sociology from Concordia University']);
    expect(dna.search_titles).toEqual(expect.arrayContaining(['Clinical Trial Coordinator', 'Clinical Research Coordinator']));
  });

  it('reports an unavailable engine instead of an empty result when the binding fails', async () => {
    const quota = new Error('4006: you have used up your daily free allocation of 10,000 neurons');
    const { env, modes } = envWith(() => quota);
    await expect(analyzeExperience(env, STORY, 'Montreal')).rejects.toSatisfy((caught: unknown) => {
      return isEngineUnavailable(caught) && caught instanceof ApiProblem && caught.status === 503;
    });
    expect(modes).toHaveLength(3);
  });

  it('never turns a run of grammar-shaped blanks into a no-evidence verdict', async () => {
    const { env, modes } = envWith(() => GRAMMAR_BLANK);
    await expect(analyzeExperience(env, STORY, 'Montreal')).rejects.toSatisfy((caught: unknown) => {
      return caught instanceof ApiProblem && caught.status === 502;
    });
    expect(modes).toEqual(['json_object', 'text', 'json_schema']);
  });

  it('accepts a written verdict of no capabilities so an empty story can stay empty', async () => {
    const verdict = { ...GRAMMAR_BLANK, summary: 'This text describes no professional activity.', education: [], preferences: [], search_titles: [] };
    const { env, modes } = envWith(() => verdict);
    const dna = await analyzeExperience(env, STORY, 'Montreal');
    expect(modes).toEqual(['json_object']);
    expect(dna.competencies).toHaveLength(0);
    expect(dna.summary).toBe('This text describes no professional activity.');
  });

  it('reports a generation failure when the engine answers with nothing usable', async () => {
    const { env } = envWith(() => 'I cannot help with that.');
    await expect(analyzeExperience(env, STORY, 'Montreal')).rejects.toSatisfy((caught: unknown) => {
      return caught instanceof ApiProblem && caught.status === 502 && caught.code === 'analysis_generation_failed';
    });
  });
});
