import json,collections,re
C='/home/claude/civic/'; O='/home/claude/out3/'
W=json.load(open(C+'want.json'))
old={r['fips']:r for r in json.load(open('/home/claude/out2/counties.json'))}
AK_ALIAS={'02063':'02261','02066':'02261'}
house_wiki={f"{r['st']}-{r['district']}":r for r in json.load(open('/home/claude/data/house.json'))}
def det(i): return json.load(open(f'{C}det/{i}.json'))
def pcode(p):
    p=(p or '').lower()
    if p.startswith('democrat') or p in ('dfl','democratic-farmer-labor'): return 'D'
    if p.startswith('republican'): return 'R'
    return 'O'
def cand_party(c,state,dist):
    p=pcode(c['party'])
    if p=='O' and c['party'] in ('Nonpartisan','Unaffiliated') and dist:
        w=house_wiki.get(dist)
        if w:
            last=c['name'].split()[-1].lower()
            for wc in w['candidates']:
                if last in wc['name'].lower(): return wc['p'] if wc['p'] in 'DR' else 'O'
    return p
COUNTYTYPES=('County','Parish','City','Borough')
county=collections.defaultdict(lambda: {})
state_tot=collections.defaultdict(dict)
race_summary=[]
house_dist=[]
house_cty=collections.defaultdict(lambda: {'D':0,'R':0,'O':0,'contested':True})
for w in W:
    if w['type'] not in ('US Senate','Governor','House of Representatives') or w['province'] in ('US','GU','VI','MP','PR','AS'): continue
    d=det(w['id']); st=w['province']
    k={'US Senate':'sen','Governor':'gov','House of Representatives':'house'}[w['type']]
    dist=None
    if k=='house':
        m=re.search(r'(\d+)',w['district'] or ''); dist=f"{st}-{int(m.group(1))}" if m else f"{st}-AL"
        if dist not in house_wiki and f"{st}-AL" in house_wiki: dist=f"{st}-AL"
    sp=collections.Counter()
    for c in d['candidates']: sp[cand_party(c,st,dist)]+=c['votes'] or 0
    tot=sum(sp.values())
    top2=''.join(sorted(p for p,_ in sorted(((p,v) for p,v in sp.items()),key=lambda x:-x[1])[:2]))
    if k=='house':
        house_dist.append({'seat':dist,'st':st,'d':sp['D'],'r':sp['R'],'o':sp['O'],'total':tot,'pct_reporting':d['percent_reporting'],'updated':d['last_updated'][:16],
                           'margin':round(100*(sp['D']-sp['R'])/tot,2) if tot else None,'contested':bool(sp['D'] and sp['R'])})
    else:
        if w['election_name'].lower().find('special')>=0 or (k=='sen' and 'sen' in state_tot[st]): key=k  # one Senate race per state in 2026 data
        state_tot[st][k]={'total':tot,'d':sp['D'],'r':sp['R'],'o':sp['O'],'top2':top2,'pct':d['percent_reporting'],'updated':d['last_updated'][:16],'name':w['election_name']}
    for v in (d.get('region_results') or {}).values():
        if v.get('type') not in COUNTYTYPES or not v.get('fips'): continue
        f=AK_ALIAS.get(v['fips'],v['fips'])
        pv=collections.Counter()
        for c in v['candidates']: pv[cand_party(c,st,dist)]+=c['votes'] or 0
        if k=='house':
            h=house_cty[f]; h['D']+=pv['D']; h['R']+=pv['R']; h['O']+=pv['O']; h['st']=st
            if not (sp['D'] and sp['R']): h['contested']=False
        else:
            e=county[f].setdefault(k,collections.Counter()); e.update(pv); county[f]['st']=st
for f,h in house_cty.items():
    county[f]['house']=collections.Counter({'D':h['D'],'R':h['R'],'O':h['O']}); county[f]['house_contested']=h['contested']; county[f]['st']=h['st']
rows=[]
for f in sorted(set(old)|set(county)):
    o=old.get(f,{}); c=county.get(f,{})
    st=o.get('st') or c.get('st')
    r={'fips':f,'county':o.get('county',''),'st':st,'m24':o.get('m24'),'m20':o.get('m20'),'t24':o.get('t24'),'t20':o.get('t20')}
    for k in ('sen','gov','house'):
        pv=c.get(k)
        if not pv or not sum(pv.values()): continue
        t=sum(pv.values())
        r[k+'26_d']=round(100*pv['D']/t,1); r[k+'26_r']=round(100*pv['R']/t,1); r[k+'26_total']=t
        srt=sorted(pv.items(),key=lambda x:-x[1]); r[k+'26_lead']=srt[0][0]; r[k+'26_lead_margin']=round(100*(srt[0][1]-(srt[1][1] if len(srt)>1 else 0))/t,1)
    if 'house' in c and not c.get('house_contested',True): r['house26_partial']=True
    # top race: first statewide race whose top two are D and R; else contested House
    top=None
    for k,lab in (('sen','Senate'),('gov','Governor')):
        s=state_tot.get(st,{}).get(k)
        if s and s['top2']=='DR' and r.get(k+'26_total'): top=(k,lab); break
    if not top and r.get('house26_total') and not r.get('house26_partial'): top=('house','House')
    if top:
        k,lab=top; r['top26_race']=lab; r['top26_m']=round(r[k+'26_d']-r[k+'26_r'],1)
    t26=max([r.get(k+'26_total') or 0 for k in ('sen','gov','house')]) or None
    r['t26']=t26
    r['t26_vs_24']=round(100*t26/r['t24'],1) if t26 and r.get('t24') else None
    r['t26_vs_20']=round(100*t26/r['t20'],1) if t26 and r.get('t20') else None
    rows.append(r)
json.dump(rows,open(O+'counties.json','w'),separators=(',',':'))
json.dump(house_dist,open(O+'house_civic.json','w'))
json.dump(state_tot,open(O+'state_tot.json','w'))
nat=collections.Counter()
for h in house_dist: nat['D']+=h['d']; nat['R']+=h['r']; nat['T']+=h['total']
print('national House', nat, 'margin', round(100*(nat['D']-nat['R'])/nat['T'],2))
cov=collections.Counter(r['top26_race'] for r in rows if r.get('top26_race')); print('top race coverage',cov, 'of', len(rows))
print('counties with any 2026', sum(1 for r in rows if r.get('t26')), 'turnout vs24', sum(1 for r in rows if r.get('t26_vs_24')))
miss=collections.Counter(r['st'] for r in rows if not r.get('top26_race')); print('no top race by state',miss)
