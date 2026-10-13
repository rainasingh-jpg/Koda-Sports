// Koda's Sports: live scoreboard data from ESPN's publicly reachable, unofficial site API.
// ESPN may change or restrict these endpoints; unavailable data is never replaced with invented scores.
const leagues={Soccer:['Premier League','La Liga','Champions League','Serie A','Bundesliga','Ligue 1','MLS','World Cup','Europa League','Copa América'],Tennis:['ATP Tour','WTA Tour','Australian Open','French Open','Wimbledon','US Open','Davis Cup','Billie Jean King Cup'],Football:['NFL','College Football','CFL'],Baseball:['MLB','World Baseball Classic','NCAA Baseball'],Cricket:['ICC World Cup','Test Championship','T20 Internationals','The Ashes','IPL','Big Bash League'],Basketball:['NBA','WNBA',"NCAA Men's","NCAA Women's",'FIBA World Cup','EuroLeague']};
const paths={Soccer:{'Premier League':'soccer/eng.1','La Liga':'soccer/esp.1','Champions League':'soccer/uefa.champions','Serie A':'soccer/ita.1','Bundesliga':'soccer/ger.1','Ligue 1':'soccer/fra.1','MLS':'soccer/usa.1','World Cup':'soccer/fifa.world','Europa League':'soccer/uefa.europa','Copa América':'soccer/conmebol.america'},Tennis:{'ATP Tour':'tennis/atp','WTA Tour':'tennis/wta','Australian Open':'tennis/atp','French Open':'tennis/atp','Wimbledon':'tennis/atp','US Open':'tennis/atp','Davis Cup':'tennis/atp','Billie Jean King Cup':'tennis/wta'},Football:{NFL:'football/nfl','College Football':'football/college-football',CFL:'football/cfl'},Baseball:{MLB:'baseball/mlb','World Baseball Classic':'baseball/world-baseball-classic','NCAA Baseball':'baseball/college-baseball'},Cricket:{'ICC World Cup':'cricket/icc.world-cup','Test Championship':'cricket/icc.test','T20 Internationals':'cricket/icc.t20','The Ashes':'cricket/ashes',IPL:'cricket/ipl','Big Bash League':'cricket/big-bash-league'},Basketball:{NBA:'basketball/nba',WNBA:'basketball/wnba',"NCAA Men's":'basketball/mens-college-basketball',"NCAA Women's":'basketball/womens-college-basketball','FIBA World Cup':'basketball/fiba.world','EuroLeague':'basketball/euroleague'}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=v=>esc(JSON.stringify(v));
const readSet=k=>{try{return new Set(JSON.parse(localStorage.getItem(k)||'[]'))}catch{return new Set()}};
const teams=readSet('ivaanFavorites'), favLeagues=readSet('kodaFavoriteLeagues'), favGames=readSet('kodaFavoriteGames'), favSports=readSet('kodaFavoriteSports');
const key=(s,t)=>s+'::'+t;
const store=(k,s)=>{try{localStorage.setItem(k,JSON.stringify([...s]))}catch{}};
let sport='Soccer',league='Premier League',tab='upcoming',view='dashboard',lastView='dashboard',current=null;
const cache=new Map(),gamesById=new Map(),requests=new Map();let lastUpdate=0;
const $=id=>document.getElementById(id);
const today=()=>new Date();
const dayStr=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('');
const plus=(n)=>{let d=today();d.setDate(d.getDate()+n);return d};
const dateText=s=>s?new Date(s).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Time not available';
const isUpcoming=g=>g.state==='UPCOMING'&&g.when&&[dayStr(today()),dayStr(plus(1))].includes(dayStr(new Date(g.when)));
const confirmedTeam=name=>! /^(?:tbc|tbd|to be (?:confirmed|determined|decided)|unknown|undecided|winner(?: of)?(?: .*)?|loser(?: of)?(?: .*)?)$/i.test(String(name||'').trim())&&Boolean(String(name||'').trim());
const confirmedGame=g=>confirmedTeam(g.a)&&confirmedTeam(g.b);
const empty=t=>`<div class="empty">${esc(t)}</div>`;
const msg=(s,l)=>`No games available for ${l}. ${s==='Cricket'?'Cricket coverage varies by tournament.':''}`;
function updateCount(){$('favCount').textContent=teams.size+favLeagues.size+favGames.size+favSports.size}
function stateOf(e){let st=e.status?.type||{},name=st.name||'';return name==='STATUS_IN_PROGRESS'||st.state==='in'?'LIVE':name==='STATUS_FINAL'||st.state==='post'?'FINAL':'UPCOMING'}
function parseEvent(e,s,l){let c=e.competitions?.[0]||{},cs=c.competitors||[],a=cs.find(x=>x.homeAway==='home')||cs[0]||{},b=cs.find(x=>x.homeAway==='away')||cs[1]||{};let st=stateOf(e);return {id:String(e.id),sport:s,league:l,path:paths[s][l],a:a.team?.displayName||a.athlete?.displayName||a.team?.name||'TBD',b:b.team?.displayName||b.athlete?.displayName||b.team?.name||'TBD',sa:a.score??null,sb:b.score??null,state:st,status:e.status?.type?.shortDetail||e.status?.type?.detail||e.status?.displayClock||(st==='UPCOMING'?'Scheduled':st),when:e.date||c.date,venue:c.venue?.fullName||c.venue?.address?.city||'Venue unavailable',scoring:c.details||e.scoringPlays||[],raw:e};}
function endpoint(s,l){let p=paths[s]?.[l];return p?`https://site.api.espn.com/apis/site/v2/sports/${p}/scoreboard`:null}
// ESPN rejects date ranges on several scoreboard feeds. Load individual days.
async function fetchScoreboard(url, date) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const params = new URLSearchParams({dates:date, limit:'100'});
    const response = await fetch(url+'?'+params, {cache:'no-store', signal:controller.signal});
    if (!response.ok) throw Error('HTTP '+response.status);
    const data = await response.json();
    if (!Array.isArray(data.events)) throw Error('Invalid data from provider');
    return data.events;
  } finally { clearTimeout(timer); }
}
async function load(s,l,force=false) {
  const k=key(s,l), cached=cache.get(k);
  if(!force&&cached&&Date.now()-cached.at<90000) return cached;
  if(requests.has(k)) return requests.get(k);
  const job=(async()=>{
    const url=endpoint(s,l);
    if(!url||s==='Cricket') {
      const out={at:Date.now(),games:[],error:'Live coverage is unavailable for this league. A supported data feed still needs to be connected.'};
      cache.set(k,out); return out;
    }
    const events=new Map(), failures=[];
    // Keep recent results, today, and tomorrow; upcoming views use only today/tomorrow.
    const dates=[-2,-1,0,1].map(i=>dayStr(plus(i)));
    for(let i=0;i<dates.length;i+=5) {
      const results=await Promise.allSettled(dates.slice(i,i+5).map(d=>fetchScoreboard(url,d)));
      for(const result of results) {
        if(result.status==='fulfilled') result.value.forEach(e=>events.set(String(e.id),e));
        else failures.push(result.reason?.message||'Request failed');
      }
      // An unsupported feed does not benefit from more date requests.
      if(i===0&&failures.length===5&&failures.every(e=>e==='HTTP 404')) break;
    }
    let games=[...events.values()].map(e=>parseEvent(e,s,l)).filter(confirmedGame);
    if(s==='Tennis'&&!['ATP Tour','WTA Tour'].includes(l)) {
      const name={'French Open':'French Open|Roland Garros','US Open':'US Open','Australian Open':'Australian Open','Wimbledon':'Wimbledon','Davis Cup':'Davis Cup','Billie Jean King Cup':'Billie Jean King Cup'}[l];
      games=games.filter(g=>new RegExp(name,'i').test([g.raw.name,g.raw.shortName,g.raw.season?.displayName,g.raw.competitions?.[0]?.notes?.[0]?.headline].join(' ')));
    }
    const error=failures.length===dates.length||failures.length===5&&failures.every(e=>e==='HTTP 404')
      ? 'Could not load live data ('+failures[0]+'). Please try again later.'
      : failures.length ? 'Some schedule dates could not be loaded. Showing available games.' : null;
    const out={at:Date.now(),games,error};cache.set(k,out);
    games.forEach(g=>gamesById.set(g.id,g));lastUpdate=Date.now();return out;
  })();
  requests.set(k,job);
  try {return await job;} finally {requests.delete(k);}
}

function allGames(){return [...new Map([...cache.values()].flatMap(v=>v.games).map(g=>[g.id,g])).values()]}
function gameFav(g){return favGames.has(g.id)}
function teamFav(g){return teams.has(key(g.sport,g.a))||teams.has(key(g.sport,g.b))}
function leagueFav(g){return favLeagues.has(key(g.sport,g.league))}
function formatScore(g,side){let n=side==='a'?g.sa:g.sb,other=side==='a'?g.sb:g.sa,name=side==='a'?g.a:g.b;let win=n!==null&&other!==null&&Number(n)>Number(other);return `<div class="scoregroup"><button class="star ${teams.has(key(g.sport,name))?'selected':''}" aria-label="Favorite ${esc(name)}" onclick="toggleTeam(event,${attr(g.sport)},${attr(name)})">★</button><span class="score ${win?'winner':''}">${esc(n??'—')}</span></div>`}
function card(g){return `<article class="card" onclick="openDetail(${attr(g.id)})"><div class="meta"><span>${esc(g.sport)} · ${esc(g.league)}</span><span class="metaRight"><span class="${g.state==='LIVE'?'live':''}">${esc(g.state)}</span><button class="gameStar ${gameFav(g)?'selected':''}" aria-label="Favorite game" onclick="toggleGame(event,${attr(g.id)})">★</button></span></div><div class="teams"><div class="team">${esc(g.a)}</div>${formatScore(g,'a')}<div class="team">${esc(g.b)}</div>${formatScore(g,'b')}</div><div class="status">${esc(g.status)} · ${esc(dateText(g.when))}</div><div class="where">📍 ${esc(g.venue)}</div>${g.sport==='Soccer'&&soccerScorers(g).length?`<div class="scorers"><strong>Goal scorers</strong>${soccerScorers(g).join('<br>')}</div>`:''}</article>`}
function cards(gs,none,extended=false){gs=gs.filter(g=>confirmedGame(g)&&(extended||g.state!=='UPCOMING'||isUpcoming(g)));return gs.length?gs.map(card).join(''):empty(none)}
function show(v){view=v;if(v!=='detail')lastView=v;['dashboard','home','detail','favoritesPage'].forEach(id=>{let el=$(id);el.classList.toggle('show',id===(v==='browse'?'home':v==='favorites'?'favoritesPage':v));if(id==='home')el.classList.toggle('hide',v!=='browse')});$('topFav').classList.toggle('active',v==='favorites');$('topHome').classList.toggle('active',v==='dashboard');$('topBrowse').classList.toggle('active',v==='browse')}
function renderSports(){let html=Object.keys(leagues).map(s=>`<button type="button" class="${s===sport?'active':''}" onclick="chooseSport(${attr(s)})">${esc(s)}</button><button class="star ${favSports.has(s)?'selected':''}" aria-label="Favorite ${esc(s)}" onclick="toggleSport(event,${attr(s)})">★</button>`).join('');$('sports').innerHTML=html;if($('dashSports'))$('dashSports').innerHTML=html}
function renderLeagues(){$('leagueTitle').textContent=sport+' leagues';$('leagues').innerHTML=leagues[sport].map(l=>`<span class="leagueChoice ${l===league?'active':''}"><button class="leagueSelect" onclick="chooseLeague(${attr(l)})">${esc(l)}</button><button class="leagueStar ${favLeagues.has(key(sport,l))?'selected':''}" aria-label="Favorite ${esc(l)}" onclick="toggleLeague(event,${attr(sport)},${attr(l)})">★</button></span>`).join('')}
function setTab(t){tab=t;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));renderBrowse()}
async function renderBrowse(){let s=sport,l=league;$('games').innerHTML=empty('Loading real scores and schedules…');let result=await load(s,l);if(view!=='browse'||sport!==s||league!==l)return;let gs=result.games;if(tab==='live')gs=gs.filter(g=>g.state==='LIVE');else if(tab==='upcoming')gs=gs.filter(isUpcoming);else if(tab==='favorites')gs=gs.filter(g=>teamFav(g)||gameFav(g));else gs=gs.filter(isUpcoming);$('games').innerHTML=cards(gs,result.error||msg(s,l))+(gs.length&&result.error?empty(result.error):'');}
function chooseSport(s){sport=s;league=leagues[s][0];showBrowse()}
function chooseLeague(l){league=l;renderLeagues();renderBrowse()}
function showBrowse(t){show('browse');if(t)tab=t;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));renderSports();renderLeagues();renderBrowse()}
function toggleTeam(e,s,t){e.stopPropagation();let k=key(s,t);teams.has(k)?teams.delete(k):teams.add(k);store('ivaanFavorites',teams);updateCount();refreshView()}
function toggleLeague(e,s,l){e.stopPropagation();let k=key(s,l);favLeagues.has(k)?favLeagues.delete(k):favLeagues.add(k);store('kodaFavoriteLeagues',favLeagues);updateCount();refreshView()}
function toggleGame(e,id){e.stopPropagation();favGames.has(id)?favGames.delete(id):favGames.add(id);store('kodaFavoriteGames',favGames);updateCount();refreshView()}
function refreshView(){renderLeagues();if(view==='browse')renderBrowse();if(view==='dashboard')renderDashboard();if(view==='favorites')showFavorites();if(view==='detail'&&current)openDetail(current)}
async function renderDashboard(){show('dashboard');$('dashLive').innerHTML=empty('Loading live games…');$('dashUpcoming').innerHTML=empty('Loading upcoming games…');const targets=[['Soccer','Premier League'],['Football','NFL'],['Baseball','MLB'],['Basketball','NBA'],['Tennis','ATP Tour'],...[...favLeagues].map(k=>k.split('::'))];let unique=[...new Map(targets.map(p=>[key(...p),p])).values()];await Promise.all(unique.map(([s,l])=>load(s,l)));if(view!=='dashboard')return;let errors=[...cache.values()].filter(v=>v.error).map(v=>v.error),notice=errors.length?' Some league data is unavailable; browse a league for details.':'';let gs=allGames(),sort=(a,b)=>new Date(a.when)-new Date(b.when),rank=(a,b)=>Number(gameFav(b)||teamFav(b)||leagueFav(b))-Number(gameFav(a)||teamFav(a)||leagueFav(a));$('dashLive').innerHTML=cards(gs.filter(g=>g.state==='LIVE').sort(rank).slice(0,8),'No live games returned by the currently loaded leagues.'+notice);$('dashUpcoming').innerHTML=cards(gs.filter(isUpcoming).sort((a,b)=>rank(a,b)||sort(a,b)).slice(0,8),'No upcoming games today or tomorrow in the loaded leagues.'+notice);}

function showDashboard(){renderDashboard()}
function jumpLeague(s,l){sport=s;league=l;showBrowse('upcoming')}
function jumpTeam(s,t){sport=s;let g=allGames().find(g=>g.sport===s&&(g.a===t||g.b===t));league=g?.league||leagues[s][0];showBrowse('favorites')}
function matchesLeague(g){
 if(g.sport!=='Tennis'||['ATP Tour','WTA Tour'].includes(g.league))return true;
 const names={'French Open':'French Open|Roland Garros','US Open':'US Open','Australian Open':'Australian Open','Wimbledon':'Wimbledon','Davis Cup':'Davis Cup','Billie Jean King Cup':'Billie Jean King Cup'};
 return new RegExp(names[g.league],'i').test([g.raw.name,g.raw.shortName,g.raw.season?.displayName,g.raw.competitions?.[0]?.notes?.[0]?.headline].join(' '));
}
const favoriteSchedules=new Map(), favoriteRequests=new Map();
const nextFive=gs=>[...new Map(gs.filter(g=>confirmedGame(g)&&g.state==='UPCOMING'&&new Date(g.when)>=new Date(new Date().setHours(0,0,0,0))).map(g=>[g.id,g])).values()].sort((a,b)=>new Date(a.when)-new Date(b.when)).slice(0,5);
function toggleSport(e,s){e.stopPropagation();favSports.has(s)?favSports.delete(s):favSports.add(s);store('kodaFavoriteSports',favSports);updateCount();renderSports();refreshView()}
async function loadFavoriteSchedule(s,l){
 const k=key(s,l),old=favoriteSchedules.get(k);
 if(old&&Date.now()-old.at<300000)return old;
 if(favoriteRequests.has(k))return favoriteRequests.get(k);
 const job=(async()=>{
  const base=await load(s,l);let gs=[...base.games],error=base.error;
  if(!error){
   const wanted=[...teams].filter(t=>t.startsWith(s+'::')).map(t=>t.slice(s.length+2));
   const enough=()=>nextFive(gs).length===5&&wanted.every(t=>nextFive(gs.filter(g=>g.a===t||g.b===t)).length===5);
   // Search consecutive dates so the five fixtures are the earliest, not a sample.
   for(let offset=2;offset<92&&!enough();offset+=5){
    const dates=Array.from({length:Math.min(5,92-offset)},(_,i)=>dayStr(plus(offset+i)));
    const results=await Promise.allSettled(dates.map(d=>fetchScoreboard(endpoint(s,l),d)));
    for(const r of results)if(r.status==='fulfilled')gs.push(...r.value.map(e=>parseEvent(e,s,l)).filter(g=>confirmedGame(g)&&matchesLeague(g)));
    if(results.some(r=>r.status==='rejected')){error='Some future schedule dates could not be loaded.';break}
    gs=[...new Map(gs.map(g=>[g.id,g])).values()];
    favoriteSchedules.set(k,{at:Date.now(),games:gs,error:null,loading:true});
    gs.forEach(g=>gamesById.set(g.id,g));if(view==='favorites')renderFavList();
   }
  }
  const out={at:Date.now(),games:gs,error,loading:false};favoriteSchedules.set(k,out);gs.forEach(g=>gamesById.set(g.id,g));return out;
 })();favoriteRequests.set(k,job);try{return await job}finally{favoriteRequests.delete(k)}
}
async function showFavorites(){
 show('favorites');renderFavList();const targets=new Map([...favLeagues].map(k=>[k,k.split('::')]));
 // Team favorites must load their leagues even after a fresh browser session.
 for(const k of teams){const s=k.split('::')[0];for(const l of leagues[s]||[])targets.set(key(s,l),[s,l])}
 for(const s of favSports)for(const l of leagues[s]||[])targets.set(key(s,l),[s,l]);
 const queue=[...targets.values()];await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{while(queue.length){const [s,l]=queue.shift();await loadFavoriteSchedule(s,l);if(view==='favorites')renderFavList()}}));
 if(view==='favorites')renderFavList();
}
function favoritePool(){return [...new Map([...allGames(),...[...favoriteSchedules.values()].flatMap(v=>v.games)].map(g=>[g.id,g])).values()]}
function favoriteEntry(title,subtitle,gs,remove,error,loading){return `<div class="favLeagueEntry"><div class="favItem"><div><b>${esc(title)}</b><small>${esc(subtitle)}</small></div>${remove}</div><div class="fixtureTitle">🔴 Live games</div><div class="games">${cards(gs.filter(g=>g.state==='LIVE'),'No live games right now.',true)}</div><div class="fixtureTitle">📅 Next 5 games</div><div class="games">${cards(nextFive(gs),loading?'Loading upcoming fixtures…':error||'No confirmed upcoming fixtures published in the next 90 days.',true)}</div>${error?empty(error):''}${nextFive(gs).length<5&&!loading&&!error?'<p class="status">Showing the confirmed fixtures available in the next 90 days.</p>':''}</div>`}
function renderFavList(){
 const pool=favoritePool();
 $('favList').innerHTML=teams.size?[...teams].map(k=>{const [s,...r]=k.split('::'),t=r.join('::');return favoriteEntry(t,s,pool.filter(g=>g.sport===s&&(g.a===t||g.b===t)),`<button class="star selected" onclick="toggleTeam(event,${attr(s)},${attr(t)})">★</button>`,[...favoriteSchedules].filter(([k])=>k.startsWith(s+'::')).map(([,v])=>v.error).find(Boolean),[...favoriteRequests.keys()].some(k=>k.startsWith(s+'::')))}).join(''):empty('No favorite teams yet.');
 $('favLeagueList').innerHTML=favLeagues.size?[...favLeagues].map(k=>{const [s,l]=k.split('::'),v=favoriteSchedules.get(k)||cache.get(k);return favoriteEntry(l,s,v?.games||[],`<button class="star selected" onclick="toggleLeague(event,${attr(s)},${attr(l)})">★</button>`,v?.error,!v||v.loading||favoriteRequests.has(k))}).join(''):empty('No favorite leagues yet.');
 $('favSportList').innerHTML=favSports.size?[...favSports].map(s=>favoriteEntry(s,'All supported leagues',pool.filter(g=>g.sport===s),`<button class="star selected" onclick="toggleSport(event,${attr(s)})">★</button>`,null,[...favoriteRequests.keys()].some(k=>k.startsWith(s+'::')))).join(''):empty('Star a sport to follow its next five games.');
 $('favGameList').innerHTML=cards(pool.filter(g=>gameFav(g)&&g.state!=='FINAL'),'No loaded favorite games.',true);
}
function backHome(){if(lastView==='favorites')showFavorites();else if(lastView==='browse')showBrowse();else showDashboard()}
function soccerScorers(g){
  const by=new Map(), seen=new Set();
  for(const p of g.scoring||[]) {
    // Match details also include cards and substitutions; only count goals.
    const type=String(p.type?.text||p.type?.name||'');
    if(p.shootout||p.scoringPlay===false||(!p.scoringPlay&&!/goal|penalty.*scored/i.test(type))) continue;
    const actor=p.participants?.find(x=>x.type==='scorer')||p.participants?.[0];
    const name=p.athletesInvolved?.[0]?.displayName||actor?.athlete?.displayName||p.athletes?.[0]?.displayName||p.athlete?.displayName||p.player?.displayName||p.scorer?.displayName;
    if(!name)continue;
    const minute=p.clock?.displayValue||p.displayClock||p.time?.displayValue||'';
    const mark=name+'|'+minute+'|'+(p.ownGoal?'OG':'');if(seen.has(mark))continue;seen.add(mark);
    const label=name+(p.ownGoal?' (own goal)':'');
    by.set(label,[...(by.get(label)||[]),minute]);
  }
  return [...by].map(([name,mins])=>`${esc(name)} — ${mins.length} ${mins.length===1?'goal':'goals'}${mins.some(Boolean)?' — '+mins.filter(Boolean).map(esc).join(', '):''}`);
}

async function openDetail(id){let g=gamesById.get(String(id));if(!g)return;current=String(id);show('detail');$('detailContent').innerHTML=detailHTML(g,g.sport==='Soccer'&&soccerScorers(g).length?soccerScorers(g).join('<br>'):'Loading game details…');try{let r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/${g.path}/summary?event=${encodeURIComponent(g.id)}`);if(!r.ok)throw Error('Details unavailable');let d=await r.json();if(view!=='detail'||current!==String(id))return;g.prediction=readPrediction(g,d);let c=d.header?.competitions?.[0]||{},scoring=[...(d.scoringPlays||[]),...(c.details||[]),...(d.keyEvents||[]),...(d.plays||[]).filter(p=>p.scoringPlay),...(g.scoring||[])];let extra='';if(g.sport==='Soccer'){let lines=soccerScorers({...g,scoring:scoring.length?scoring:g.scoring});extra=lines.length?lines.join('<br>'):'Goal-scorer names and minutes are not available from the data provider for this match.'}else if(g.sport==='Cricket'){extra='Bowler information is not available from this match feed.'}else if(g.sport!=='Basketball'){let leaders=d.boxscore?.players||[];extra=leaders.length?'Player stats are available in the source, but may vary by league.':'Player scoring details are not available for this game.'} $('detailContent').innerHTML=detailHTML(g,extra)}catch(e){if(view==='detail'&&current===String(id))$('detailContent').innerHTML=detailHTML(g,g.sport==='Soccer'&&soccerScorers(g).length?soccerScorers(g).join('<br>'):'Player-level details are unavailable for this match.')}}
function readPrediction(g,d){
 const p=d.predictor,cs=g.raw?.competitions?.[0]?.competitors||[];
 const home=cs.find(c=>c.homeAway==='home'),away=cs.find(c=>c.homeAway==='away');
 const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
 const a=number(p?.homeTeam?.gameProjection),b=number(p?.awayTeam?.gameProjection);
 if(a===null||b===null||a<0||b<0||a>100||b>100||a+b>100.5||!home||!away)return null;
 return {a,b,home:home.team?.displayName||home.athlete?.displayName||g.a,away:away.team?.displayName||away.athlete?.displayName||g.b,draw:g.sport==='Soccer'?Math.max(0,100-a-b):null};
}
function predictionHTML(g){
 const p=g.prediction;
 if(!p)return `<div class="highlights"><h3>Win prediction</h3><p>${g.state==='FINAL'?'Game completed. ':''}Prediction unavailable — the data provider has not supplied win percentages for this match.</p></div>`;
 const choices=[[p.home,p.a],[p.away,p.b],...(p.draw===null?[]:[['Draw',p.draw]])].sort((a,b)=>b[1]-a[1]);
 return `<div class="highlights"><h3>Win prediction</h3><p><strong>${choices[0][1]===choices[1][1]?'Evenly matched':esc(choices[0][0])+' — '+choices[0][1].toFixed(1)+'%'}</strong></p>${choices.map(([n,v])=>`<p>${esc(n)}: ${v.toFixed(1)}%</p>`).join('')}<p class="status">ESPN match predictor · Pre-game estimate, not a guarantee${g.state==='LIVE'?'; does not update with the live score':''}.</p></div>`;
}
function detailHTML(g,extra){return `<div class="detailbox"><div class="meta"><span>${esc(g.sport)} · ${esc(g.league)}</span><span class="${g.state==='LIVE'?'live':''}">${esc(g.state)}</span></div><div class="detailteams"><div><h2>${esc(g.a)}</h2><div class="bigscore ${Number(g.sa)>Number(g.sb)?'winner':''}">${esc(g.sa??'—')}</div></div><strong>vs</strong><div><h2>${esc(g.b)}</h2><div class="bigscore ${Number(g.sb)>Number(g.sa)?'winner':''}">${esc(g.sb??'—')}</div></div></div><div class="info"><div><div class="label">STATUS</div><div class="value">${esc(g.status)}</div></div><div><div class="label">START</div><div class="value">${esc(dateText(g.when))}</div></div><div><div class="label">VENUE</div><div class="value">${esc(g.venue)}</div></div></div>${predictionHTML(g)}${g.sport!=='Basketball'?`<div class="highlights"><h3>${g.sport==='Soccer'?'Goal scorers & minutes':g.sport==='Cricket'?'Bowlers':'Player details'}</h3><p>${extra}</p></div>`:''}<p class="status">Data source: ESPN (unofficial endpoint). Last loaded ${new Date().toLocaleTimeString()}.</p></div>`}
updateCount();renderSports();document.title='Koda’s Sports · Live';document.querySelector('.demo').textContent='LIVE DATA';document.querySelector('.sub').textContent=document.querySelector('.sub').textContent;document.querySelector('.dashHero .sub').textContent='Real scores and upcoming matchups from supported leagues. Refreshes every 90 seconds while open.';document.querySelector('.favoritesPage .sub').textContent='Starred teams, leagues and games saved on this device.';renderDashboard();setInterval(()=>{cache.clear();if(view==='dashboard')renderDashboard();else if(view==='browse')renderBrowse();else if(view==='favorites')showFavorites()},90000);

