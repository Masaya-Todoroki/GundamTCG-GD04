#!/usr/bin/env python3
"""Build Gundam Card Game deck-builder JSON from set image folders.

Place this script beside ST12/, GD05/, etc. with card images named by card ID (e.g. ST12-001.webp).
Run:
    python create_json_from_images_v6.py --sets ST12
    python create_json_from_images_v6.py --sets ST12 --dry-run
    python create_json_from_images_v6.py

Standard library only. Requires internet for GCG API and official card lookup.
Data: gcg-api (ODbL 1.0), https://github.com/yzRobo/gcg-api
"""
import argparse
import html
import json
import pathlib
import re
import shutil
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent
API = "https://api.gcgapi.com/v1"
OFFICIAL = "https://www.gundam-gcg.com/en/cards/detail.php?detailSearch="
DEFAULT_SETS = ([f"GD{i:02d}" for i in range(1, 6)]
                + [f"ST{i:02d}" for i in range(1, 15)] + ["EB01"])
IMAGE_EXTENSIONS = {".webp", ".png", ".jpg", ".jpeg"}

def unique(items):
    return list(dict.fromkeys(str(x).strip() for x in items if x is not None and str(x).strip()))

def request_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "GCG-DeckBuilder-Generator/3.0",
                                               "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)

def unwrap(obj):
    if isinstance(obj, dict):
        obj = obj.get("data", obj)
        if isinstance(obj, dict):
            obj = obj.get("cards", obj)
    return obj

def split_tags(value):
    """Normalize traits; a printed dash means the card has no traits."""
    if isinstance(value, list):
        values = value
    elif not value:
        values = []
    else:
        values = re.split(r"\s*[,;/]\s*", str(value))
    return unique(
        cleaned for item in values
        if (cleaned := str(item).strip(" ()[]\t\r\n")) not in ("", "-", "–", "—")
    )

def parse_links(raw):
    names, traits = [], []
    refs = raw.get("link_refs") or []
    if isinstance(refs, str):
        refs = [refs]
    for ref in refs:
        if isinstance(ref, dict):
            value = str(ref.get("name") or ref.get("value") or ref.get("text") or "").strip()
            if "trait" in str(ref.get("type") or "").lower():
                traits.append(value)
            elif value:
                names.append(value)
        else:
            value = str(ref).strip()
            if value.startswith("(") and value.endswith(")"):
                traits.append(value[1:-1])
            elif value.startswith("[") and value.endswith("]"):
                names.append(value[1:-1])
            elif value:
                names.append(value)
    if not refs:
        value = str(raw.get("link") or "")
        names.extend(re.findall(r"\[([^\]]+)\]", value))
        traits.extend(re.findall(r"\(([^)]+)\)", value))
    return unique(names), unique(traits)

def aliases_from_effect(raw):
    effect = str(raw.get("effect") or "")
    patterns = [
        r"(?:card(?:'s|’s)? name is also treated as|name is also treated as)\s*\[([^\]]+)\]",
        r"(?:also treated as|also considered)\s*\[([^\]]+)\]",
    ]
    return unique(match for pat in patterns for match in re.findall(pat, effect, re.I))

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skipping = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.skipping += 1
        elif not self.skipping and tag in ("br", "p", "div", "dt", "dd", "li"):
            self.parts.append(" ")
    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self.skipping = max(0, self.skipping - 1)
        elif not self.skipping and tag in ("p", "div", "dt", "dd", "li"):
            self.parts.append(" ")
    def handle_data(self, data):
        if not self.skipping:
            self.parts.append(data)

def official_pilot_names(cid):
    req = urllib.request.Request(OFFICIAL + urllib.parse.quote(cid),
                                 headers={"User-Agent": "Mozilla/5.0",
                                          "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=25) as response:
        page = response.read().decode("utf-8", "replace")
    extractor = TextExtractor()
    extractor.feed(page)
    text = html.unescape(" ".join(extractor.parts))
    # Official Command/Pilot text contains 〖Pilot〗[Name].
    names = re.findall(r"[〖【]\s*Pilot\s*[〗】]\s*\[([^\]]+)\]", text, re.I)
    if not names:
        # Some page versions keep the markup together but split visible text.
        names = re.findall(r"(?:Pilot)\s*[:：]?\s*\[([^\]]+)\]", text, re.I)
    return unique(names)

def pilot_names_from_existing(old):
    pilot = old.get("pilot")
    if isinstance(pilot, dict):
        names = pilot.get("names") or []
        if isinstance(names, list):
            return unique(names)
        if isinstance(pilot.get("name"), str):
            return [pilot["name"].strip()]
    return []

def convert(raw):
    cid = str(raw.get("card_number") or raw.get("product_id") or raw.get("id") or "")
    kind = str(raw.get("card_type") or raw.get("type") or "").title()
    if "Token" in kind or cid.startswith("T-"):
        kind = "Token"
    link_names, link_traits = parse_links(raw)
    kw = []
    for effect in raw.get("keyword_effects") or []:
        if isinstance(effect, dict):
            value = effect.get("value")
            kw.append(f"{effect.get('keyword', '')}{' ' + str(value) if value is not None else ''}".strip())
        elif effect:
            kw.append(str(effect))
    kw.extend(str(x) for x in raw.get("timing_markers") or [] if x)
    return {
        "id": cid, "name": raw.get("name") or cid, "type": kind,
        "color": raw.get("color"), "level": raw.get("level"),
        "cost": raw.get("cost"), "ap": raw.get("ap"), "hp": raw.get("hp"),
        "traits": split_tags(raw.get("traits") or raw.get("trait")),
        "link_conditions": unique([*link_names, *link_traits]),
        "pair_conditions": {"pilot_names": [], "pilot_traits": []},
        "pilot": None, "keywords": unique(kw),
        "creates_tokens": unique(re.findall(r"\bT-\d{3}\b", str(raw.get("effect") or ""))),
        "needs_review": False,
    }

def image_ids(folder, code):
    ids = set()
    for path in folder.rglob("*"):
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
            match = re.search(rf"\b({re.escape(code)}-\d{{3}})\b", path.stem, re.I)
            if match:
                ids.add(match.group(1).upper())
            elif re.fullmatch(r"T-\d{3}", path.stem, re.I):
                ids.add(path.stem.upper())
    return sorted(ids)

def resolve_pilot(card, raw, lookup, delay):
    kind, cid = card["type"], card["id"]
    existing_names = []
    if kind == "Pilot":
        names = unique([card["name"], *existing_names, *aliases_from_effect(raw)])
        if card["ap"] is None or card["hp"] is None:
            card["needs_review"] = True
        card["pilot"] = {"names": names}
    elif kind == "Command" and card["ap"] is not None and card["hp"] is not None:
        names = []
        if lookup:
            try:
                names = official_pilot_names(cid)
            except Exception as exc:
                print(f"    WARN {cid}: official lookup failed ({exc})")
            if delay:
                time.sleep(delay)
        names = unique([*names, *existing_names])
        if names:
            card["pilot"] = {"names": names}
        else:
            card["pilot"] = None
            card["needs_review"] = True
            print(f"    REVIEW {cid}: Command with AP/HP; Pilot name not verified")
    else:
        card["pilot"] = None
    # AP/HP/traits are ALWAYS top-level, never repeated in pilot.

def generate(code, args):
    folder = ROOT / code
    if not folder.is_dir():
        print(f"  SKIP: {folder.name}/ not found")
        return False
    ids = image_ids(folder, code)
    if not ids:
        print(f"  SKIP: no matching card images in {folder.name}/")
        return False
    target = ROOT / f"{code}.json"
    print(f"  Found {len(ids)} image card IDs")
    data = unwrap(request_json(f"{API}/sets/{code}/cards"))
    if not isinstance(data, list):
        raise ValueError(f"Unexpected API set response for {code}")
    records = {}
    for item in data:
        cid = str(item.get("card_number") or item.get("product_id") or item.get("id") or "")
        if cid in ids and cid not in records:
            records[cid] = item
    for cid in ids:
        if cid not in records:
            try:
                card = unwrap(request_json(f"{API}/cards/{cid}"))
                if isinstance(card, dict):
                    records[cid] = card
            except Exception as exc:
                print(f"    WARN {cid}: API record unavailable ({exc})")
    result = []
    for cid in ids:
        if cid not in records:
            continue
        card = convert(records[cid])
        resolve_pilot(card, records[cid], not args.no_official, args.delay)
        result.append(card)
    missing = [cid for cid in ids if cid not in records]
    if missing:
        print("  ERROR: image IDs with no API record:", ", ".join(missing))
        print("  Refusing to overwrite output with incomplete data")
        return False
    review = [card["id"] for card in result if card.get("needs_review")]
    print(f"  Output: {len(result)} cards; {len(review)} flagged for review")
    if args.dry_run:
        print("  DRY RUN: no files changed")
        return True
    if target.exists():
        backup = target.with_suffix(".json.bak")
        shutil.copy2(target, backup)
        print(f"  Previous output backed up: {backup.name}")
    tmp = target.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"set": code, "cards": result},
                              ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(target)
    print(f"  Wrote {target.name}")
    return True

def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sets", nargs="+", default=DEFAULT_SETS,
                        help="Set codes to process (default: GD01-GD05, ST01-ST14, EB01)")
    parser.add_argument("--dry-run", action="store_true", help="Report without writing JSON")
    parser.add_argument("--no-official", action="store_true",
                        help="Skip official Command/Pilot lookup (these cards will be flagged for review)")
    parser.add_argument("--delay", type=float, default=0.2,
                        help="Seconds between official card requests (default 0.2)")
    args = parser.parse_args()
    success, failed = [], []
    for code in dict.fromkeys(x.upper() for x in args.sets):
        print(f"\n=== {code} ===")
        try:
            if generate(code, args):
                success.append(code)
            else:
                failed.append(code)
        except Exception as exc:
            failed.append(code)
            print(f"  ERROR: {exc}")
    print(f"\nDone. Generated: {', '.join(success) or 'none'}; failed: {', '.join(failed) or 'none'}")
    if failed:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
