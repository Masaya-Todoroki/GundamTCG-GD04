"""Generate a set JSON from the public GCG API and the matching image folder.
Run: python create_json.py and enter the set code when prompted   (requires an internet connection; standard library only)
Data attribution: gcg-api (ODbL 1.0), https://github.com/yzRobo/gcg-api
"""
import json, re, urllib.request, zipfile, pathlib

# Enter the set when the script starts (e.g. GD04, GD05, GD06, ST11).
SET_CODE = input('Enter set code (e.g. GD04, GD05, GD06): ').strip().upper()
if not re.fullmatch(r'(?:GD|ST|EB)\d{2}', SET_CODE):
    raise SystemExit('Invalid set code. Please enter something like GD04 or ST11.')

BASE = 'https://api.gcgapi.com/v1'
HERE = pathlib.Path(__file__).resolve().parent
# Image set folders sit beside this script (e.g. Cards/ST13).
IMAGE_DIR = HERE / SET_CODE
ZIP = HERE / f'{SET_CODE}.zip'  # Optional fallback for older sets
# Save JSON beside the script, matching the existing folder layout.
OUT = HERE / f'{SET_CODE}.json'

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

def main():
    extensions = {'.webp', '.png', '.jpg', '.jpeg'}
    if IMAGE_DIR.is_dir():
        ids = sorted({p.stem.upper() for p in IMAGE_DIR.iterdir()
                      if p.is_file() and p.suffix.lower() in extensions})
        print('Found', len(ids), 'image IDs in', IMAGE_DIR)
    elif ZIP.is_file():
        with zipfile.ZipFile(ZIP) as z:
            ids = sorted({pathlib.PurePosixPath(n).stem.upper() for n in z.namelist()
                          if pathlib.PurePosixPath(n).suffix.lower() in extensions})
        print('Found', len(ids), 'image IDs in ZIP (fallback)')
    else:
        raise SystemExit(f'No image folder at {IMAGE_DIR} (or fallback {ZIP}).')
    if not ids:
        raise SystemExit('No image files found. Check the set folder and filenames.')
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
    cards=[convert(found[cid]) for cid in ids if cid in found]
    result={'set':SET_CODE,'cards':cards}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Wrote',OUT,'with',len(cards),'cards')
    if missing: print('MISSING:',', '.join(missing))
    print('NOTE: Pair compatibility and token creation references may require manual review.')
    print('Attribution: gcg-api, ODbL 1.0 (https://github.com/yzRobo/gcg-api)')
if __name__=='__main__':main()
