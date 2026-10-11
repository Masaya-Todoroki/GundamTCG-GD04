"""Generate a set JSON from the public GCG API and a matching card-image folder.
Run: python create_json_all_sets.py (requires an internet connection; standard library only)
Data attribution: gcg-api (ODbL 1.0), https://github.com/yzRobo/gcg-api
"""
import json, re, urllib.request, pathlib

# Batch: GD01–GD05, ST01–ST14, EB01.
SET_CODES = ([f'GD{i:02d}' for i in range(1, 6)]
             + [f'ST{i:02d}' for i in range(1, 15)]
             + ['EB01'])
BASE = 'https://api.gcgapi.com/v1'
HERE = pathlib.Path(__file__).resolve().parent
OVERRIDES = HERE / 'pilot_overrides_v2.json'
if not OVERRIDES.exists(): OVERRIDES = HERE / 'pilot_overrides.json'
SET_CODE = ''
IMAGE_DIR = None
OUT = None

def read_cards(path):
    if not path.exists(): return {}
    obj=json.loads(path.read_text(encoding='utf-8'))
    return {c['id']:c for c in (obj.get('cards',[]) if isinstance(obj,dict) else obj)}

def pilot_metadata(c):
    return c.get('pilot') if isinstance(c.get('pilot'), dict) else None

def unique_names(values):
    return list(dict.fromkeys(str(x).strip() for x in values if str(x).strip()))

def detected_aliases(raw):
    # Only extract aliases explicitly described as alternate card names.
    effect = str(raw.get('effect') or '')
    return re.findall(r"(?:card(?:'s|’s)? name is also treated as|name is also treated as)\s*\[([^\]]+)\]", effect, flags=re.I)

def build_pilot(converted, raw, old, override_marker):
    kind = converted['type']
    old_pilot = pilot_metadata(old)
    if override_marker is not ...:
        return override_marker, False
    if kind == 'Pilot':
        aliases = detected_aliases(raw)
        names = unique_names([converted['name'], *(old_pilot or {}).get('names', []), *aliases])
        ap, hp = converted['ap'], converted['hp']
        traits = converted['traits']
        if ap is None or hp is None:
            return old_pilot, True
        return {'names': names, 'ap': ap, 'hp': hp, 'traits': traits}, False
    if kind == 'Command':
        # API sometimes supplies Command/Pilot numeric bonuses as top-level AP/HP.
        # These identify likely dual-purpose cards but do not give us the pilot name.
        if old_pilot:
            return old_pilot, False
        if converted['ap'] is not None and converted['hp'] is not None:
            # Never invent a pilot name: flag for manual review/override.
            return None, True
        return None, False
    return old_pilot, False


def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':f'{SET_CODE}-DeckBuilder-Importer/1.0','Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=40) as r: return json.load(r)

def normalize(raw):
    if isinstance(raw,dict) and 'data' in raw: raw=raw['data']
    if isinstance(raw,dict) and 'cards' in raw: raw=raw['cards']
    return raw

def split_tags(s):
    if isinstance(s,list): return [str(v).strip(' ()[]') for v in s if str(v).strip()]
    return [v.strip(' ()[]') for v in re.split(r'\s*[,;/]\s*',s or '') if v.strip()]

def convert(c):
    cid=str(c.get('card_number') or c.get('product_id') or c.get('id') or '')
    kind=(c.get('card_type') or c.get('type') or '').title()
    if 'Token' in kind or cid.startswith('T-'): kind='Token'
    link_names=[];link_traits=[]
    refs=c.get('link_refs') or []
    if isinstance(refs,str): refs=[refs]
    for r in refs:
        if isinstance(r,dict):
            val=str(r.get('name') or r.get('value') or r.get('text') or '').strip()
            typ=str(r.get('type') or '').lower()
            if 'trait' in typ: link_traits.append(val)
            elif val: link_names.append(val)
        else:
            s=str(r).strip()
            if s.startswith('(') and s.endswith(')'):link_traits.append(s[1:-1])
            elif s.startswith('[') and s.endswith(']'):link_names.append(s[1:-1])
            elif s: link_names.append(s)
    if not refs:
        s=c.get('link') or ''
        link_names.extend(re.findall(r'\[([^\]]+)\]',s))
        link_traits.extend(re.findall(r'\(([^)]+)\)',s))
    traits=split_tags(c.get('traits') or c.get('trait'))
    kw=[]
    for e in c.get('keyword_effects') or []:
        if isinstance(e,dict): kw.append(f"{e.get('keyword','')}{' '+str(e['value']) if e.get('value') is not None else ''}".strip())
        elif e: kw.append(str(e))
    kw.extend(str(v) for v in (c.get('timing_markers') or []) if v)
    effect=c.get('effect') or ''
    created=sorted(set(re.findall(r'\bT-\d{3}\b',effect)))
    return {'id':cid,'name':c.get('name') or cid,'type':kind,'color':c.get('color'),
        'level':c.get('level'),'cost':c.get('cost'),'ap':c.get('ap'),'hp':c.get('hp'),
        'traits':traits,'link_conditions':list(dict.fromkeys(link_names)),
        'pair_conditions':{'pilot_names':[],'pilot_traits':[]},'pilot':None,
        'keywords':list(dict.fromkeys(kw)),'creates_tokens':created,
        'needs_review':False,'link_trait_conditions':list(dict.fromkeys(link_traits))}

def generate_set():
    if not IMAGE_DIR.is_dir():
        print(f"SKIP {SET_CODE}: image folder not found")
        return False
    ids=sorted({p.stem for p in IMAGE_DIR.rglob('*') if p.is_file() and p.suffix.lower()=='.webp'})
    if not ids:
        print(f'SKIP {SET_CODE}: no .webp images found')
        return False
    print('Found',len(ids),'image IDs in folder',IMAGE_DIR)
    data=normalize(get(BASE+f'/sets/{SET_CODE}/cards'))
    if not isinstance(data,list): raise RuntimeError(f'Unexpected API response format for {SET_CODE} set')
    found={}
    for c in data:
        cid=str(c.get('card_number') or c.get('product_id') or '')
        if cid in ids and cid not in found:found[cid]=c
    for cid in ids:
        if cid not in found:
            try:
                card=normalize(get(BASE+'/cards/'+cid))
                if isinstance(card,dict):found[cid]=card
            except Exception as e: print('WARNING: no API record for',cid,':',e)
    missing=[cid for cid in ids if cid not in found]
    existing=read_cards(OUT)
    overrides=json.loads(OVERRIDES.read_text(encoding='utf-8')) if OVERRIDES.exists() else {}
    cards=[]
    for cid in ids:
        if cid not in found: continue
        c=convert(found[cid])
        old=existing.get(cid,{})
        # Preserve manually reviewed relationships, including token fixes.
        for field in ('creates_tokens','pair_conditions','link_conditions','link_trait_conditions'):
            if field in old: c[field]=old[field]
        override_marker=overrides[cid] if cid in overrides else ...
        if override_marker is not ... and override_marker is not None:
            if not isinstance(override_marker,dict) or not all(k in override_marker for k in ('names','ap','hp','traits')):
                raise ValueError(f'Incomplete pilot override for {cid}')
        c['pilot'], review=build_pilot(c, found[cid], old, override_marker)
        c['needs_review']=review
        if 'needs_review' in old and not review:
            # Do not preserve stale Command review flags once classified.
            if c['type'] not in ('Command','Pilot'): c['needs_review']=old['needs_review']
        cards.append(c)
    result={'set':SET_CODE,'cards':cards}
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Wrote',OUT,'with',len(cards),'cards')
    if missing: print('MISSING:',', '.join(missing))
    print('NOTE: Command/Pilot cards with AP/HP but unknown pilot names are marked needs_review=true.')
    print('      Add verified names/stats to pilot_overrides_v2.json (or pilot_overrides.json), then rerun.')
    return True

def main():
    global SET_CODE, IMAGE_DIR, OUT
    completed, skipped, failed = [], [], []
    for code in SET_CODES:
        SET_CODE = code
        IMAGE_DIR = HERE / code
        OUT = HERE / f'{code}.json'
        print(f'\n=== {code} ===')
        try:
            if generate_set(): completed.append(code)
            else: skipped.append(code)
        except Exception as exc:
            print(f'ERROR {code}: {exc}')
            failed.append(code)
    print('\n=== Batch summary ===')
    print('Generated:', ', '.join(completed) or 'none')
    print('Skipped:', ', '.join(skipped) or 'none')
    print('Failed:', ', '.join(failed) or 'none')
    print('Attribution: gcg-api, ODbL 1.0 (https://github.com/yzRobo/gcg-api)')

if __name__=='__main__': main()
