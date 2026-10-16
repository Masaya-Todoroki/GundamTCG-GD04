#!/usr/bin/env python3
"""Build Gundam Card Game deck-builder JSON from set image folders.

Place this script in DeckBuilder/ (with Cards/GD06/ and Data/GD06.json),
or beside GD06/ and GD06.json. Card images must be named by ID.
Run:
    python create_json_from_images_v7.py --sets ST12
    python create_json_from_images_v7.py --sets ST12 --dry-run
    python create_json_from_images_v7.py  # enter GD06, ST12, or all

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
CARDS_DIR = ROOT / "Cards" if (ROOT / "Cards").is_dir() else ROOT
DATA_DIR = ROOT / "Data" if (ROOT / "Data").is_dir() else ROOT
API = "https://api.gcgapi.com/v1"
OFFICIAL = "https://www.gundam-gcg.com/en/cards/detail.php?detailSearch="
DEFAULT_SETS = ([f"GD{i:02d}" for i in range(1, 7)]
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
    folder = CARDS_DIR / code
    if not folder.is_dir() and not args.all_cards:
        print(f"  SKIP: {folder.name}/ not found")
        return False
    ids = image_ids(folder, code) if folder.is_dir() else []
    target = DATA_DIR / f"{code}.json"
    print(f"  Found {len(ids)} image card IDs")
    data = unwrap(request_json(f"{API}/sets/{code}/cards"))
    if not isinstance(data, list):
        raise ValueError(f"Unexpected API set response for {code}")
    if args.all_cards:
        ids = sorted(set(ids) | {str(c.get("card_number") or c.get("product_id") or c.get("id") or "").upper()
                                 for c in data if isinstance(c, dict)
                                 and re.fullmatch(rf"{re.escape(code)}-\\d{{3}}", str(c.get("card_number") or c.get("product_id") or c.get("id") or ""), re.I)})
    if not ids:
        print(f"  SKIP: no matching cards in images or API")
        return False
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
    previous = {}
    if target.exists():
        try:
            old_data = unwrap(json.loads(target.read_text(encoding="utf-8")))
            if isinstance(old_data, list):
                previous = {c["id"]: c for c in old_data if isinstance(c, dict) and c.get("id")}
        except Exception as exc:
            print(f"  WARN: couldn't read previous JSON ({exc})")
    result = []
    for cid in ids:
        if cid not in records:
            if cid in previous:
                card = dict(previous[cid])
                print(f"    KEEP {cid}: existing data (API unavailable)")
            else:
                card = {
                    "id": cid, "name": cid, "type": None, "color": None,
                    "level": None, "cost": None, "ap": None, "hp": None,
                    "traits": [], "link_conditions": [],
                    "pair_conditions": {"pilot_names": [], "pilot_traits": []},
                    "pilot": None, "keywords": [], "creates_tokens": [],
                    "needs_review": True,
                }
                print(f"    PLACEHOLDER {cid}: API data unavailable")
        else:
            card = convert(records[cid])
            resolve_pilot(card, records[cid], not args.no_official, args.delay)
        if cid in previous and cid in records and not args.replace_existing:
            old = previous[cid]
            # Keep any existing manually entered nonempty fields, including nested data.
            # Fill blanks with newly fetched API values instead.
            def merge_keep(old_value, new_value):
                if isinstance(old_value, dict) and isinstance(new_value, dict):
                    return {k: merge_keep(old_value[k], new_value[k]) if k in old_value and k in new_value
                            else old_value.get(k, new_value.get(k)) for k in set(old_value) | set(new_value)}
                if old_value is not None and old_value != "" and old_value != []:
                    return old_value
                return new_value
            card = merge_keep(old, card)
            if old.get("name") == cid:
                card["name"] = records[cid].get("name") or cid
            if old.get("needs_review") is True and records[cid].get("name"):
                card["needs_review"] = False
        result.append(card)
    missing = [cid for cid in ids if cid not in records]
    if missing:
        print("  NOTE: image IDs without API records:", ", ".join(missing))
    review = [card["id"] for card in result if card.get("needs_review")]
    print(f"  Output: {len(result)} cards; {len(review)} flagged for review")
    if args.dry_run:
        print("  DRY RUN: no files changed")
        return True
    DATA_DIR.mkdir(parents=True, exist_ok=True)
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
    parser.add_argument("--sets", nargs="+", default=None,
                        help="Set codes to process, or all for all set folders")
    parser.add_argument("--dry-run", action="store_true", help="Report without writing JSON")
    parser.add_argument("--all-cards", action="store_true", help="Include all API cards even without a matching image")
    parser.add_argument("--replace-existing", action="store_true", help="Replace manually edited fields with API data")
    parser.add_argument("--no-official", action="store_true",
                        help="Skip official Command/Pilot lookup (these cards will be flagged for review)")
    parser.add_argument("--delay", type=float, default=0.2,
                        help="Seconds between official card requests (default 0.2)")
    args = parser.parse_args()
    if args.sets is None:
        try:
            selection = input("Enter set name (e.g. GD06, ST12) or 'all': ").strip()
        except EOFError:
            parser.error("No input available. Use --sets GD06 or --sets all.")
        if not selection:
            parser.error("Please enter a set name or 'all'.")
        selected = re.split(r"[\s,]+", selection.upper())
    else:
        selected = [x.upper() for x in args.sets]

    if "ALL" in selected:
        selected = sorted(p.name.upper() for p in CARDS_DIR.iterdir()
                          if p.is_dir() and re.fullmatch(r"(?:GD|ST|EB)\d{2}", p.name, re.I))
        if not selected:
            parser.error("No set folders found beside the script.")
        print("Found set folders:", ", ".join(selected))
    else:
        invalid = [x for x in selected if not re.fullmatch(r"(?:GD|ST|EB)\d{2}", x)]
        if invalid:
            parser.error("Invalid set code(s): " + ", ".join(invalid))

    success, failed = [], []
    for code in dict.fromkeys(selected):
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
