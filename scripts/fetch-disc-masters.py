#!/usr/bin/env python3
"""Build data/disc-masters.tsv from archived SerialStation pages.

Reads a CDX jsonl of [original, timestamp] (one capture per title) and keeps
the disc table's Data Version. Does not store package URLs or file trees.

  python3 scripts/fetch-disc-masters.py /tmp/sswork/cdx.jsonl
"""

from __future__ import annotations

import gzip
import html
import json
import os
import re
import subprocess
import sys
import tempfile
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


def fetch_page(url: str) -> str | None:
    """Return HTML, or None when the capture is not a 200. Raises on throttle."""
    last = "error"
    for attempt in range(12):
        fd, path = tempfile.mkstemp(prefix="disc-")
        os.close(fd)
        try:
            result = subprocess.run(
                [
                    "curl",
                    "-sS",
                    "--compressed",
                    "--http1.1",
                    "-L",
                    "--max-redirs",
                    "3",
                    "-m",
                    "40",
                    "-A",
                    UA,
                    "-o",
                    path,
                    "-w",
                    "%{http_code}",
                    url,
                ],
                capture_output=True,
                text=True,
            )
            status = (result.stdout or "").strip()
            if result.returncode != 0 or status in {"000", "429", "503", "502", "504"}:
                last = status or (result.stderr or "").strip()[:160]
                time.sleep(min(40, 8 + attempt * 4))
                continue
            if status != "200":
                return None
            raw = Path(path).read_bytes()
            if raw[:2] == b"\x1f\x8b":
                raw = gzip.decompress(raw)
            return raw.decode("utf-8", "replace")
        finally:
            try:
                os.remove(path)
            except OSError:
                pass
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
    for title_id, timestamp, original in pending:
        url = f"https://web.archive.org/web/{timestamp}id_/{original}"
        try:
            page = fetch_page(url)
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
            print(f"fetched {done}/{len(pending)} with-disc {len(grouped)} failed {failed}", flush=True)
        else:
            print(f"ok {title_id} discs {len(grouped)}", flush=True)
    write_out(grouped)
    print(f"wrote {OUT} rows={len(grouped)} failed={failed}", flush=True)


if __name__ == "__main__":
    main()
