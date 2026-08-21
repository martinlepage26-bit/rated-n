export interface MarketSource {
  title: string;
  employer: string;
  location: string;
  url: string;
  description?: string;
}

export interface BrowserBinding {
  quickAction(
    action: 'scrape',
    options: {
      url: string;
      elements: Array<{ selector: string }>;
      gotoOptions?: { waitUntil?: string; timeout?: number };
      waitForTimeout?: number;
    }
  ): Promise<Response>;
}

export interface EmailBinding {
  send(message: EmailMessage): Promise<void>;
}

export interface Env {
  DB: D1Database;
  AI: Ai;
  BROWSER: BrowserBinding;
  EMAIL?: EmailBinding;
  APP_ORIGIN: string;
  AI_MODEL?: string;
  SESSION_DAYS?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  AUTH_PEPPER?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  password_salt: string | null;
  password_iterations: number | null;
  email_verified: number;
  auth_provider: 'email' | 'google';
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  user_id: string;
  experience_text: string;
  region: string | null;
  status: 'analyzing' | 'ready' | 'failed';
  dna_summary: string | null;
  competencies_count: number;
  skills_count: number;
  transferable_count: number;
  dna_json: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleRow {
  id: string;
  user_id: string;
  profile_id: string;
  title: string;
  role_type: 'Direct' | 'Adjacent' | 'Unexpected' | 'Stretch';
  match_score: number;
  note: string | null;
  why_qualify: string | null;
  strengths_json: string;
  gaps_json: string;
  transition_difficulty: string;
  evidence_quote: string | null;
  evidence_source: string | null;
  path_steps_json: string;
  score_breakdown_json: string;
  region: string | null;
  market_evidence: string | null;
  market_sources_json: string;
  success_signal: string | null;
  saved: number;
  status: string;
  resume_markdown: string | null;
  cover_letter_markdown: string | null;
  linkedin_summary_markdown: string | null;
  created_at: string;
  updated_at: string;
}
