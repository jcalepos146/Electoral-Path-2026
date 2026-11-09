import json,re,sys
src,out,kind=sys.argv[1],sys.argv[2],sys.argv[3]
d=json.load(open(src))['parse']['wikitext']
STATES=set("Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois Indiana Iowa Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada Ohio Oklahoma Oregon Pennsylvania Tennessee Texas Utah Vermont Virginia Washington Wisconsin Wyoming".split())|{"New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Rhode Island","South Carolina","South Dakota","West Virginia"}
heads=[(m.start(),m.group(2).strip()) for m in re.finditer(r'^(==)\s*([^=].*?)\s*\1\s*$', d, re.M)]
def clean(s):
    s=re.sub(r'<ref[^>]*/>','',s); s=re.sub(r'<ref[^>]*>.*?</ref>','',s,flags=re.S)
    s=re.sub(r'\{\{[^{}]*\}\}','',s)
    s=re.sub(r'\[\[[^|\]]*\|([^\]]*)\]\]',r'\1',s); s=re.sub(r'\[\[([^\]]*)\]\]',r'\1',s)
    return s.replace("'''","").replace("''","").strip()
def pcode(p):
    p=p.lower()
    for k,v in [('independent american','O'),('democratic','D'),('republican','R'),('independent','I'),('libertarian','L'),('green','G')]:
        if k in p: return v
    return 'O'
def field(box,k):
    m=re.search(r'^\|[ \t]*'+k+r'[ \t]*=[ \t]*(.*)$',box,re.M)
    return m.group(1).strip() if m else ''
res=[]
for i,(pos,name) in enumerate(heads):
    base=re.sub(r'\s*\(special\)','',name)
    if base not in STATES: continue
    end=heads[i+1][0] if i+1<len(heads) else len(d)
    sec=d[pos:end]
    bi=sec.find('{{Infobox election')
    box=''
    if bi>=0:
        depth=0;j=bi
        while j<len(sec):
            if sec.startswith('{{',j): depth+=1;j+=2;continue
            if sec.startswith('}}',j):
                depth-=1;j+=2
                if depth==0: break
                continue
            j+=1
        box=sec[bi:j]
    cands=[]
    for n in range(1,8):
        nm=field(box,f'nominee{n}') or field(box,f'candidate{n}')
        if not nm: continue
        pv=clean(field(box,f'popular_vote{n}')).replace(',','')
        pc=clean(field(box,f'percentage{n}')).replace('%','')
        party=field(box,f'party{n}')
        cands.append({'name':clean(nm),'party':re.sub(r'\s*\((United States|US)\)','',party).replace(' Party',''),
            'p':pcode(party),'votes':int(pv) if pv.isdigit() else None,
            'pct':float(pc) if re.fullmatch(r'[\d.]+',pc) else None,
            'bold':"'''" in nm})
    after=clean(field(box,'after_election')); afterp=field(box,'after_party')
    before=clean(field(box,'before_election')); beforep=field(box,'before_party')
    res.append({'state':base,'special':'special' in name.lower(),'kind':kind,
        'candidates':cands,'before':before,'before_party':pcode(beforep) if beforep else None,
        'after':after,'after_party':pcode(afterp) if afterp and after and 'TBD' not in after.upper() else None,
        'ongoing':field(box,'ongoing'),'map_caption_present':bool(field(box,'map_image'))})
json.dump(res,open(out,'w'),indent=1)
for r in res:
    c=r['candidates']
    print(r['state'],'(S)' if r['special'] else '', '|before',r['before'],r['before_party'],'|after',r['after'],r['after_party'],'|',[(x['name'],x['p'],x['votes'],x['pct']) for x in c[:3]])
