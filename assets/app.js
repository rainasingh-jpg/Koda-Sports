// Koda's Sports: live scoreboard data from ESPN's publicly reachable, unofficial site API.
// ESPN may change or restrict these endpoints; unavailable data is never replaced with invented scores.
const leagues={Soccer:['Premier League','La Liga','Champions League','Serie A','Bundesliga','Ligue 1','MLS','World Cup','Europa League','Copa América'],Tennis:['ATP Tour','WTA Tour','Australian Open','French Open','Wimbledon','US Open','Davis Cup','Billie Jean King Cup'],Football:['NFL','College Football','CFL'],Baseball:['MLB','World Baseball Classic','NCAA Baseball'],Cricket:['ICC World Cup','Test Championship','T20 Internationals','The Ashes','IPL','Big Bash League'],Basketball:['NBA','WNBA',"NCAA Men's","NCAA Women's",'FIBA World Cup','EuroLeague']};
const paths={Soccer:{'Premier League':'soccer/eng.1','La Liga':'soccer/esp.1','Champions League':'soccer/uefa.champions','Serie A':'soccer/ita.1','Bundesliga':'soccer/ger.1','Ligue 1':'soccer/fra.1','MLS':'soccer/usa.1','World Cup':'soccer/fifa.world','Europa League':'soccer/uefa.europa','Copa América':'soccer/conmebol.america'},Tennis:{'ATP Tour':'tennis/atp','WTA Tour':'tennis/wta','Australian Open':'tennis/atp','French Open':'tennis/atp','Wimbledon':'tennis/atp','US Open':'tennis/atp','Davis Cup':'tennis/atp','Billie Jean King Cup':'tennis/wta'},Football:{NFL:'football/nfl','College Football':'football/college-football',CFL:'football/cfl'},Baseball:{MLB:'baseball/mlb','World Baseball Classic':'baseball/world-baseball-classic','NCAA Baseball':'baseball/college-baseball'},Cricket:{'ICC World Cup':'cricket/icc.world-cup','Test Championship':'cricket/icc.test','T20 Internationals':'cricket/icc.t20','The Ashes':'cricket/ashes',IPL:'cricket/ipl','Big Bash League':'cricket/big-bash-league'},Basketball:{NBA:'basketball/nba',WNBA:'basketball/wnba',"NCAA Men's":'basketball/mens-college-basketball',"NCAA Women's":'basketball/womens-college-basketball','FIBA World Cup':'basketball/fiba.world','EuroLeague':'basketball/euroleague'}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=v=>esc(JSON.stringify(v));
const readSet=k=>{try{return new Set(JSON.parse(localStorage.getItem(k)||'[]'))}catch{return new Set()}};
const teams=readSet('ivaanFavorites'), favLeagues=readSet('kodaFavoriteLeagues'), favGames=readSet('kodaFavoriteGames');
const key=(s,t)=>s+'::'+t;
const store=(k,s)=>{try{localStorage.setItem(k,JSON.stringify([...s]))}catch{}};
let sport='Soccer',league='Premier League',tab='today',view='dashboard',lastView='dashboard',current=null;
const cache=new Map(),gamesById=new Map(),requests=new Map();let lastUpdate=0;
const $=id=>document.getElementById(id);
const today=()=>new Date();
const dayStr=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('');
const plus=(n)=>{let d=today();d.setDate(d.getDate()+n);return d};
const dateText=s=>s?new Date(s).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Time not available';
const empty=t=>`<div class="empty">${esc(t)}</div>`;
const msg=(s,l)=>`No games available for ${l}. ${s==='Cricket'?'Cricket coverage varies by tournament.':''}`;
function updateCount(){$('favCount').textContent=teams.size+favLeagues.size+favGames.size}
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
    // Three batches limit simultaneous requests per league.
    const dates=Array.from({length:15},(_,i)=>dayStr(plus(i)));
    for(let i=0;i<dates.length;i+=5) {
      const results=await Promise.allSettled(dates.slice(i,i+5).map(d=>fetchScoreboard(url,d)));
      for(const result of results) {
        if(result.status==='fulfilled') result.value.forEach(e=>events.set(String(e.id),e));
        else failures.push(result.reason?.message||'Request failed');
      }
      // An unsupported feed does not benefit from more date requests.
      if(i===0&&failures.length===5&&failures.every(e=>e==='HTTP 404')) break;
    }
    let games=[...events.values()].map(e=>parseEvent(e,s,l));
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
function card(g){return `<article class="card" onclick="openDetail(${attr(g.id)})"><div class="meta"><span>${esc(g.sport)} · ${esc(g.league)}</span><span class="metaRight"><span class="${g.state==='LIVE'?'live':''}">${esc(g.state)}</span><button class="gameStar ${gameFav(g)?'selected':''}" aria-label="Favorite game" onclick="toggleGame(event,${attr(g.id)})">★</button></span></div><div class="teams"><div class="team">${esc(g.a)}</div>${formatScore(g,'a')}<div class="team">${esc(g.b)}</div>${formatScore(g,'b')}</div><div class="status">${esc(g.status)} · ${esc(dateText(g.when))}</div><div class="where">📍 ${esc(g.venue)}</div></article>`}
function cards(gs,none){return gs.length?gs.map(card).join(''):empty(none)}
function show(v){view=v;if(v!=='detail')lastView=v;['dashboard','home','detail','favoritesPage'].forEach(id=>{let el=$(id);el.classList.toggle('show',id===(v==='browse'?'home':v==='favorites'?'favoritesPage':v));if(id==='home')el.classList.toggle('hide',v!=='browse')});$('topFav').classList.toggle('active',v==='favorites');$('topHome').classList.toggle('active',v==='dashboard');$('topBrowse').classList.toggle('active',v==='browse')}
function renderSports(){let html=Object.keys(leagues).map(s=>`<button type="button" class="${s===sport?'active':''}" onclick="chooseSport(${attr(s)})">${esc(s)}</button>`).join('');$('sports').innerHTML=html;if($('dashSports'))$('dashSports').innerHTML=html}
function renderLeagues(){$('leagueTitle').textContent=sport+' leagues';$('leagues').innerHTML=leagues[sport].map(l=>`<span class="leagueChoice ${l===league?'active':''}"><button class="leagueSelect" onclick="chooseLeague(${attr(l)})">${esc(l)}</button><button class="leagueStar ${favLeagues.has(key(sport,l))?'selected':''}" aria-label="Favorite ${esc(l)}" onclick="toggleLeague(event,${attr(sport)},${attr(l)})">★</button></span>`).join('')}
function setTab(t){tab=t;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));renderBrowse()}
async function renderBrowse(){let s=sport,l=league;$('games').innerHTML=empty('Loading real scores and schedules…');let result=await load(s,l);if(view!=='browse'||sport!==s||league!==l)return;let gs=result.games;if(tab==='live')gs=gs.filter(g=>g.state==='LIVE');else if(tab==='upcoming')gs=gs.filter(g=>g.state==='UPCOMING');else if(tab==='favorites')gs=gs.filter(g=>teamFav(g)||gameFav(g));else gs=gs.filter(g=>g.when&&dayStr(new Date(g.when))===dayStr(today()));$('games').innerHTML=cards(gs,result.error||msg(s,l))+(gs.length&&result.error?empty(result.error):'');}
function chooseSport(s){sport=s;league=leagues[s][0];showBrowse()}
function chooseLeague(l){league=l;renderLeagues();renderBrowse()}
function showBrowse(t){show('browse');if(t)tab=t;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));renderSports();renderLeagues();renderBrowse()}
function toggleTeam(e,s,t){e.stopPropagation();let k=key(s,t);teams.has(k)?teams.delete(k):teams.add(k);store('ivaanFavorites',teams);updateCount();refreshView()}
function toggleLeague(e,s,l){e.stopPropagation();let k=key(s,l);favLeagues.has(k)?favLeagues.delete(k):favLeagues.add(k);store('kodaFavoriteLeagues',favLeagues);updateCount();refreshView()}
function toggleGame(e,id){e.stopPropagation();favGames.has(id)?favGames.delete(id):favGames.add(id);store('kodaFavoriteGames',favGames);updateCount();refreshView()}
function refreshView(){renderLeagues();if(view==='browse')renderBrowse();if(view==='dashboard')renderDashboard();if(view==='favorites')renderFavList();if(view==='detail'&&current)openDetail(current)}
async function renderDashboard(){show('dashboard');$('dashLive').innerHTML=empty('Loading live games…');$('dashUpcoming').innerHTML=empty('Loading upcoming games…');const targets=[['Soccer','Premier League'],['Football','NFL'],['Baseball','MLB'],['Basketball','NBA'],['Tennis','ATP Tour'],...[...favLeagues].map(k=>k.split('::'))];let unique=[...new Map(targets.map(p=>[key(...p),p])).values()];await Promise.all(unique.map(([s,l])=>load(s,l)));if(view!=='dashboard')return;let errors=[...cache.values()].filter(v=>v.error).map(v=>v.error),notice=errors.length?' Some league data is unavailable; browse a league for details.':'';let gs=allGames(),sort=(a,b)=>new Date(a.when)-new Date(b.when),rank=(a,b)=>Number(gameFav(b)||teamFav(b)||leagueFav(b))-Number(gameFav(a)||teamFav(a)||leagueFav(a));$('dashLive').innerHTML=cards(gs.filter(g=>g.state==='LIVE').sort(rank).slice(0,8),'No live games returned by the currently loaded leagues.'+notice);$('dashUpcoming').innerHTML=cards(gs.filter(g=>g.state==='UPCOMING').sort((a,b)=>rank(a,b)||sort(a,b)).slice(0,8),'No upcoming games returned by the currently loaded leagues.'+notice);$('dashFavorites').innerHTML=[...teams].map(k=>`<button class="action outline" onclick="jumpTeam(${attr(k.split('::')[0])},${attr(k.split('::').slice(1).join('::'))})">★ ${esc(k.split('::').slice(1).join('::'))}</button>`).concat([...favLeagues].map(k=>`<button class="action outline" onclick="jumpLeague(${attr(k.split('::')[0])},${attr(k.split('::').slice(1).join('::'))})">★ ${esc(k.split('::').slice(1).join('::'))}</button>`)).join('')||empty('Star teams and leagues to see them here.');}
function showDashboard(){renderDashboard()}
function jumpLeague(s,l){sport=s;league=l;showBrowse('upcoming')}
function jumpTeam(s,t){sport=s;let g=allGames().find(g=>g.sport===s&&(g.a===t||g.b===t));league=g?.league||leagues[s][0];showBrowse('favorites')}
async function showFavorites(){show('favorites');renderFavList();let keys=[...favLeagues].map(k=>k.split('::'));await Promise.all(keys.map(([s,l])=>load(s,l)));if(view==='favorites')renderFavList()}
function renderFavList(){$('favList').innerHTML=teams.size?[...teams].map(k=>{let [s,...rest]=k.split('::'),t=rest.join('::');return `<div class="favItem"><div><b>${esc(t)}</b><small>${esc(s)}</small></div><button class="star selected" onclick="toggleTeam(event,${attr(s)},${attr(t)})">★</button></div>`}).join(''):empty('No favorite teams yet.');$('favLeagueList').innerHTML=favLeagues.size?[...favLeagues].map(k=>{let [s,...rest]=k.split('::'),l=rest.join('::'),v=cache.get(k),gs=v?.games||[];return `<div class="favLeagueEntry"><div class="favItem"><div><b>${esc(l)}</b><small>${esc(s)}</small></div><button class="star selected" onclick="toggleLeague(event,${attr(s)},${attr(l)})">★</button></div><div class="fixtureTitle">🔴 Live games</div><div class="games">${cards(gs.filter(g=>g.state==='LIVE'),v?.error||'No live games right now.')}</div><div class="fixtureTitle">📅 Upcoming games</div><div class="games">${cards(gs.filter(g=>g.state==='UPCOMING'),v?.error||'No upcoming games found in the next two weeks.')}</div></div>`}).join(''):empty('No favorite leagues yet.');$('favGameList').innerHTML=cards(allGames().filter(g=>gameFav(g)&&g.state!=='FINAL'),'No loaded live or upcoming favorite games. Browse a league to load its schedule.');}
function backHome(){if(lastView==='favorites')showFavorites();else if(lastView==='browse')showBrowse();else showDashboard()}
function soccerScorers(g){let plays=g.scoring||[];let lines=[];for(let p of plays){let name=p.athletes?.[0]?.displayName||p.athlete?.displayName||p.player?.displayName||p.scorer?.displayName;let minute=p.clock?.displayValue||p.clock?.value||p.displayClock||p.time?.displayValue||'';if(name)lines.push({name,minute})}let by=new Map();lines.forEach(x=>by.set(x.name,[...(by.get(x.name)||[]),x.minute]));return [...by].map(([name,mins])=>`${esc(name)} — ${mins.length} ${mins.length===1?'goal':'goals'}${mins.some(Boolean)?' — '+mins.filter(Boolean).map(m=>esc(m)+' min').join(', '):''}`)}
async function openDetail(id){let g=gamesById.get(String(id));if(!g)return;current=String(id);show('detail');$('detailContent').innerHTML=detailHTML(g,'Loading game details…');try{let r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/${g.path}/summary?event=${encodeURIComponent(g.id)}`);if(!r.ok)throw Error('Details unavailable');let d=await r.json();if(view!=='detail'||current!==String(id))return;let c=d.header?.competitions?.[0]||{},scoring=d.scoringPlays||c.details||d.plays?.filter(p=>p.scoringPlay)||[];let extra='';if(g.sport==='Soccer'){let lines=soccerScorers({...g,scoring});extra=lines.length?lines.join('<br>'):'Goal-scorer names and minutes are not available from the data provider for this match.'}else if(g.sport==='Cricket'){extra='Bowler information is not available from this match feed.'}else if(g.sport!=='Basketball'){let leaders=d.boxscore?.players||[];extra=leaders.length?'Player stats are available in the source, but may vary by league.':'Player scoring details are not available for this game.'} $('detailContent').innerHTML=detailHTML(g,extra)}catch(e){if(view==='detail'&&current===String(id))$('detailContent').innerHTML=detailHTML(g,'Player-level details are unavailable for this match. Scores and schedules are still real.')}}
function detailHTML(g,extra){return `<div class="detailbox"><div class="meta"><span>${esc(g.sport)} · ${esc(g.league)}</span><span class="${g.state==='LIVE'?'live':''}">${esc(g.state)}</span></div><div class="detailteams"><div><h2>${esc(g.a)}</h2><div class="bigscore ${Number(g.sa)>Number(g.sb)?'winner':''}">${esc(g.sa??'—')}</div></div><strong>vs</strong><div><h2>${esc(g.b)}</h2><div class="bigscore ${Number(g.sb)>Number(g.sa)?'winner':''}">${esc(g.sb??'—')}</div></div></div><div class="info"><div><div class="label">STATUS</div><div class="value">${esc(g.status)}</div></div><div><div class="label">START</div><div class="value">${esc(dateText(g.when))}</div></div><div><div class="label">VENUE</div><div class="value">${esc(g.venue)}</div></div></div>${g.sport!=='Basketball'?`<div class="highlights"><h3>${g.sport==='Soccer'?'Goal scorers & minutes':g.sport==='Cricket'?'Bowlers':'Player details'}</h3><p>${extra}</p></div>`:''}<p class="status">Data source: ESPN (unofficial endpoint). Last loaded ${new Date().toLocaleTimeString()}.</p></div>`}
updateCount();renderSports();document.title='Koda’s Sports · Live';document.querySelector('.demo').textContent='LIVE DATA';document.querySelector('.sub').textContent=document.querySelector('.sub').textContent;document.querySelector('.dashHero .sub').textContent='Real scores and upcoming matchups from supported leagues. Refreshes every 90 seconds while open.';document.querySelector('.favoritesPage .sub').textContent='Starred teams, leagues and games saved on this device.';renderDashboard();setInterval(()=>{cache.clear();if(view==='dashboard')renderDashboard();else if(view==='browse')renderBrowse();else if(view==='favorites')showFavorites()},90000);

