import json,sys
D='/home/claude/data/'; O='/home/claude/out/'
H=json.load(open(D+'house.json')); S=json.load(open(D+'senate.json')); G=json.load(open(D+'governor.json'))
AB={'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'}
PN={'D':'Democratic','R':'Republican','I':'Independent','L':'Libertarian','G':'Green','O':'Other'}
NOTES={
 ('Senate','Mississippi'):'Too close to call. Colom (D) led Hyde-Smith (R) by 2,574 votes with about 97% counted (AP, Nov. 7).',
 ('Senate','Alaska'):'Uncalled. Ranked-choice tabulation targeted for Nov. 18 if no one tops 50%.',
 ('Governor','Alaska'):'Uncalled. Ranked-choice tabulation targeted for Nov. 18 if no one tops 50%.',
 ('Governor','Kansas'):'Too close to call; Holscher (D) led narrowly on election night.',
 ('House','LA-5'):'Headed to a December runoff under Louisiana rules.',
 ('House','LA-6'):'Headed to a December runoff under Louisiana rules.'}
# House
house=[]
for x in H:
    lab=f"{x['st']}-{x['district']}"
    called=x['called']
    house.append({'seat':lab,'state':x['state'],'st':x['st'],'district':x['district'],
      'party':x['winner_party'] if called else 'U','winner':x['winner'] or '',
      'status':'Called' if called else 'Uncalled','flip':'Yes' if x['flip'] else '',
      'candidates':'; '.join(f"{c['name']} ({c['p']})" for c in x['candidates']),
      'note':NOTES.get(('House',lab),'')})
def statewide(rows,office):
    races=[];cands=[]
    for r in rows:
        key=r['state']+(' (special)' if r['special'] else '')
        cs=sorted(r['candidates'],key=lambda c:-(c['votes'] or 0))
        called=bool(r['after_party'])
        for c in cs:
            cands.append({'race':key,'candidate':c['name'],'party':c['p'],'votes':c['votes'],'pct':c['pct'],
              'winner':'Yes' if called and c['name']==r['after'] else ''})
        top=cs[0] if cs and cs[0]['votes'] else None; sec=cs[1] if len(cs)>1 and cs[1]['votes'] else None
        races.append({'race':key,'state':r['state'],'st':AB[r['state']],
          'party':r['after_party'] if called else 'U','winner':r['after'] if called else '',
          'previous_party':r['before_party'] or '','status':'Called' if called else 'Uncalled',
          'flip':'Yes' if called and r['before_party'] and r['after_party']!=r['before_party'] else '',
          'top':top['name'] if top else '','top_party':top['p'] if top else '','top_pct':top['pct'] if top else None,
          'second':sec['name'] if sec else '','second_party':sec['p'] if sec else '','second_pct':sec['pct'] if sec else None,
          'margin':round(top['pct']-sec['pct'],1) if top and sec and top['pct'] is not None and sec['pct'] is not None else None,
          'total_votes':sum(c['votes'] or 0 for c in cs) or None,
          'note':NOTES.get((office,r['state']),'')})
    return races,cands
sen,senc=statewide(S,'Senate'); gov,govc=statewide(G,'Governor')
holdover=[{'party':'D','seats':32},{'party':'I','seats':2},{'party':'R','seats':31}]
# voter poll
import re
vp=json.load(open('/home/claude/data/voter_poll.json'))
TILES="""AK 0 0|ME 11 0|VT 10 1|NH 11 1|WA 1 2|ID 2 2|MT 3 2|ND 4 2|MN 5 2|IL 6 2|WI 7 2|MI 8 2|NY 9 2|RI 10 2|MA 11 2|OR 1 3|NV 2 3|WY 3 3|SD 4 3|IA 5 3|IN 6 3|OH 7 3|PA 8 3|NJ 9 3|CT 10 3|CA 1 4|UT 2 4|CO 3 4|NE 4 4|MO 5 4|KY 6 4|WV 7 4|VA 8 4|MD 9 4|DE 10 4|AZ 2 5|NM 3 5|KS 4 5|AR 5 5|TN 6 5|NC 7 5|SC 8 5|OK 4 6|LA 5 6|MS 6 6|AL 7 6|GA 8 6|HI 0 7|TX 4 7|FL 9 7"""
inv={v:k for k,v in AB.items()}
tiles=[{'st':a,'state':inv[a],'col':int(c),'row':int(r)} for a,c,r in (t.split() for t in TILES.split('|'))]
assert len(tiles)==50
for name,obj in [('house',house),('senate_races',sen),('senate_candidates',senc),('governor_races',gov),('governor_candidates',govc),('senate_holdovers',holdover),('voter_poll',vp),('state_tiles',tiles)]:
    json.dump(obj,open(O+name+'.json','w'),ensure_ascii=False)
    print(name,len(obj))
