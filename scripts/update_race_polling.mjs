import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public', 'data');
const HOUSE_PATH = path.join(PUBLIC, 'hillcast-districts.json');
const SENATE_PATH = path.join(PUBLIC, 'statewide-races.json');
const OUT = path.join(PUBLIC, 'race-polling.json');
const UA = process.env.ELECTION_PATH_USER_AGENT || 'ElectionPath2026/0.9';

const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'
};
function decodeHtml(value) {
  return String(value ?? '').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&ndash;|&mdash;/g,'-');
}
function textOnly(html) {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
}
function cleanName(value) {
  return String(value ?? '').replace(/\*/g,'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g,' ').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
}
function surname(value) {
  const c = cleanName(value); if (!c || c.includes('nominee')) return null; const p=c.split(' '); return p.at(-1) ?? null;
}
async function getText(url) {
  const controller = new AbortController(); const timer=setTimeout(()=>controller.abort(),45000);
  try { const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html,application/json;q=.9,*/*;q=.8'},signal:controller.signal}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); }
  finally { clearTimeout(timer); }
}
function unique(arr){ return [...new Set(arr)]; }
function hrefs(html, regex) {
  const out=[]; const re=/href=["']([^"']+)["']/gi; let m; while((m=re.exec(html))) if(regex.test(m[1])) out.push(m[1]); return unique(out);
}
function inferPartyMargin(winner, amount, race) {
  const w=cleanName(winner); const d=surname(race.democrat), r=surname(race.republican);
  if (d && w.includes(d)) return Number(amount);
  if (r && w.includes(r)) return -Number(amount);
  return null;
}
function parseRcpAverage(html, race) {
  const text=textOnly(html);
  let m=text.match(/RCP Avg:\s*([A-Za-zÀ-ÿ'’.-]+)\s*\+\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!m) m=text.match(/RealClearPolitics Poll Average\s+([A-Za-zÀ-ÿ'’.-]+)\s*\+\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!m) return null;
  const margin=inferPartyMargin(m[1],m[2],race);
  return margin==null?null:{margin,winner:m[1],label:`${m[1]} +${m[2]}`};
}
function linkScore(url,race) {
  const u=cleanName(url.replace(/[-_/]/g,' ')); const d=surname(race.democrat),r=surname(race.republican); let s=0;
  if(d&&u.includes(d))s+=4;if(r&&u.includes(r))s+=4;return s;
}
async function rcpSenate(races) {
  const result={};
  try {
    const html=await getText('https://www.realclearpolling.com/maps/senate/2026/toss-up');
    const links=hrefs(html,/\/polls\/senate\/general\/2026\//i).map(h=>h.startsWith('http')?h:`https://www.realclearpolling.com${h}`);
    for(const race of races){
      const state=String(race.state).toUpperCase(); const stateName=(STATE_NAMES[state]||'').toLowerCase().replace(/ /g,'-');
      const candidates=links.filter(u=>u.includes(`/2026/${stateName}/`)).sort((a,b)=>linkScore(b,race)-linkScore(a,race));
      for(const url of candidates.slice(0,4)){
        if(linkScore(url,race)<4) continue;
        try{const page=await getText(url);const avg=parseRcpAverage(page,race);if(avg){result[state]={id:'rcp',name:'RealClearPolling',margin:avg.margin,label:avg.label,url,mode:'official-average'};break;}}catch{}
      }
    }
  } catch(error){ console.warn(`RCP Senate mirror refresh failed: ${error instanceof Error?error.message:error}`); }
  return result;
}

async function rcpHouse(races) {
  const result={};
  try {
    const pages = await Promise.allSettled([
      getText('https://www.realclearpolling.com/elections/house/2026'),
      getText('https://www.realclearpolling.com/latest-polls/house'),
    ]);
    const html=pages.filter(x=>x.status==='fulfilled').map(x=>x.value).join('\n');
    const links=hrefs(html,/\/polls\/house\/general\/2026\//i).map(h=>h.startsWith('http')?h:`https://www.realclearpolling.com${h}`);
    for(const race of races){
      const [state,districtRaw]=String(race.id??'').toUpperCase().split('-');
      const district=String(Number(districtRaw||0));
      const stateName=(STATE_NAMES[state]||'').toLowerCase().replace(/ /g,'-');
      if(!stateName||district==='0') continue;
      const candidates=links.filter(u=>u.includes(`/2026/${stateName}/district-${district}/`)).sort((a,b)=>linkScore(b,race)-linkScore(a,race));
      for(const url of candidates.slice(0,4)){
        if(linkScore(url,race)<4) continue;
        try{const page=await getText(url);const avg=parseRcpAverage(page,race);if(avg){result[race.id]={id:'rcp',name:'RealClearPolling',margin:avg.margin,label:avg.label,url,mode:'official-average'};break;}}catch{}
      }
    }
  } catch(error){ console.warn(`RCP House mirror refresh failed: ${error instanceof Error?error.message:error}`); }
  return result;
}
function answerValue(answers,name){
  const target=surname(name); if(!target)return null;
  for(const a of answers??[]){ if(cleanName(a.choice??a.name??'').includes(target)){const v=Number(a.pct??a.value);if(Number.isFinite(v))return v;} }
  return null;
}
function daysOld(date){const t=Date.parse(date);return Number.isFinite(t)?Math.max(0,(Date.now()-t)/86400000):30;}
function votehubDerived(polls,race){
  const d=surname(race.democrat),r=surname(race.republican);if(!d||!r)return null;
  const usable=[];
  for(const p of polls){const dv=answerValue(p.answers,race.democrat),rv=answerValue(p.answers,race.republican);if(dv==null||rv==null)continue;usable.push({...p,margin:dv-rv});}
  if(!usable.length)return null;
  const latestByPollster=new Map();
  for(const p of usable.sort((a,b)=>Date.parse(b.end_date??b.created_at??0)-Date.parse(a.end_date??a.created_at??0))){const key=String(p.pollster??p.id);if(!latestByPollster.has(key))latestByPollster.set(key,p);}
  let num=0,den=0;
  for(const p of latestByPollster.values()){
    const age=daysOld(p.end_date??p.created_at);const recency=Math.pow(.5,age/30);const pop=String(p.population??'').toLowerCase();const popWeight=pop==='lv'?1:pop==='rv'?.9:.75;const sample=Math.sqrt(Math.min(2500,Math.max(300,Number(p.sample_size)||800))/800);const w=recency*popWeight*sample;num+=w*p.margin;den+=w;
  }
  return den?{id:'votehub-derived',name:'VoteHub data-derived',margin:num/den,pollCount:usable.length,pollsterCount:latestByPollster.size,url:'https://votehub.com/polls/',mode:'api-derived'}:null;
}
async function votehubAllPolls(){
  try{const raw=await getText('https://api.votehub.com/polls?from_date=2026-01-01');const data=JSON.parse(raw);return Array.isArray(data)?data:(data.polls??[]);}catch(error){console.warn(`VoteHub race-poll API unavailable: ${error instanceof Error?error.message:error}`);return[];}
}
function blendSources(sources){const margins=sources.map(s=>s.margin).filter(Number.isFinite);return margins.length?margins.reduce((a,b)=>a+b,0)/margins.length:null;}

await fs.mkdir(PUBLIC,{recursive:true});
const houseBundle=JSON.parse(await fs.readFile(HOUSE_PATH,'utf8'));
const statewide=JSON.parse(await fs.readFile(SENATE_PATH,'utf8'));
const senateRaces=statewide.senate??[];
const houseRaces=houseBundle.districts??[];
const [rcp, rcpHouseMirrors]=await Promise.all([rcpSenate(senateRaces),rcpHouse(houseRaces)]);
const vhPolls=await votehubAllPolls();
const senate={};
for(const race of senateRaces){const id=String(race.state).toUpperCase();const sources=[];if(rcp[id])sources.push(rcp[id]);const vh=votehubDerived(vhPolls,race);if(vh)sources.push(vh);senate[id]={sources,blend:blendSources(sources),sourceCount:sources.length};}
const house={};
for(const race of houseRaces){const sources=[];if(rcpHouseMirrors[race.id])sources.push(rcpHouseMirrors[race.id]);const vh=votehubDerived(vhPolls,race);if(vh)sources.push(vh);house[race.id]={sources,blend:blendSources(sources),sourceCount:sources.length};}
const out={generatedAt:new Date().toISOString(),note:'Race polling mirrors. RCP values are official published averages when a current matchup page can be matched. VoteHub values are transparent Election Path averages derived from VoteHub raw poll data, not VoteHub official published averages. Poll mirrors are displayed separately from the HillCast prior to avoid double-counting until a historical refresh-calibration is added.',senate,house};
await fs.writeFile(OUT,JSON.stringify(out,null,2)+'\n');
console.log(`Race polling mirrors: ${Object.values(senate).filter(x=>x.sourceCount).length} Senate races and ${Object.values(house).filter(x=>x.sourceCount).length} House races with at least one mirror.`);
