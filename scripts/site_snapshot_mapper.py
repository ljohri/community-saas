#!/usr/bin/env python3
"""
site_snapshot_mapper.py

Crawl a website (including password-protected pages), download pages/assets,
and produce a migration-friendly mapping bundle that can be committed to a
private content repository.

Designed for WordPress-style login flows but works on generic forms if selectors
are provided.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import shutil
import sys
import time
import zipfile
from collections import deque
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Set, Tuple
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup


USER_AGENT = "community-site-snapshot-mapper/1.0 (+local-migration-tool)"
DEFAULT_TIMEOUT = 20
# macOS / common filesystems: NAME_MAX ~255 per component; WordPress slugs can be huge.
MAX_PATH_SEGMENT_LEN = 96
MAX_REL_PATH_LEN = 220
TEXTUAL_EXTENSIONS = {
    ".html",
    ".htm",
    ".txt",
    ".md",
    ".json",
    ".xml",
    ".csv",
}
ASSET_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".zip",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".mp4",
    ".mov",
    ".mp3",
}


@dataclass
class CrawlRecord:
    url: str
    path: str
    status_code: int
    content_type: str
    size_bytes: int
    access_guess: str
    content_kind: str
    source: str
    notes: str = ""


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Crawl a site behind login, download pages/assets, generate mapping manifest, "
            "and zip output for private-repo import."
        )
    )
    p.add_argument("--base-url", required=True, help="Site root, e.g. https://sfbaycaving.org")
    p.add_argument(
        "-L",
        "--login-url",
        default="",
        help=(
            "Login endpoint URL. For WordPress use https://host/wp-login.php. "
            "If omitted but -u and password are set, defaults to {base-url}/wp-login.php. "
            "Not used with --no-login."
        ),
    )
    p.add_argument(
        "--redirect-to",
        default="",
        help="WordPress redirect_to after login (default: {base-url}/wp-admin/).",
    )
    p.add_argument(
        "--password-env",
        default="SITE_PASSWORD",
        help="If set, read password from this environment variable when --password is empty.",
    )
    p.add_argument("-u", "--username", default="", help="Login username")
    p.add_argument(
        "-w",
        "--password",
        default="",
        help="Login password (avoid shell history: prefer env SITE_PASSWORD or read from file)",
    )
    p.add_argument(
        "--username-field",
        default="log",
        help="Login form username field name (WordPress default: log)",
    )
    p.add_argument(
        "--password-field",
        default="pwd",
        help="Login form password field name (WordPress default: pwd)",
    )
    p.add_argument(
        "--extra-login-field",
        action="append",
        default=[],
        help="Extra form key=value pair; repeatable (example: --extra-login-field rememberme=forever)",
    )
    p.add_argument(
        "--login-success-contains",
        default="wp-admin",
        help="String that should appear in post-login response URL or body.",
    )
    p.add_argument(
        "--start-path",
        action="append",
        default=[],
        help="Path or absolute URL seed; repeatable. Defaults to base URL only.",
    )
    p.add_argument("--max-pages", type=int, default=500, help="Maximum HTML pages to crawl.")
    p.add_argument("--max-assets", type=int, default=2000, help="Maximum assets to download.")
    p.add_argument("--delay-ms", type=int, default=150, help="Delay between requests.")
    p.add_argument(
        "--allow-subdomains",
        action="store_true",
        help="Also crawl subdomains of base host (default false).",
    )
    p.add_argument(
        "--no-login",
        action="store_true",
        help="Skip login and crawl publicly available content only.",
    )
    p.add_argument(
        "--out-dir",
        default="snapshot_output",
        help="Output directory (will be replaced if already exists).",
    )
    p.add_argument(
        "--zip-name",
        default="snapshot_bundle.zip",
        help="Zip file name to generate in current working directory.",
    )
    p.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress messages on stderr (errors still print).",
    )
    p.add_argument(
        "--progress-pages-every",
        type=int,
        default=1,
        help="Log every N HTML pages (default 1 = each page). Use 5 or 10 for less noise.",
    )
    p.add_argument(
        "--progress-assets-every",
        type=int,
        default=25,
        help="Log asset download progress every N assets (default 25).",
    )
    return p.parse_args()


def progress(args: argparse.Namespace, msg: str) -> None:
    if getattr(args, "quiet", False):
        return
    print(msg, file=sys.stderr, flush=True)


def shorten_url(url: str, max_len: int = 90) -> str:
    if len(url) <= max_len:
        return url
    return url[: max_len - 3] + "..."


def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    fragmentless = parsed._replace(fragment="")
    # Normalize query order for dedupe.
    q = parse_qs(fragmentless.query, keep_blank_values=True)
    sorted_q = urlencode(sorted((k, v2) for k, vals in q.items() for v2 in vals))
    normalized = fragmentless._replace(query=sorted_q)
    return urlunparse(normalized)


def same_site(url: str, base_host: str, allow_subdomains: bool) -> bool:
    host = urlparse(url).netloc.lower()
    if not allow_subdomains:
        return host == base_host.lower()
    return host == base_host.lower() or host.endswith("." + base_host.lower())


def is_probably_html(content_type: str, url_path: str) -> bool:
    ct = (content_type or "").lower()
    if "text/html" in ct or "application/xhtml+xml" in ct:
        return True
    ext = Path(url_path).suffix.lower()
    return ext in {"", ".html", ".htm", "/"}


def _shorten_path_segment(segment: str, *, is_last: bool) -> str:
    """Keep paths within NAME_MAX-style limits; preserve extension on final segment."""
    if len(segment) <= MAX_PATH_SEGMENT_LEN:
        return segment
    digest = hashlib.sha1(segment.encode("utf-8", errors="replace")).hexdigest()[:10]
    if is_last and "." in segment:
        stem, ext = segment.rsplit(".", 1)
        ext = re.sub(r"[^A-Za-z0-9]", "", ext)[:8] or "html"
        budget = MAX_PATH_SEGMENT_LEN - len(digest) - 2  # _d
        budget = max(8, budget)
        return f"{stem[:budget]}_{digest}.{ext}"
    budget = MAX_PATH_SEGMENT_LEN - len(digest) - 1
    budget = max(8, budget)
    return f"{segment[:budget]}_{digest}"


def _cap_relative_path(rel: str, url: str, *, is_html: bool) -> str:
    """Shorten each path component; if still too long, collapse to _long/<hash>.ext."""
    rel = rel.strip("/")
    if not rel:
        return "index.html"
    parts = [p for p in rel.split("/") if p]
    if not parts:
        return "index.html"
    capped = [
        _shorten_path_segment(p, is_last=(i == len(parts) - 1))
        for i, p in enumerate(parts)
    ]
    out = "/".join(capped)
    if len(out) <= MAX_REL_PATH_LEN:
        return out
    h = hashlib.sha1(url.encode("utf-8", errors="replace")).hexdigest()[:20]
    ext = ".html" if is_html else (Path(out).suffix[:10] or ".bin")
    if ext and not ext.startswith("."):
        ext = "." + ext
    return f"_long/{h}{ext}"


def to_safe_relpath(url: str, is_html: bool) -> str:
    parsed = urlparse(url)
    path = parsed.path or "/"
    if path.endswith("/"):
        path = f"{path}index.html"
    elif is_html and not Path(path).suffix:
        path = f"{path}.html"

    if parsed.query:
        qhash = hashlib.sha1(parsed.query.encode("utf-8")).hexdigest()[:10]
        stem = Path(path).stem
        suffix = Path(path).suffix
        parent = str(Path(path).parent)
        path = f"{parent}/{stem}__q_{qhash}{suffix}" if parent != "." else f"{stem}__q_{qhash}{suffix}"

    path = path.lstrip("/")
    path = re.sub(r"[^A-Za-z0-9._/\-]", "_", path)
    path = path or "index.html"
    return _cap_relative_path(path, url, is_html=is_html)


def guess_access_level(url: str, html_text: str) -> str:
    u = url.lower()
    h = html_text.lower()
    if any(k in u for k in ["/admin", "/wp-admin", "/dashboard", "/manage"]):
        return "admin"
    if any(k in u for k in ["/members", "/member", "/private", "/protected"]):
        return "member"
    # Heuristic markers commonly present on access-denied or login-gated pages.
    if any(
        k in h
        for k in [
            "you must be logged in",
            "members only",
            "password protected",
            "log in to continue",
            "admin access required",
        ]
    ):
        return "member"
    return "public"


def guess_content_kind(url: str, content_type: str) -> str:
    ext = Path(urlparse(url).path).suffix.lower()
    ct = (content_type or "").lower()
    if "text/html" in ct or ext in {".html", ".htm", ""}:
        return "page"
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}:
        return "image"
    if ext in {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"}:
        return "document"
    if ext in {".mp4", ".mov", ".avi", ".webm", ".mp3", ".wav"}:
        return "media"
    if ext in {".css", ".js"}:
        return "static"
    return "asset"


def parse_extra_fields(items: List[str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for item in items:
        if "=" not in item:
            raise ValueError(f"Invalid --extra-login-field '{item}'. Expected key=value.")
        k, v = item.split("=", 1)
        out[k] = v
    return out


def ensure_clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def write_binary(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def login_if_needed(
    session: requests.Session,
    args: argparse.Namespace,
    out_logs: Path,
) -> Tuple[bool, str]:
    if args.no_login:
        progress(args, "[login] Skipped (--no-login).")
        return True, "Login skipped (--no-login)."
    password = args.password
    if not password and args.password_env:
        password = os.environ.get(args.password_env, "")
    login_url = (args.login_url or "").strip()
    if not login_url or not args.username or not password:
        return False, (
            "Missing login URL, username, or password. "
            "Use -L https://…/wp-login.php (or omit -L for WordPress: defaults to {base-url}/wp-login.php), "
            "-u USER, -w PASS or SITE_PASSWORD env; or use --no-login."
        )

    progress(args, f"[login] GET {shorten_url(login_url)} …")
    extra = parse_extra_fields(args.extra_login_field)
    payload = {
        args.username_field: args.username,
        args.password_field: password,
        **extra,
    }
    # WordPress compatibility fields (harmless elsewhere).
    payload.setdefault("rememberme", "forever")
    payload.setdefault("testcookie", "1")
    payload.setdefault("wp-submit", "Log In")
    base = args.base_url.rstrip("/")
    redirect = (args.redirect_to or "").strip() or f"{base}/wp-admin/"
    payload.setdefault("redirect_to", redirect)

    try:
        # Prime session first.
        session.get(login_url, timeout=DEFAULT_TIMEOUT)
        progress(args, "[login] POST credentials …")
        r = session.post(login_url, data=payload, timeout=DEFAULT_TIMEOUT, allow_redirects=True)
    except Exception as exc:
        return False, f"Login request failed: {exc!r}"

    status = f"Login POST status={r.status_code}, final_url={r.url}"
    body = r.text.lower()
    ok = (
        args.login_success_contains.lower() in r.url.lower()
        or args.login_success_contains.lower() in body
        or "logout" in body
        or "wp-admin" in r.url.lower()
    )
    write_text(out_logs / "login_response_head.txt", r.text[:8000])
    if ok:
        progress(args, f"[login] OK → {shorten_url(r.url)}")
    else:
        progress(args, "[login] Failed heuristics (see logs/login_response_head.txt).")
    return ok, status


def extract_links_and_assets(page_url: str, html: str) -> Tuple[Set[str], Set[str]]:
    soup = BeautifulSoup(html, "html.parser")
    page_links: Set[str] = set()
    assets: Set[str] = set()

    for a in soup.select("a[href]"):
        href = a.get("href", "").strip()
        if href:
            page_links.add(urljoin(page_url, href))
    for tag, attr in [("img", "src"), ("script", "src"), ("link", "href"), ("source", "src"), ("video", "src"), ("audio", "src")]:
        for node in soup.select(f"{tag}[{attr}]"):
            src = node.get(attr, "").strip()
            if src:
                assets.add(urljoin(page_url, src))

    # srcset URLs
    for node in soup.select("[srcset]"):
        srcset = node.get("srcset", "")
        for part in srcset.split(","):
            token = part.strip().split(" ")[0]
            if token:
                assets.add(urljoin(page_url, token))
    return page_links, assets


def filter_url(url: str) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    if parsed.path.lower().endswith((".ico",)):
        return False
    return True


def build_seeds(base_url: str, start_paths: List[str]) -> List[str]:
    if not start_paths:
        return [base_url]
    out = []
    for p in start_paths:
        if p.startswith("http://") or p.startswith("https://"):
            out.append(p)
        else:
            out.append(urljoin(base_url, p))
    return out


def zip_dir(source_dir: Path, zip_path: Path) -> None:
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(source_dir):
            for f in files:
                fp = Path(root) / f
                zf.write(fp, fp.relative_to(source_dir))


def main() -> int:
    args = parse_args()
    # Resolve password from env if CLI omitted (safer than shell history).
    if not args.password and args.password_env:
        args.password = os.environ.get(args.password_env, "")
    base_url = args.base_url.rstrip("/")
    base_host = urlparse(base_url).netloc
    if not base_host:
        print("Invalid --base-url", file=sys.stderr)
        return 2

    # WordPress: default login URL when credentials given but -L omitted.
    if not args.no_login:
        pwd = args.password or (
            os.environ.get(args.password_env, "") if args.password_env else ""
        )
        if args.username and pwd and not (args.login_url or "").strip():
            args.login_url = urljoin(base_url + "/", "wp-login.php")
            print(f"[INFO] Using default login URL: {args.login_url}", file=sys.stderr)

    out_root = Path(args.out_dir).resolve()
    out_pages = out_root / "pages"
    out_assets = out_root / "assets"
    out_logs = out_root / "logs"
    out_reports = out_root / "reports"
    ensure_clean_dir(out_root)
    out_pages.mkdir(parents=True, exist_ok=True)
    out_assets.mkdir(parents=True, exist_ok=True)
    out_logs.mkdir(parents=True, exist_ok=True)
    out_reports.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    ok, login_status = login_if_needed(session, args, out_logs)
    write_text(out_logs / "login_status.txt", login_status + "\n")
    if not ok:
        print(f"[ERROR] Login failed or unverified: {login_status}", file=sys.stderr)
        print(f"[INFO] See {out_logs}/login_response_head.txt", file=sys.stderr)
        return 3

    seed_urls = build_seeds(base_url, args.start_path)
    q: deque[Tuple[str, str]] = deque((normalize_url(u), "seed") for u in seed_urls if filter_url(u))
    seen_pages: Set[str] = set()
    seen_assets: Set[str] = set()
    records: List[CrawlRecord] = []
    page_count = 0
    asset_count = 0
    html_saved = 0

    progress(
        args,
        f"[crawl] Starting — seeds={len(seed_urls)}, max_pages={args.max_pages}, max_assets={args.max_assets}",
    )

    while q and page_count < args.max_pages:
        url, source = q.popleft()
        if url in seen_pages:
            continue
        seen_pages.add(url)
        if not same_site(url, base_host, args.allow_subdomains):
            continue

        progress(args, f"[crawl] GET (queued={len(q)}) {shorten_url(url)}")

        try:
            r = session.get(url, timeout=DEFAULT_TIMEOUT, allow_redirects=True)
        except Exception as exc:
            progress(args, f"[crawl] ERROR {shorten_url(url)}: {exc!r}")
            records.append(
                CrawlRecord(
                    url=url,
                    path="",
                    status_code=0,
                    content_type="",
                    size_bytes=0,
                    access_guess="unknown",
                    content_kind="error",
                    source=source,
                    notes=f"request error: {exc!r}",
                )
            )
            continue

        final_url = normalize_url(r.url)
        content_type = r.headers.get("content-type", "")
        is_html = is_probably_html(content_type, urlparse(final_url).path)
        body = r.content or b""
        rel = to_safe_relpath(final_url, is_html=is_html)

        if is_html:
            text = r.text
            page_path = out_pages / rel
            write_text(page_path, text)
            access_guess = guess_access_level(final_url, text)
            kind = "page"
            page_links, assets = extract_links_and_assets(final_url, text)
            for link in page_links:
                n = normalize_url(link)
                if filter_url(n) and same_site(n, base_host, args.allow_subdomains):
                    q.append((n, final_url))
            # Queue assets separately for direct download.
            for asset_url in assets:
                a = normalize_url(asset_url)
                if (
                    filter_url(a)
                    and same_site(a, base_host, args.allow_subdomains)
                    and a not in seen_assets
                    and asset_count < args.max_assets
                ):
                    seen_assets.add(a)
                    try:
                        ar = session.get(a, timeout=DEFAULT_TIMEOUT, allow_redirects=True)
                        a_final = normalize_url(ar.url)
                        a_ct = ar.headers.get("content-type", "")
                        a_rel = to_safe_relpath(a_final, is_html=False)
                        write_binary(out_assets / a_rel, ar.content or b"")
                        records.append(
                            CrawlRecord(
                                url=a_final,
                                path=f"assets/{a_rel}",
                                status_code=ar.status_code,
                                content_type=a_ct,
                                size_bytes=len(ar.content or b""),
                                access_guess=guess_access_level(a_final, ""),
                                content_kind=guess_content_kind(a_final, a_ct),
                                source=final_url,
                            )
                        )
                        asset_count += 1
                        if (
                            args.progress_assets_every > 0
                            and asset_count % args.progress_assets_every == 0
                        ):
                            progress(
                                args,
                                f"[crawl] assets saved: {asset_count}/{args.max_assets}",
                            )
                    except Exception as exc:
                        records.append(
                            CrawlRecord(
                                url=a,
                                path="",
                                status_code=0,
                                content_type="",
                                size_bytes=0,
                                access_guess="unknown",
                                content_kind="error",
                                source=final_url,
                                notes=f"asset request error: {exc!r}",
                            )
                        )
            page_count += 1
            html_saved += 1
            if (
                args.progress_pages_every > 0
                and html_saved % args.progress_pages_every == 0
            ):
                progress(
                    args,
                    f"[crawl] HTML saved: {html_saved}/{args.max_pages} pages | queued={len(q)} | → {shorten_url(final_url)}",
                )
        else:
            # If non-HTML discovered in page queue, store as asset.
            write_binary(out_assets / rel, body)
            access_guess = guess_access_level(final_url, "")
            kind = guess_content_kind(final_url, content_type)
            asset_count += 1
            progress(
                args,
                f"[crawl] non-HTML saved as asset ({asset_count} total) | {shorten_url(final_url)}",
            )

        records.append(
            CrawlRecord(
                url=final_url,
                path=(f"pages/{rel}" if is_html else f"assets/{rel}"),
                status_code=r.status_code,
                content_type=content_type,
                size_bytes=len(body),
                access_guess=access_guess,
                content_kind=kind,
                source=source,
            )
        )
        time.sleep(max(0, args.delay_ms) / 1000.0)

    progress(
        args,
        f"[crawl] Finished — HTML pages={html_saved}, assets≈{asset_count}, record rows={len(records)}, queue_left={len(q)}",
    )

    # Write machine-readable manifest.
    progress(args, f"[write] Building reports ({len(records)} records) …")
    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "base_url": base_url,
        "login_used": not args.no_login,
        "limits": {"max_pages": args.max_pages, "max_assets": args.max_assets},
        "counts": {
            "pages_downloaded": sum(1 for r in records if r.content_kind == "page"),
            "assets_downloaded": sum(1 for r in records if r.content_kind != "page" and r.content_kind != "error"),
            "errors": sum(1 for r in records if r.content_kind == "error"),
            "records": len(records),
        },
        "records": [asdict(r) for r in records],
    }
    write_text(out_reports / "manifest.json", json.dumps(manifest, indent=2))

    # Write CSV mapping sheet for manual classification.
    csv_path = out_reports / "mapping.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "url",
                "path",
                "status_code",
                "content_type",
                "size_bytes",
                "content_kind",
                "access_guess",
                "target_bucket",     # d1_content / r2_private / public_static / drop
                "target_visibility", # public / member / admin
                "target_slug",
                "notes",
                "source",
            ],
        )
        writer.writeheader()
        for r in records:
            writer.writerow(
                {
                    "url": r.url,
                    "path": r.path,
                    "status_code": r.status_code,
                    "content_type": r.content_type,
                    "size_bytes": r.size_bytes,
                    "content_kind": r.content_kind,
                    "access_guess": r.access_guess,
                    "target_bucket": "",
                    "target_visibility": r.access_guess if r.access_guess in {"public", "member", "admin"} else "",
                    "target_slug": "",
                    "notes": r.notes,
                    "source": r.source,
                }
            )

    # Write human-readable summary.
    by_access: Dict[str, int] = {}
    by_kind: Dict[str, int] = {}
    for r in records:
        by_access[r.access_guess] = by_access.get(r.access_guess, 0) + 1
        by_kind[r.content_kind] = by_kind.get(r.content_kind, 0) + 1

    summary_lines = [
        "# Site Snapshot Summary",
        "",
        f"- Base URL: `{base_url}`",
        f"- Login used: `{not args.no_login}`",
        f"- Records: `{len(records)}`",
        f"- Pages downloaded: `{manifest['counts']['pages_downloaded']}`",
        f"- Assets downloaded: `{manifest['counts']['assets_downloaded']}`",
        f"- Errors: `{manifest['counts']['errors']}`",
        "",
        "## Counts by Access Guess",
    ]
    for k, v in sorted(by_access.items()):
        summary_lines.append(f"- {k}: {v}")
    summary_lines.append("")
    summary_lines.append("## Counts by Content Kind")
    for k, v in sorted(by_kind.items()):
        summary_lines.append(f"- {k}: {v}")
    summary_lines.append("")
    summary_lines.append("## Next Step")
    summary_lines.append(
        "- Open `reports/mapping.csv`, fill `target_bucket`, `target_visibility`, and `target_slug`, "
        "then import into your private-content repo/CI pipeline."
    )
    write_text(out_reports / "summary.md", "\n".join(summary_lines) + "\n")

    # Zip bundle.
    zip_path = Path(args.zip_name).resolve()
    progress(args, f"[zip] Writing {zip_path.name} …")
    zip_dir(out_root, zip_path)
    progress(args, "[zip] Done.")

    print(f"[OK] Output directory: {out_root}")
    print(f"[OK] Manifest: {out_reports / 'manifest.json'}")
    print(f"[OK] Mapping CSV: {out_reports / 'mapping.csv'}")
    print(f"[OK] Summary: {out_reports / 'summary.md'}")
    print(f"[OK] Zip bundle: {zip_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
