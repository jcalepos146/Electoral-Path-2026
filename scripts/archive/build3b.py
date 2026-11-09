import json,re,collections
C='/home/claude/civic/'; O='/home/claude/out3/'
hc={h['seat']:h for h in json.load(open(O+'house_civic.json'))}
sim_house=json.load(open('/home/claude/out2/sim_house.json'))
miss=[];flipchk=[]
for h in sim_house:
    c=hc.get(h['seat'])
    if not c or not c['total']: miss.append(h['seat']); continue
    h['margin']=c['margin']; h['basis']='civicAPI count, Nov. 9'+('' if c['contested'] else ' (uncontested by one party)')
    if h['actual'] in ('D','R') and (c['margin']>0)!=(h['actual']=='D'): flipchk.append((h['seat'],c['margin'],h['actual']))
print('house missing',miss,'winner disagreements',flipchk)
json.dump(sim_house,open(O+'sim_house.json','w'))
# statewide turnout
st=json.load(open(O+'state_tot.json')); old=json.load(open('/home/claude/out2/state_turnout.json'))
hs=collections.defaultdict(int)
for h in hc.values(): hs[h['st']]+=h['total']
for r in old:
    s=st.get(r['st'],{})
    cands=[(s[k]['total'],{'sen':'U.S. Senate','gov':'Governor'}[k]) for k in ('sen','gov') if k in s]
    if hs.get(r['st']): cands.append((hs[r['st']],'U.S. House, all districts'))
    if cands:
        v,b=max(cands); r['votes26']=v; r['basis']=b+' (civicAPI, Nov. 9)'
        r['pct_of_24']=round(100*v/r['votes24'],1) if r['votes24'] else None; r['pct_of_20']=round(100*v/r['votes20'],1) if r['votes20'] else None
print([ (r['st'],r['pct_of_24']) for r in old if r['pct_of_24'] is None or r['pct_of_24']>100])
json.dump(old,open(O+'state_turnout.json','w'))
# sim_races: refresh margins from civic for all races (calls unchanged)
sim=json.load(open('/home/claude/out2/sim_races.json'))
AB={t['state']:t['st'] for t in json.load(open('/home/claude/out/state_tiles.json'))}
W=json.load(open(C+'want.json'))
byk={}
for w in W:
    if w['type'] in ('US Senate','Governor') and w['province'] not in ('US',):
        d=json.load(open(f"{C}det/{w['id']}.json")); byk[(w['province'],'senate' if w['type']=='US Senate' else 'governor')]=d
for r in sim:
    d=byk.get((r['st'],r['office']))
    if not d: print('no civic',r['race']); continue
    tot=sum(c['votes'] or 0 for c in d['candidates'])
    if r['st']=='AK':  # keep ranked-choice transfer assumption, refresh first-choice shares
        reps=sum(c['votes'] or 0 for c in d['candidates'] if c['party'].startswith('Republican'))
        ch=max((c for c in d['candidates'] if not c['party'].startswith('Republican')),key=lambda c:c['votes'] or 0)
        r['margin']=round(100*((ch['votes'] or 0)-reps)/tot,2); r['basis']='First-choice votes (civicAPI, Nov. 9); assumes votes for eliminated Republicans transfer to the leading Republican'
        continue
    def find(name):
        last=name.split()[-1].lower() if name else '~'
        for c in d['candidates']:
            if last in c['name'].lower(): return c['votes'] or 0
        return None
    a,b=find(r['chal']),find(r['rep'])
    if a is None or b is None: print('name miss',r['race'],r['chal'],r['rep']); continue
    r['margin']=round(100*(a-b)/tot,2); r['basis']='civicAPI count, Nov. 9'
    if r['called'] and (r['margin']>0)!=(r['actual']!='R'): print('winner disagreement',r['race'],r['margin'],r['actual'])
json.dump(sim,open(O+'sim_races.json','w'))
print([(r['race'],r['office'],r['margin']) for r in sim if not r['called']])
