import json,re,collections
C='/home/claude/civic/'; O='/home/claude/out3/'
W=json.load(open(C+'want.json'))
wiki=[m for m in json.load(open('/home/claude/data2/measures_all.json')) if m['date'].startswith('Nov')]
AB={t['state']:t['st'] for t in json.load(open('/home/claude/out/state_tiles.json'))}
IDRE=re.compile(r'\b(amendment|proposition|propostion|prop\.?|question|issue|measure|initiative|referendum|hjr|sjr|state question|bond question|ca no\.?|amendment no\.?)\s*([a-z]{1,2}\b|\d+)',re.I)
def nid(s):
    s=re.sub(r'house joint resolution','hjr',s,flags=re.I)
    K={'propostion':'proposition','prop':'proposition','prop.':'proposition','ca no.':'amendment','ca no':'amendment','amendment no.':'amendment','amendment no':'amendment'}
    return {(K.get(a.lower(),a.lower()),b.lower().lstrip('0') or '0') for a,b in IDRE.findall(s)}
STOP=set('the a an of to for and or in on by with from require requires allow allows amendment measure initiative state constitution constitutional question proposition'.split())
def toks(s): return {w for w in re.findall(r'[a-z]{4,}',s.lower()) if w not in STOP}
out=[];used=set()
for w in W:
    if w['type'] in ('US Senate','Governor','House of Representatives'): continue
    d=json.load(open(f"{C}det/{w['id']}.json")); st=w['province']
    if st in ('US','GU','VI','MP','PR','AS'): continue
    yes=no=0
    for c in d['candidates']:
        n=c['name'].strip().lower()
        if re.match(r'^(yes|for|approve|approved|adopt)',n): yes+=c['votes'] or 0
        elif re.match(r'^(no|against|reject|rejected)',n): no+=c['votes'] or 0
    if not yes+no: continue
    name=w['election_name']
    best=None;bs=0
    for i,m in enumerate(wiki):
        if AB[m['state']]!=st or i in used: continue
        sc=10 if (nid(name)&nid(m['measure'])) else 0
        sc+=min(len(toks(name)&toks(m['measure']+' '+m['description'])),6)
        if sc>bs: bs,best=sc,i
    desc=meas=''
    if best is not None and bs>=4: used.add(best); desc=wiki[best]['description']; meas=wiki[best]['measure']
    state=[k for k,v in AB.items() if v==st][0]
    out.append({'id':f'{st}: {name}'[:170],'st':st,'state':state,'ballot_name':name,'measure':meas,'description':desc,
                'yes_votes':yes,'no_votes':no,'yes_pct':round(100*yes/(yes+no),1),'no_pct':round(100*no/(yes+no),1),
                'count':f"{d['percent_reporting']}% reporting (civicAPI, Nov. 9)",'called':'Yes' if d.get('called_at') else ''})
for i,m in enumerate(wiki):
    if i in used: continue
    st=AB[m['state']]
    if any(o['st']==st for o in out): continue
    out.append({'id':f"{st}: {m['measure']}"[:170],'st':st,'state':m['state'],'ballot_name':'','measure':m['measure'],'description':m['description'],
                'yes_votes':None,'no_votes':None,'yes_pct':None,'no_pct':None,'count':'No count in source','called':''})
out.sort(key=lambda r:(r['state'],r['id']))
c=collections.Counter(r['id'] for r in out); assert max(c.values())==1,[k for k,v in c.items() if v>1]
json.dump(out,open(O+'measures.json','w'))
print(len(out),'with counts',sum(1 for r in out if r['yes_votes'] is not None),'described',sum(1 for r in out if r['description']),'states',len({r['st'] for r in out}))
print('unmatched wiki in states with counts',sum(1 for i,m in enumerate(wiki) if i not in used and any(o['st']==AB[m['state']] and o['yes_votes'] is not None for o in out)))
