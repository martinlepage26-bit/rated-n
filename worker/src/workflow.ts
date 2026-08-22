import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { EMPTY_DNA_SUMMARY, type GroundedRole } from './evidence';
import { extractDna, markAnalysisFailed, matchRoles, persistAnalysisOutcome } from './analysis';
import { ApiProblem } from './http';
import type { DnaOutcome } from './evidence';
import type { AnalysisWorkflowParams, Env } from './types';

const DNA_STEP = {
  retries: { limit: 2, delay: '8 seconds' as const, backoff: 'exponential' as const },
  timeout: '3 minutes' as const
};
const MARKET_STEP = {
  retries: { limit: 3, delay: '10 seconds' as const, backoff: 'exponential' as const },
  timeout: '8 minutes' as const
};
const PERSIST_STEP = {
  retries: { limit: 4, delay: '2 seconds' as const, backoff: 'constant' as const },
  timeout: '1 minute' as const
};

type LoadedProfile = { experience: string; region: string; status: string };

function failStep(caught: unknown): never {
  if (caught instanceof ApiProblem && caught.status >= 400 && caught.status < 500 && caught.status !== 429) {
    throw new NonRetryableError(caught.message);
  }
  throw caught instanceof Error ? caught : new Error(String(caught));
}

export class AnalysisWorkflow extends WorkflowEntrypoint<Env, AnalysisWorkflowParams> {
  async run(event: WorkflowEvent<AnalysisWorkflowParams>, step: WorkflowStep) {
    const profileId = event.payload?.profileId;
    const userId = event.payload?.userId;
    if (!profileId || !userId) throw new NonRetryableError('Analysis workflow is missing profile identity.');

    try {
      const profile = await step.do('load-profile', PERSIST_STEP, async (): Promise<LoadedProfile> => {
        const row = await this.env.DB.prepare('SELECT experience_text, region, status FROM profiles WHERE id = ? AND user_id = ?')
          .bind(profileId, userId).first<{ experience_text: string; region: string | null; status: string }>();
        if (!row) throw new NonRetryableError('That career story was not found.');
        return { experience: row.experience_text, region: row.region || '', status: row.status };
      });

      if (profile.status !== 'analyzing') return;

      const dna = await step.do('extract-dna', DNA_STEP, async (): Promise<DnaOutcome> => {
        try {
          return await extractDna(this.env, profile.experience, profile.region);
        } catch (caught) {
          failStep(caught);
        }
      });

      if (dna.kind === 'empty') {
        await step.do('persist-empty', PERSIST_STEP, async (): Promise<boolean> => {
          await persistAnalysisOutcome(this.env, {
            profileId,
            userId,
            region: profile.region || null,
            outcome: { kind: 'empty', dna: dna.dna, summary: EMPTY_DNA_SUMMARY }
          });
          return true;
        });
        return;
      }

      const roles = await step.do('match-roles', MARKET_STEP, async (): Promise<GroundedRole[]> => {
        try {
          return await matchRoles(this.env, profile.experience, dna.dna, profile.region);
        } catch (caught) {
          failStep(caught);
        }
      });

      await step.do('persist-ready', PERSIST_STEP, async (): Promise<boolean> => {
        await persistAnalysisOutcome(this.env, {
          profileId,
          userId,
          region: profile.region || null,
          outcome: { kind: 'ready', dna: dna.dna, roles }
        });
        return true;
      });
    } catch (caught) {
      await step.do('mark-failed', PERSIST_STEP, async (): Promise<boolean> => {
        await markAnalysisFailed(this.env, profileId, userId, caught);
        return true;
      });
    }
  }
}
