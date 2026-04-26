CREATE TABLE IF NOT EXISTS content_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'member',
  source_path TEXT,
  body_html TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_key TEXT NOT NULL UNIQUE,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  visibility TEXT NOT NULL DEFAULT 'member',
  source_path TEXT,
  checksum_sha256 TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_page_assets (
  page_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page_id, asset_id),
  FOREIGN KEY (page_id) REFERENCES content_pages(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES content_assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_content_pages_visibility ON content_pages(visibility);
CREATE INDEX IF NOT EXISTS idx_content_assets_visibility ON content_assets(visibility);
CREATE INDEX IF NOT EXISTS idx_content_assets_key ON content_assets(asset_key);
