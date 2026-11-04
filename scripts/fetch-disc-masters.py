#!/usr/bin/env python3
"""Build data/disc-masters.tsv from archived SerialStation pages.

Reads a CDX jsonl of [original, timestamp] (one capture per title) and keeps
the disc table's Data Version. Does not store package URLs or file trees.

  python3 scripts/fetch-disc-masters.py /tmp/sswork/cdx.jsonl
"""

from __future__ import annotations

import gzip
import html
import http.client
import json
import os
import re
import ssl
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "disc-masters.tsv"
SEEN = ROOT / "data" / "disc-masters.seen"
UA = "consolecheat-title-id-finder/disc-masters"
VER = re.compile(r"^\d{2}\.\d{2}$")
ID_EXACT = re.compile(r"^(CUSA|PPSA)-?(\d{5})$", re.I)
PAGE = re.compile(r"/titles/(CUSA|PPSA)/(\d{5})/?$", re.I)


def captures(path: Path) -> list[tuple[str, str, str]]:
    best: dict[str, tuple[str, str]] = {}
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        original, timestamp = json.loads(line)
        match = PAGE.search(original)
        if not match:
            continue
        title_id = match.group(1).upper() + match.group(2)
        previous = best.get(title_id)
        if previous is None or timestamp > previous[0]:
            best[title_id] = (timestamp, original)
    return [(title_id, timestamp, original) for title_id, (timestamp, original) in best.items()]


def cell_text(fragment: str) -> str:
    text = re.sub(r"<[^>]+>", " ", fragment)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def clean_edition(edition: str) -> str:
    edition = edition.replace("|", " ").replace("=", " ").replace("\t", " ").strip()
    parts = [part.strip() for part in edition.split(",") if part.strip() and part.strip().lower() != "original"]
    return ", ".join(parts)[:48]


def parse_discs(page: str) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>", page, flags=re.I | re.S):
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", tr, flags=re.I | re.S)
        if len(cells) < 5:
            continue
        texts = [cell_text(cell) for cell in cells]
        system = next((text for text in texts if text in {"PS4", "PS5"}), "")
        version = next((text for text in texts if VER.match(text)), "")
        exact = []
        for text in texts:
            match = ID_EXACT.match(text.replace(" ", ""))
            if match:
                exact.append(match.group(1).upper() + match.group(2))
        if not system or not version or not exact:
            continue
        # The internal-id column is the last exact id; the label column may repeat it.
        title_id = exact[-1]
        edition = texts[1] if len(texts) > 1 else ""
        rows.append((title_id, clean_edition(edition), version))
    return rows


def spec_for(rows: list[tuple[str, str]]) -> str:
    unique: list[tuple[str, str]] = []
    for item in rows:
        if item not in unique:
            unique.append(item)
    versions = {version for _edition, version in unique}
    if len(versions) == 1:
        return next(iter(versions))
    return "|".join(f"{edition}={version}" if edition else version for edition, version in unique)


def load_grouped(path: Path) -> dict[str, list[tuple[str, str]]]:
    grouped: dict[str, list[tuple[str, str]]] = {}
    if not path.exists():
        return grouped
    for line in path.read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        title_id, spec = line.split("\t", 1)
        rows: list[tuple[str, str]] = []
        for part in spec.split("|"):
            if "=" in part:
                edition, version = part.split("=", 1)
                rows.append((edition, version))
            else:
                rows.append(("", part))
        grouped[title_id] = rows
    return grouped


def load_seen(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {line.strip() for line in path.read_text().splitlines() if line.strip()}


def write_out(grouped: dict[str, list[tuple[str, str]]]) -> None:
    lines = [f"{title_id}\t{spec_for(grouped[title_id])}" for title_id in sorted(grouped)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tsv.tmp")
    tmp.write_text("\n".join(lines) + ("\n" if lines else ""))
    tmp.replace(OUT)


def mark_seen(title_id: str) -> None:
    SEEN.parent.mkdir(parents=True, exist_ok=True)
    with SEEN.open("a") as handle:
        handle.write(title_id + "\n")


def fetch_page(conn_box: list, url_path: str) -> str | None:
    """GET one archived page on a kept-alive connection. None if it is not a 200."""
    last = "error"
    for attempt in range(8):
        if conn_box[0] is None:
            conn_box[0] = http.client.HTTPSConnection(
                "web.archive.org", timeout=30, context=ssl.create_default_context()
            )
        conn = conn_box[0]
        loc = url_path
        try:
            for _hop in range(4):
                conn.request(
                    "GET",
                    loc,
                    headers={
                        "User-Agent": UA,
                        "Accept-Encoding": "gzip",
                        "Connection": "keep-alive",
                    },
                )
                resp = conn.getresponse()
                body = resp.read()
                status = resp.status
                if status in {301, 302, 303, 307, 308}:
                    nxt = resp.getheader("Location") or ""
                    if "web.archive.org" in nxt:
                        loc = nxt.split("web.archive.org", 1)[1]
                        continue
                    if nxt.startswith("/"):
                        loc = nxt
                        continue
                    return None
                if status in {429, 503, 502, 504}:
                    last = str(status)
                    time.sleep(min(20, 4 + attempt * 3))
                    break
                if status != 200:
                    return None
                if body[:2] == b"\x1f\x8b":
                    body = gzip.decompress(body)
                return body.decode("utf-8", "replace")
            else:
                return None
        except Exception as exc:  # noqa: BLE001
            last = type(exc).__name__
            try:
                conn.close()
            except Exception:
                pass
            conn_box[0] = None
            time.sleep(min(20, 2 + attempt * 2))
            continue
    raise RuntimeError(last)


def main() -> None:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/sswork/cdx.jsonl")
    items = captures(source)
    seen = load_seen(SEEN)
    grouped = load_grouped(OUT)
    pending = [item for item in items if item[0] not in seen]
    print(f"captures {len(items)} pending {len(pending)} already {len(grouped)}", flush=True)
    done = 0
    failed = 0
    conn_box: list = [None]
    started = time.time()
    for title_id, timestamp, original in pending:
        url_path = f"/web/{timestamp}id_/{original}"
        try:
            page = fetch_page(conn_box, url_path)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("fetch", title_id, type(exc).__name__, exc, flush=True)
            continue
        done += 1
        if page:
            for found_id, edition, version in parse_discs(page):
                bucket = grouped.setdefault(found_id, [])
                item = (edition, version)
                if item not in bucket:
                    bucket.append(item)
        # Flush before marking the id seen so a kill cannot drop a parsed disc.
        write_out(grouped)
        mark_seen(title_id)
        if done % 25 == 0:
            rate = done / max(time.time() - started, 0.1)
            print(
                f"fetched {done}/{len(pending)} with-disc {len(grouped)} failed {failed} {rate:.2f}/s",
                flush=True,
            )
    if conn_box[0] is not None:
        conn_box[0].close()
    write_out(grouped)
    print(f"wrote {OUT} rows={len(grouped)} failed={failed}", flush=True)


if __name__ == "__main__":
    main()
