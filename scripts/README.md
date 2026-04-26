# Site snapshot + migration mapper (Python)

`site_snapshot_mapper.py` logs into a site (e.g. WordPress), crawls same-origin HTML links, downloads linked assets, and writes:

- `pages/` — saved HTML
- `assets/` — CSS/JS/images/docs pulled from pages
- `reports/manifest.json` — machine-readable crawl log
- `reports/mapping.csv` — spreadsheet to fill `target_bucket`, `target_visibility`, `target_slug` for your private repo / CI
- `reports/summary.md` — quick counts
- `logs/` — login debug snippets

Everything is zipped to `snapshot_bundle.zip` (or `--zip-name`).

## Setup (venv)

From the repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r scripts/requirements-crawler.txt
```

## Run (WordPress example)

Prefer a password in the environment so it does not appear in shell history:

```bash
export SITE_PASSWORD='your-password-here'

python scripts/site_snapshot_mapper.py \
  --base-url https://www.sfbaycaving.org \
  -u your_wp_username \
  --out-dir snapshot_output \
  --zip-name snapshot_bundle.zip
```

For WordPress, **`-L` is optional**: if you omit it, the script uses `{base-url}/wp-login.php`.

With password on the CLI (less safe):

```bash
python scripts/site_snapshot_mapper.py \
  --base-url https://www.sfbaycaving.org \
  -u your_wp_username \
  -w 'your-password-here'
```

If login lives somewhere else, pass it explicitly:

```bash
python scripts/site_snapshot_mapper.py \
  --base-url https://www.sfbaycaving.org \
  -L https://www.sfbaycaving.org/wp-login.php \
  -u your_wp_username \
  -w 'your-password-here'
```

Public crawl only (no login):

```bash
python scripts/site_snapshot_mapper.py --base-url https://example.org --no-login
```

Extra seeds (member-only areas you know URLs for):

```bash
python scripts/site_snapshot_mapper.py \
  --base-url https://sfbaycaving.org \
  -L https://sfbaycaving.org/wp-login.php \
  -u USER \
  --start-path /members-only-page/ \
  --start-path /another-path/
```

## Options

- `--max-pages` / `--max-assets` — safety limits
- `--delay-ms` — politeness delay between requests
- `--login-success-contains` — substring to verify login (default `wp-admin`)
- `--redirect-to` — WordPress `redirect_to` (default `{base-url}/wp-admin/`)
- `--password-env` — env var name for password when `-w` omitted (default `SITE_PASSWORD`)
- Progress logs go to **stderr** (`[login]`, `[crawl]`, `[write]`, `[zip]`). Tune noise with:
  - `--progress-pages-every N` — log every N HTML pages (default `1`)
  - `--progress-assets-every N` — log every N assets (default `25`; set `0` to disable asset batch lines)
  - `--quiet` — suppress progress (errors still print)

## Private repo workflow

1. Unzip `snapshot_bundle.zip` into your **private** repository.
2. Edit `reports/mapping.csv` (fill target columns).
3. Point CI at `manifest.json` / CSV to sync content into D1/R2 or another store.

**Do not** commit crawl output or credentials to the **public** app repo.
