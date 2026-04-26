-- Members of the community.
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'invited',
  role TEXT NOT NULL DEFAULT 'member',
  region TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Invite codes admin hands out to onboard new members.
CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'unused',
  expires_at TEXT,
  used_by_member_id INTEGER,
  used_at TEXT,
  created_by_member_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (used_by_member_id) REFERENCES members(id),
  FOREIGN KEY (created_by_member_id) REFERENCES members(id)
);

-- One row per member per membership year. fee_paid drives gate to /members.
CREATE TABLE IF NOT EXISTS membership_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  fee_paid INTEGER NOT NULL DEFAULT 0,
  amount_due_cents INTEGER NOT NULL DEFAULT 0,
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_id) REFERENCES members(id),
  UNIQUE(member_id, year)
);

-- Free-form ledger of all financial activity, recorded manually by admin.
CREATE TABLE IF NOT EXISTS financial_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER,
  txn_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  txn_date TEXT NOT NULL,
  payment_method TEXT,
  reference TEXT,
  memo TEXT,
  recorded_by_member_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_id) REFERENCES members(id),
  FOREIGN KEY(recorded_by_member_id) REFERENCES members(id)
);

-- Declarative gate rules per path prefix. Cheap to extend without code changes.
CREATE TABLE IF NOT EXISTS page_access_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path_prefix TEXT NOT NULL UNIQUE,
  requires_login INTEGER NOT NULL DEFAULT 1,
  requires_active_member INTEGER NOT NULL DEFAULT 1,
  requires_fee_paid INTEGER NOT NULL DEFAULT 1,
  requires_admin INTEGER NOT NULL DEFAULT 0
);

-- Append-only log of sensitive admin actions.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_member_id INTEGER,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(actor_member_id) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_status_role ON members(status, role);
CREATE INDEX IF NOT EXISTS idx_membership_periods_member_year ON membership_periods(member_id, year);
CREATE INDEX IF NOT EXISTS idx_financial_txn_date ON financial_transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_financial_member ON financial_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
