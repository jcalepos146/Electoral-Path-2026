import json,re,glob,collections
ST={'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'}
ORD={'1st':1,'2nd':2,'3rd':3}
def pcode(p):
    p=p.lower()
    for k,v in [('independent american','O'),('democratic','D'),('dfl','D'),('republican','R'),('independent','I'),('libertarian','L'),('green','G')]:
        if k in p: return v
    return 'O'
def clean(s):
    s=re.sub(r'<ref[^>]*/>','',s); s=re.sub(r'<ref[^>]*>.*?</ref>','',s,flags=re.S)
    s=re.sub(r'\[\[[^|\]]*\|([^\]]*)\]\]',r'\1',s); s=re.sub(r'\[\[([^\]]*)\]\]',r'\1',s); s=re.sub(r'\{\{[^{}]*\}\}','',s)
    return s.replace("'''","").strip()
res={}
for f in glob.glob('/home/claude/raw2/house/*.json'):
    if 'test_raw' in f: continue
    w=json.load(open(f))['parse']['wikitext']
    state=re.search(r'in_(.+)\.json',f).group(1).replace('_',' ')
    st=ST[state]
    starts=[m for m in re.finditer(r'\{\{\s*Election box begin[^|]*\|\s*title\s*=\s*(.*?)\}\}',w,re.S)]
    for m in starts:
        title=clean(m.group(1))
        if re.search(r'primar|runoff|special|convention|caucus',title,re.I): continue
        dm=re.search(r"(\d+)(?:st|nd|rd|th)\s+congressional district",title) 
        if dm: dist=str(int(dm.group(1)))
        elif re.search(r'at-large|at large',title,re.I) or st in ('AK','DE','ND','SD','VT','WY'): dist='AL'
        else: continue
        end=w.find('{{Election box end',m.end()); body=w[m.end():end]
        body=re.sub(r'<ref[^>]*/>','',body); body=re.sub(r'<ref[^>]*>.*?</ref>','',body,flags=re.S); body=re.sub(r'\[\[[^|\]]*\|([^\]]*)\]\]',r'\1',body)
        cands=[]
        for c in re.finditer(r'\{\{\s*Election box (?:winning )?candidate[^|]*((?:\|[^{}]*?(?:\{\{[^{}]*\}\}[^{}]*?)*)*)\}\}',body,re.S):
            fields=dict((k.strip().lower(),v.strip()) for k,v in re.findall(r'\|\s*([a-z_]+)\s*=\s*([^|]*)',c.group(1)))
            v=re.sub(r'[^0-9]','',fields.get('votes','')); pc=re.sub(r'[^0-9.]','',fields.get('percentage',''))
            cands.append({'name':clean(fields.get('candidate','')),'p':pcode(fields.get('party','')),
                          'votes':int(v) if v.isdigit() else None,'pct':float(pc) if re.fullmatch(r'[\d.]+',pc) else None})
        if cands: res[f'{st}-{dist}']={'title':title,'cands':cands}
h=json.load(open('/home/claude/data/house.json'))
out=[];stat=collections.Counter()
for x in h:
    seat=f"{x['st']}-{x['district']}"
    r=res.get(seat)
    rec={'seat':seat,'d_pct':None,'r_pct':None,'other_pct':None,'source':''}
    if r:
        cs=r['cands']
        tot=sum(c['votes'] or 0 for c in cs)
        if tot>0:
            sh={k:100*sum(c['votes'] or 0 for c in cs if c['p']==k)/tot for k in 'DR'}
            rec.update(d_pct=round(sh['D'],2),r_pct=round(sh['R'],2),other_pct=round(100-sh['D']-sh['R'],2),source='votes'); stat['votes']+=1
        elif any(c['pct'] for c in cs):
            sh={k:sum(c['pct'] or 0 for c in cs if c['p']==k) for k in 'DR'}
            rec.update(d_pct=round(sh['D'],2),r_pct=round(sh['R'],2),other_pct=round(max(0,100-sh['D']-sh['R']),2),source='pct'); stat['pct']+=1
        elif len({c['p'] for c in cs})==1 or (len(cs)==1):
            p=cs[0]['p']; rec.update(d_pct=100.0 if p=='D' else 0.0,r_pct=100.0 if p=='R' else 0.0,other_pct=0.0 if p in 'DR' else 100.0,source='unopposed'); stat['unopposed']+=1
        else: stat['box_no_numbers']+=1
    else: stat['no_box']+=1
    out.append(rec)
print(stat)
json.dump(out,open('/home/claude/data2/house_margins.json','w'))
miss=[o['seat'] for o in out if o['d_pct'] is None]; print(len(miss), miss[:80])
