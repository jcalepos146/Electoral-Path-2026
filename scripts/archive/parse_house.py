import json,re,sys
src,out=sys.argv[1],sys.argv[2]
d=json.load(open(src))['parse']['wikitext']
STATES=["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"]
heads=[(m.start(),m.group(2).strip()) for m in re.finditer(r'^(==)\s*([^=].*?)\s*\1\s*$', d, re.M)]
def clean(s):
    s=re.sub(r'<ref[^>]*/>','',s); s=re.sub(r'<ref[^>]*>.*?</ref>','',s,flags=re.S)
    s=re.sub(r'\[\[[^|\]]*\|([^\]]*)\]\]',r'\1',s); s=re.sub(r'\[\[([^\]]*)\]\]',r'\1',s)
    s=s.replace("'''","").replace("''","")
    return s.strip()
PARTY={'Independent American':'O','DFL':'D','Democratic':'D','Republican':'R','Independent':'I','Libertarian':'L','Green':'G'}
def pcode(p):
    for k,v in PARTY.items():
        if k.lower() in p.lower(): return v
    return 'O'
races=[]
for i,(pos,name) in enumerate(heads):
    if name not in STATES: continue
    end=heads[i+1][0] if i+1<len(heads) else len(d)
    sec=d[pos:end]
    rows=re.split(r'\n\|-[^\n]*',sec)
    cur=None
    for r in rows:
        m=re.search(r'\{\{ushr\|(\w\w)\|(\w+)\|X\}\}',r)
        if m:
            cur={'state':name,'st':m.group(1),'district':m.group(2),'chunks':[r]}
            races.append(cur)
        elif cur and (r.strip().startswith('|') ) and '{{ushr' not in r:
            cur['chunks'].append(r)
res=[]
for r in races:
    txt='\n'.join(r['chunks'])
    cands=[]
    for line in txt.split('\n'):
        if 'party stripe' in line.lower() and line.lstrip().startswith('*'):
            win=bool(re.search(r'\{\{[Aa]ye\}\}',line))
            nm=clean(re.sub(r'\{\{[^{}]*\}\}','',line).lstrip('* '))
            mm=re.match(r'(.*?)\s*\(([^()]*)\)\s*([\d.]+%)?\s*$',nm)
            cname,party,pct=(mm.group(1).strip(),mm.group(2).strip(),mm.group(3)) if mm else (nm,'',None)
            cands.append({'name':cname,'party':party,'p':pcode(party),'winner':win,'pct':float(pct[:-1]) if pct else None})
    # incumbents
    incs=[]
    for mm in re.finditer(r'\{\{sortname\|([^|}]*)\|([^|}]*)',txt):
        incs.append(mm.group(1)+' '+mm.group(2))
    ip=re.findall(r'(?:#B0CEFF"?\s*\|\s*|#FFB6B6"?\s*\|\s*)(Democratic|Republican)',txt)
    status=' '.join(clean(x) for x in re.findall(r'\|\s*(?:\{\{Party shading[^}]*\}\}\s*\|)?\s*((?:New member|Incumbent|Member)[^\n]*)',txt))
    status=re.sub(r'<br\s*/?>',' ',status); status=re.sub(r'\{\{[^}]*\}\}','',status).strip()
    winners=[c for c in cands if c['winner']]
    gain=bool(re.search(r'gain\.',status,re.I))
    res.append({'state':r['state'],'st':r['st'],'district':r['district'],
        'incumbents':incs,'incumbent_parties':[pcode(x) for x in ip],
        'status':status,'candidates':cands,
        'winner':winners[0]['name'] if winners else None,
        'winner_party':winners[0]['p'] if winners else None,
        'flip':gain,'called':bool(winners)})
json.dump(res,open(out,'w'),indent=1)
from collections import Counter
print(len(res), Counter(x['winner_party'] for x in res), 'flips',sum(x['flip'] for x in res))
print(Counter(x['state'] for x in res if not x['called']))
