import csv,json,collections
O='/home/claude/out2/'; import os; os.makedirs(O,exist_ok=True)
AB={'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','District of Columbia':'DC','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'}
INV={v:k for k,v in AB.items()}
cty={}
for yr in ('2024','2020'):
    for r in csv.DictReader(open(f'/home/claude/raw2/{yr}_US_County_Level_Presidential_Results.csv')):
        f=r['county_fips'].zfill(5); st=AB.get(r['state_name'])
        if not st: continue
        c=cty.setdefault(f,{'fips':f,'county':r['county_name'],'st':st})
        y=yr[2:]
        c[f'd{y}']=int(float(r['votes_dem'])); c[f'r{y}']=int(float(r['votes_gop'])); c[f't{y}']=int(float(r['total_votes']))
        c[f'm{y}']=round(100*(c[f'd{y}']-c[f'r{y}'])/c[f't{y}'],1) if c[f't{y}'] else None
c26=json.load(open('/home/claude/data2/county26.json'))
for r in c26:
    c=cty.get(r['fips'])
    if not c: continue
    k='sen' if r['race']=='senate' else 'gov'
    shares={'D':r['dem'],'R':r['rep'],'O':r['other']}
    lead=max(shares,key=shares.get); srt=sorted(shares.values(),reverse=True)
    c[f'{k}26_lead']=lead; c[f'{k}26_lead_margin']=round(100*(srt[0]-srt[1])/r['total'],1)
    c[f'{k}26_d']=round(100*r['dem']/r['total'],1); c[f'{k}26_r']=round(100*r['rep']/r['total'],1); c[f'{k}26_total']=r['total']
for c in cty.values():
    t26=max(c.get('sen26_total') or 0, c.get('gov26_total') or 0) or None
    c['t26']=t26
    c['t26_vs_24']=round(100*t26/c['t24'],1) if t26 and c.get('t24') else None
    c['t26_vs_20']=round(100*t26/c['t20'],1) if t26 and c.get('t20') else None
cols=['fips','county','st','d24','r24','t24','m24','d20','r20','t20','m20','sen26_lead','sen26_lead_margin','sen26_d','sen26_r','sen26_total','gov26_lead','gov26_lead_margin','gov26_d','gov26_r','gov26_total','t26','t26_vs_24','t26_vs_20']
rows=[{k:c.get(k) for k in cols} for c in sorted(cty.values(),key=lambda x:x['fips'])]
json.dump(rows,open(O+'counties.json','w'),separators=(',',':'))
print('counties',len(rows),'with 2026',sum(1 for r in rows if r['t26']))
# state presidential totals
sp=collections.defaultdict(lambda: collections.Counter())
for c in cty.values():
    for y in ('24','20'):
        for k in ('d','r','t'):
            if c.get(k+y) is not None: sp[c['st']][k+y]+=c[k+y]
# state 2026 totals
import glob
sen=json.load(open('/home/claude/data/senate.json')); gov=json.load(open('/home/claude/data/governor.json'))
best={}
for src,lab in ((sen,'U.S. Senate'),(gov,'Governor')):
    for r in src:
        t=sum((c['votes'] or 0) for c in r['candidates'])
        st=AB[r['state']]
        if t and t>best.get(st,(0,''))[0]: best[st]=(t,lab+' (Wikipedia, AP)')
stmax={}
for f in glob.glob('/home/claude/probe/pb/data/*.csv'):
    st=f[-6:-4].upper()
    for r in csv.DictReader(open(f)):
        if r['level']!='state': continue
        if 'wikipedia' in r['source'].lower(): continue
        try: tv=int(float(r['contestTotalVotes'] or 0))
        except: tv=0
        import re as _re
        if not _re.search(r'governor|u\.?\s*s\.?\s*senat|united states senat|secretary of state|attorney general|auditor|treasurer',r['contest'],_re.I) or _re.search(r'lieutenant|lt\.? gov|district',r['contest'],_re.I) and not r['contest'].lower().startswith('governor'): continue
        if tv>stmax.get(st,(0,''))[0]: stmax[st]=(tv,(r['contest'].strip()[:60]+' (state results feed)'))
best['MS']=(467930+465356,'U.S. Senate, top two only (AP count reported Nov. 7)')
best['KS']=(546587+541030,'Governor, top two only (Kansas Secretary of State, Nov. 4)')
turn=[]
for st,name in sorted(INV.items()):
    if st=='DC': continue
    a=best.get(st); b=stmax.get(st)
    pick=a if a else b
    if pick and sp[st]['t24'] and pick[0]>sp[st]['t24']: pick=None
    v26,basis=(pick if pick else (None,'No statewide count in sources'))
    s=sp[st]
    turn.append({'st':st,'state':name,'votes26':v26,'basis':basis,'votes24':s['t24'] or None,'votes20':s['t20'] or None,
      'pct_of_24':round(100*v26/s['t24'],1) if v26 and s['t24'] else None,'pct_of_20':round(100*v26/s['t20'],1) if v26 and s['t20'] else None,
      'pres24_margin':round(100*(s['d24']-s['r24'])/s['t24'],1) if s['t24'] else None,'pres20_margin':round(100*(s['d20']-s['r20'])/s['t20'],1) if s['t20'] else None})
json.dump(turn,open(O+'state_turnout.json','w'))
for t in turn: print(t['st'],t['votes26'],t['votes24'],t['pct_of_24'],t['basis'][:40])
