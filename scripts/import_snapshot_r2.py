#!/usr/bin/env python3
"""
Upload files from a treasurer-sfbc/sfbc_site checkout into Cloudflare R2,
using reports/mapping.csv for paths, visibility, and content types.

R2 object keys: {prefix}/{public|member}/{path-from-CSV}

Environment (required unless --dry-run):
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
Optional:
  R2_BUCKET_NAME   (default: sfbc)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

try:
    import boto3
    from botocore.client import Config
except ImportError:
    boto3 = None  # type: ignore


VIS_ORDER = {"public": 0, "member": 1}


def normalize_visibility(raw: str) -> str:
    v = (raw or "member").strip().lower()
    if v == "admin":
        return "member"
    if v in VIS_ORDER:
        return v
    return "member"


def strictest(a: str, b: str) -> str:
    return a if VIS_ORDER.get(a, 0) >= VIS_ORDER.get(b, 0) else b


@dataclass
class ObjectPlan:
    rel_path: str
    visibility: str
    content_type: str


def load_plans(mapping_path: Path) -> Tuple[List[ObjectPlan], int]:
    """Merge duplicate paths; member visibility wins over public."""
    by_path: Dict[str, Tuple[str, str]] = {}
    skipped = 0
    with mapping_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                status = int((row.get("status_code") or "0").strip())
            except ValueError:
                status = 0
            if status != 200:
                skipped += 1
                continue
            rel = (row.get("path") or "").strip().lstrip("/")
            if not rel:
                skipped += 1
                continue
            bucket = (row.get("target_bucket") or "r2_private").strip().lower()
            if bucket and bucket != "r2_private":
                skipped += 1
                continue
            vis = normalize_visibility(row.get("target_visibility") or "member")
            ctype = (row.get("content_type") or "").strip() or "application/octet-stream"
            if rel in by_path:
                old_vis, old_ct = by_path[rel]
                vis = strictest(old_vis, vis)
                # Prefer non-empty content type from latest row if old was default
                ct = ctype if ctype != "application/octet-stream" else old_ct
                by_path[rel] = (vis, ct)
            else:
                by_path[rel] = (vis, ctype)

    plans = [
        ObjectPlan(rel_path=p, visibility=v, content_type=ct)
        for p, (v, ct) in sorted(by_path.items())
    ]
    return plans, skipped


def iter_uploads(
    site_root: Path, plans: Iterable[ObjectPlan], key_prefix: str
) -> Iterable[Tuple[Path, str, str]]:
    """Yields (local_path, r2_key, content_type) or skips missing files."""
    prefix = key_prefix.strip().strip("/")
    for plan in plans:
        local = site_root / plan.rel_path
        if not local.is_file():
            continue
        key = f"{prefix}/{plan.visibility}/{plan.rel_path}".replace("\\", "/")
        yield local, key, plan.content_type


def build_client():
    if boto3 is None:
        print("Install boto3: pip install -r scripts/requirements-importer.txt", file=sys.stderr)
        sys.exit(1)
    account = os.environ.get("R2_ACCOUNT_ID", "").strip()
    key_id = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
    secret = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
    if not (account and key_id and secret):
        print(
            "Missing R2 env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY",
            file=sys.stderr,
        )
        sys.exit(1)
    endpoint = f"https://{account}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        region_name="auto",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Import sfbc_site snapshot files into R2.")
    parser.add_argument(
        "--site-root",
        type=Path,
        required=True,
        help="Root of sfbc_site clone (contains assets/, pages/, reports/).",
    )
    parser.add_argument(
        "--mapping",
        type=Path,
        default=None,
        help="CSV path (default: <site-root>/reports/mapping.csv).",
    )
    parser.add_argument(
        "--bucket",
        default=os.environ.get("R2_BUCKET_NAME", "sfbc").strip(),
        help="R2 bucket name (default: env R2_BUCKET_NAME or sfbc).",
    )
    parser.add_argument(
        "--prefix",
        default="snapshot",
        help="Key prefix before visibility segment (default: snapshot).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned uploads only; do not call R2.",
    )
    parser.add_argument(
        "--manifest-out",
        type=Path,
        default=None,
        help="Write JSON summary to this path (local file).",
    )
    args = parser.parse_args()

    site_root = args.site_root.resolve()
    mapping = args.mapping or (site_root / "reports" / "mapping.csv")
    if not mapping.is_file():
        print(f"Mapping not found: {mapping}", file=sys.stderr)
        sys.exit(1)

    plans, skipped_rows = load_plans(mapping)
    uploads = list(iter_uploads(site_root, plans, args.prefix))
    missing = len(plans) - len(uploads)

    print(
        f"Plans: {len(plans)} unique paths from mapping "
        f"(skipped {skipped_rows} non-200 or empty rows); "
        f"{len(uploads)} files found under {site_root} ({missing} missing on disk)."
    )

    manifest = {
        "bucket": args.bucket,
        "key_prefix": args.prefix.strip().strip("/"),
        "site_root": str(site_root),
        "mapping": str(mapping),
        "objects": len(uploads),
        "skipped_mapping_rows": skipped_rows,
        "missing_files_vs_mapping": missing,
    }

    if args.dry_run:
        for local, key, ct in uploads[:20]:
            print(f"DRY  {key}  <-  {local}  ({ct})")
        if len(uploads) > 20:
            print(f"... and {len(uploads) - 20} more")
        if args.manifest_out:
            args.manifest_out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        return

    client = build_client()
    bucket = args.bucket
    for i, (local, key, ctype) in enumerate(uploads, start=1):
        extra = {"ContentType": ctype}
        client.upload_file(str(local), bucket, key, ExtraArgs=extra)
        if i % 100 == 0 or i == len(uploads):
            print(f"Uploaded {i}/{len(uploads)} …")

    manifest_key = f"{args.prefix.strip().strip('/')}/_manifest.json".replace("\\", "/")
    client.put_object(
        Bucket=bucket,
        Key=manifest_key,
        Body=json.dumps(manifest, indent=2).encode("utf-8"),
        ContentType="application/json",
    )
    print(f"Wrote s3://{bucket}/{manifest_key}")
    if args.manifest_out:
        args.manifest_out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
