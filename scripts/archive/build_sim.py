import json,collections
O='/home/claude/out2/'
sen=json.load(open('/home/claude/data/senate.json')); gov=json.load(open('/home/claude/data/governor.json'))
AB=json.load(open('/home/claude/out/state_tiles.json')); NAME2ST={t['state']:t['st'] for t in AB}
races=[]
UNC={('senate','Mississippi'):{'chal':'Scott Colom','chal_p':'D','rep':'Cindy Hyde-Smith','margin':round(100*2574/(467930+465356+19935),2),'basis':'AP count, Nov. 7 (top two); third-party total from election night'},
     ('senate','Alaska'):{'chal':'Mary Peltola','chal_p':'D','rep':'Dan S. Sullivan','margin':round(48.1732-(47.8752+2.2673+1.6843),2),'basis':'First-choice votes, Nov. 6 state feed; assumes other Republican-labeled votes transfer to Sullivan in the ranked count'},
     ('governor','Alaska'):{'chal':'Jonathan Kreiss-Tomkins','chal_p':'D','rep':'Bernadette Wilson','margin':round(49.1334-(29.2112+14.1968+7.4587),2),'basis':'First-choice votes, Nov. 6 state feed; assumes other Republicans\' votes transfer to Wilson in the ranked count'},
     ('governor','Kansas'):{'chal':'Cindy Holscher','chal_p':'D','rep':'Ty Masterson','margin':round(100*(546587-541030)/(546587+541030),2),'basis':'Kansas Secretary of State count, Nov. 4 (top two)'}}
for office,src in (('senate',sen),('governor',gov)):
    for r in src:
        key=r['state']+(' (special)' if r['special'] else '')
        st=NAME2ST[r['state']]
        if (office,r['state']) in UNC:
            u=UNC[(office,r['state'])]
            races.append({'office':office,'race':key,'st':st,'chal':u['chal'],'chal_p':u['chal_p'],'rep':u['rep'],'margin':u['margin'],'called':False,'actual':'U','basis':u['basis'],'before':r['before_party']})
            continue
        cs=[c for c in r['candidates'] if c['pct'] is not None]
        reps=[c for c in cs if c['p']=='R']; non=[c for c in cs if c['p']!='R']
        R=max(reps,key=lambda c:c['pct']) if reps else None; C=max(non,key=lambda c:c['pct']) if non else None
        m=(C['pct'] if C else 0)-(R['pct'] if R else 0)
        races.append({'office':office,'race':key,'st':st,'chal':C['name'] if C else '','chal_p':C['p'] if C else '','rep':R['name'] if R else '','margin':round(m,2),
                      'called':True,'actual':r['after_party'],'basis':'Vote shares as compiled on Wikipedia from AP','before':r['before_party']})
bad=[(x['race'],x['margin'],x['actual']) for x in races if x['called'] and ((x['margin']>0)!=(x['actual']!='R'))]
print('races',len(races),'baseline mismatches',bad)
hs=json.load(open('/home/claude/data2/house_sim.json'))
house=[{'seat':h['seat'],'st':h['st'],'margin':h['margin'],'basis':h['margin_source'],'actual':h['party'] or 'U'} for h in hs]
print('house missing margin',[h['seat'] for h in house if h['margin'] is None])
# state composition from county sums
cty=json.load(open(O+'counties.json'))
comp=collections.defaultdict(lambda: collections.Counter())
for c in cty:
    for k in ('d24','r24','t24','d20','r20','t20'):
        if c.get(k): comp[c['st']][k]+=c[k]
states=[{'st':st,'trump24':round(v['r24']/(v['d24']+v['r24']),4),'trump20':round(v['r20']/(v['d20']+v['r20']),4)} for st,v in sorted(comp.items())]
vp=json.load(open('/home/claude/out/voter_poll.json'))
groups=[r for r in vp if r['question'] in ('2024 presidential vote','Donald Trump job approval?','Overall')]
sim={'snapshot':'2026-11-08','holdovers':{'D':32,'I':2,'R':31},'races':races,'house':house,'states':states,'poll':groups}
json.dump(sim,open(O+'sim.json','w'),separators=(',',':'))
print('size',len(json.dumps(sim,separators=(',',':'))))
