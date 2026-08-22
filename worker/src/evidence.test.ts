import { describe, expect, it } from 'vitest';
import { alignEvidenceItem, evidenceIsSupported, extractFromStory, gapIsAlreadyCovered, groundRoles, sanitizeDna, titlesFromStory, tokenize, weightedScore } from './evidence';
import type { GeneratedRole } from './schema';
import type { MarketSource } from './types';

const emptyDna = {
  summary: 'Summary',
  competencies: [] as Array<{ name: string; evidence: string }>,
  skills: [] as Array<{ name: string; evidence: string }>,
  transferable: [] as Array<{ name: string; evidence: string }>,
  education: [],
  certifications: [],
  preferences: [],
  search_titles: ['Operations Coordinator', 'Project Coordinator']
};

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

describe('sanitizeDna', () => {
  it('keeps grounded capabilities whose quotes are in the story', () => {
    const outcome = sanitizeDna({
      ...emptyDna,
      transferable: [{ name: 'Team leadership', evidence: 'I managed programs and coordinated delivery' }],
      search_titles: ['Program Manager', 'Operations Lead']
    }, 'I managed programs and coordinated delivery across departments.');
    expect(outcome.kind).toBe('grounded');
    if (outcome.kind === 'grounded') {
      expect(outcome.dna.transferable).toHaveLength(1);
      expect(outcome.dna.search_titles).toEqual(['Program Manager', 'Operations Lead']);
    }
  });

  it('returns empty instead of keeping unrelated paraphrases or inventing titles', () => {
    const outcome = sanitizeDna({
      ...emptyDna,
      transferable: [{ name: 'Team leadership', evidence: 'Led cross-functional teams' }],
      search_titles: ['Operations Coordinator', 'Project Coordinator', 'Program Coordinator']
    }, 'I managed programs and coordinated delivery across departments.');
    expect(outcome).toEqual({
      kind: 'empty',
      dna: {
        ...emptyDna,
        transferable: [],
        search_titles: []
      }
    });
  });

  it('rewrites a paraphrased quote onto a real span from the story', () => {
    const aligned = alignEvidenceItem(
      { name: 'Hotel administration', evidence: 'Years of hotel administration and front-desk work' },
      'I spent twelve years in hotel administration, including front-desk operations in Montreal.'
    );
    expect(aligned?.evidence).toBe('I spent twelve years in hotel administration, including front-desk operations in Montreal.');
  });

  it('extracts quoted capabilities from a dense career story without the model', () => {
    const story = 'Twelve years working nights in hotels, It was a lot of administration job, night audits, keeping things quiet, concierge, receptionist, etc. 11 years as a research assistant and a teaching assistant in sociology, in religion, in sexuality studies.Then I moved on to call centers for Home Depot and then for Toyota Connected, where I did quality evaluation. And after that, I moved on to a medical clinic where I did clinical research, worked at the laboratory as an assistant. I became coordinator for two and a half years. Then I moved on to pharma at Novartis, where I worked on the compassionate program and worked as a clinical studies coordinator.';
    const outcome = sanitizeDna(extractFromStory(story), story);
    expect(outcome.kind).toBe('grounded');
    if (outcome.kind !== 'grounded') return;
    expect(outcome.dna.competencies.length + outcome.dna.skills.length + outcome.dna.transferable.length).toBeGreaterThan(0);
    expect(outcome.dna.search_titles.length).toBeGreaterThanOrEqual(2);
    expect(outcome.dna.search_titles).toEqual(expect.arrayContaining(['Research Assistant', 'Clinical Studies Coordinator']));
    expect(outcome.dna.competencies.every((item) => story.includes(item.evidence))).toBe(true);
  });

  it('grounds an empty model summary in the story instead of storing a blank', () => {
    const outcome = sanitizeDna({
      ...emptyDna,
      summary: '',
      transferable: [{ name: 'Delivery', evidence: 'I managed programs' }]
    }, 'I managed programs and coordinated delivery across departments.');
    expect(outcome.dna.summary).toBe('I managed programs and coordinated delivery across departments.');
  });

  it('uses an extracted capability name when it names an occupation', () => {
    const outcome = sanitizeDna({
      ...emptyDna,
      transferable: [{ name: 'Clinical research coordinator', evidence: 'I coordinated clinical trials' }],
      search_titles: []
    }, 'I coordinated clinical trials at a research site.');
    expect(outcome.kind).toBe('grounded');
    if (outcome.kind === 'grounded') {
      expect(outcome.dna.search_titles).toContain('Clinical research coordinator');
    }
  });

  it('never sends a sentence fragment to the live job search', () => {
    const story = 'I read blueprints, run MIG and TIG welds to CWB standards, and I supervised a crew of six.';
    const outcome = sanitizeDna({
      ...emptyDna,
      transferable: [{ name: 'Read Blueprints Run Mig Tig Welds', evidence: 'I read blueprints, run MIG and TIG welds to CWB standards' }],
      search_titles: []
    }, story);
    expect(outcome.kind).toBe('grounded');
    if (outcome.kind === 'grounded') {
      expect(outcome.dna.search_titles).toEqual([]);
    }
  });
});

describe('groundRoles', () => {
  const source: MarketSource = { title: 'Program Manager', employer: 'Example Co', location: 'Toronto', url: 'https://www.linkedin.com/jobs/view/1' };
  const role = {
    title: 'Invented Title',
    role_type: 'Direct',
    note: 'A fit.',
    why_qualify: 'Evidence.',
    strengths: ['Delivery'],
    gaps: ['PMP certification'],
    transition_difficulty: 'Moderate',
    evidence_quote: 'I managed programs',
    evidence_source: 'career story',
    path_steps: ['Review the posting.', 'Adapt your evidence.', 'Apply.'],
    score_breakdown: { experience: 80, skills: 0, competencies: 70, education: 0, certifications: 0, preferences: 0 },
    market_evidence: 'Example Co is hiring.',
    market_sources: [{ source_index: 0 }],
    success_signal: 'A recruiter reply.'
  } satisfies GeneratedRole;

  it('uses the posting title and drops duplicate sources', () => {
    const dna = { ...emptyDna, transferable: [{ name: 'Delivery', evidence: 'I managed programs' }] };
    const grounded = groundRoles([role, { ...role, market_sources: [{ source_index: 0 }] }], [source], dna, 'I managed programs and coordinated delivery.');
    expect(grounded).toHaveLength(1);
    expect(grounded[0].title).toBe('Program Manager');
    expect(grounded[0].market_sources[0]).toEqual({ title: source.title, employer: source.employer, location: source.location, url: source.url });
  });

  it('drops roles that cite a missing source index instead of fabricating them', () => {
    const dna = { ...emptyDna, transferable: [{ name: 'Delivery', evidence: 'I managed programs' }] };
    expect(groundRoles([{ ...role, market_sources: [{ source_index: 9 }] }], [source], dna, 'I managed programs.')).toEqual([]);
  });
});

describe('story extraction generalizes beyond the stories it was built on', () => {
  const welder = 'I have been a certified welder for eleven years, mostly structural steel on commercial construction sites in Alberta. I read blueprints, run MIG and TIG welds to CWB standards, and I supervised a crew of six on a hospital expansion in Red Deer. I also did two years of pipeline fabrication in the shop, including fit-up and grinding.';
  const teacher = 'Elementary school teacher, grade 4 and 5, for nine years in the Laval school board. I built the literacy intervention program used across three schools, mentored four student teachers, and managed classroom budgets. I adapted lesson plans for students with IEPs.';

  it('recovers quoted capabilities from a trades story', () => {
    const outcome = sanitizeDna(extractFromStory(welder), welder);
    expect(outcome.kind).toBe('grounded');
    if (outcome.kind !== 'grounded') return;
    expect(outcome.dna.transferable.length).toBeGreaterThan(0);
    expect(outcome.dna.transferable.every((item) => welder.includes(item.evidence))).toBe(true);
    expect(outcome.dna.search_titles).toEqual(expect.arrayContaining(['Certified Welder']));
  });

  it('recovers quoted capabilities from a teaching story', () => {
    const outcome = sanitizeDna(extractFromStory(teacher), teacher);
    expect(outcome.kind).toBe('grounded');
    if (outcome.kind !== 'grounded') return;
    expect(outcome.dna.transferable.length).toBeGreaterThan(0);
    expect(outcome.dna.search_titles.length).toBeGreaterThanOrEqual(1);
  });

  it('reads a headline job title from the first line', () => {
    expect(titlesFromStory('Clinical Trial Coordinator\nNovartis Canada, 2021-2024. I coordinated oncology trials.')).toContain('Clinical Trial Coordinator');
  });

  it('does not classify story spans it cannot verify as competencies or skills', () => {
    const dna = extractFromStory(welder);
    expect(dna.competencies).toEqual([]);
    expect(dna.skills).toEqual([]);
  });

  it('finds nothing in text with no professional content', () => {
    const chatter = 'I like cats. Cats are nice. My cat is orange.';
    expect(sanitizeDna(extractFromStory(chatter), chatter).kind).toBe('empty');
  });
});
