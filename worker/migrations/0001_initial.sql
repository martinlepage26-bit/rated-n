PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  password_salt TEXT,
  password_iterations INTEGER,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  auth_provider TEXT NOT NULL DEFAULT 'email' CHECK (auth_provider IN ('email', 'google')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE email_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX email_verifications_user_idx ON email_verifications(user_id, created_at DESC);

CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX password_resets_user_idx ON password_resets(user_id, created_at DESC);

CREATE TABLE oauth_states (
  id TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  return_to TEXT NOT NULL DEFAULT '/',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experience_text TEXT NOT NULL,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'analyzing' CHECK (status IN ('analyzing', 'ready', 'failed')),
  dna_summary TEXT,
  competencies_count INTEGER NOT NULL DEFAULT 0,
  skills_count INTEGER NOT NULL DEFAULT 0,
  transferable_count INTEGER NOT NULL DEFAULT 0,
  dna_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX profiles_user_created_idx ON profiles(user_id, created_at DESC);

CREATE TABLE role_matches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IN ('Direct', 'Adjacent', 'Unexpected', 'Stretch')),
  match_score INTEGER NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  note TEXT,
  why_qualify TEXT,
  strengths_json TEXT NOT NULL DEFAULT '[]',
  gaps_json TEXT NOT NULL DEFAULT '[]',
  transition_difficulty TEXT NOT NULL,
  evidence_quote TEXT,
  evidence_source TEXT,
  path_steps_json TEXT NOT NULL DEFAULT '[]',
  score_breakdown_json TEXT NOT NULL DEFAULT '{}',
  region TEXT,
  market_evidence TEXT,
  market_sources_json TEXT NOT NULL DEFAULT '[]',
  success_signal TEXT,
  saved INTEGER NOT NULL DEFAULT 0 CHECK (saved IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'Not started' CHECK (status IN ('Not started', 'Applied', 'Interviewing', 'Offer Received')),
  resume_markdown TEXT,
  cover_letter_markdown TEXT,
  linkedin_summary_markdown TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX roles_profile_score_idx ON role_matches(profile_id, match_score DESC);
CREATE INDEX roles_user_saved_idx ON role_matches(user_id, saved, match_score DESC);

CREATE TABLE market_cache (
  query_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL
);
