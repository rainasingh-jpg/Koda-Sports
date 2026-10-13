const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {innerHTML:'',textContent:'',classList:{toggle() {}}});
  return elements.get(id);
};
const storage = new Map();
const now = new Date().toISOString();
let fail = false;
const context = vm.createContext({
  document: {getElementById:element,querySelector:element,querySelectorAll:()=>[],title:''},
  localStorage: {getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  Date, Map, Set, URLSearchParams, AbortController, setTimeout, clearTimeout, setInterval:()=>0,
  fetch:async(url)=> {
    assert.match(url, /dates=\d{8}&limit=100$/,'Provider requests use one date, not a range');
    if (fail) throw Error('offline');
    return {ok:true,json:async()=>({events:[{
      id:'fixture-1',date:now,status:{type:{state:'pre',shortDetail:'Scheduled'}},
      competitions:[{competitors:[
        {homeAway:'home',team:{displayName:'Home & Team'}},
        {homeAway:'away',team:{displayName:'Away Team'}}
      ]}]
    }]})};
  }
});
vm.runInContext(fs.readFileSync('assets/app.js','utf8'),context);
(async()=>{
  await vm.runInContext('renderDashboard()',context);
  assert.match(element('dashUpcoming').innerHTML,/Home &amp; Team/);
  await vm.runInContext("show('browse'); tab='upcoming'; renderBrowse()",context);
  assert.match(element('games').innerHTML,/Home &amp; Team/,'Upcoming includes scheduled games today');
  vm.runInContext("toggleTeam({stopPropagation(){}}, 'Soccer', 'Home & Team')",context);
  assert.deepEqual(JSON.parse(storage.get('ivaanFavorites')),['Soccer::Home & Team']);
  vm.runInContext("toggleLeague({stopPropagation(){}}, 'Soccer', 'Premier League')",context);
  assert.deepEqual(JSON.parse(storage.get('kodaFavoriteLeagues')),['Soccer::Premier League']);
  vm.runInContext("toggleGame({stopPropagation(){}}, 'fixture-1')",context);
  assert.deepEqual(JSON.parse(storage.get('kodaFavoriteGames')),['fixture-1']);
  assert.equal(vm.runInContext("isUpcoming({state:'UPCOMING',when:plus(1).toISOString()})",context),true);
  assert.equal(vm.runInContext("isUpcoming({state:'UPCOMING',when:plus(2).toISOString()})",context),false);
  assert.equal(vm.runInContext("confirmedGame({a:'Chelsea',b:'TBC'})",context),false);
  assert.equal(vm.runInContext("confirmedGame({a:'TBD',b:'Arsenal'})",context),false);
  assert.equal(vm.runInContext("confirmedGame({a:'Chelsea',b:'Arsenal'})",context),true);
  const goals=vm.runInContext(`soccerScorers({scoring:[
    {scoringPlay:true,clock:{displayValue:"45'+2'"},participants:[{athlete:{displayName:'Goal Scorer'}},{athlete:{displayName:'Assist Player'}}]},
    {scoringPlay:true,clock:{displayValue:"45'+2'"},athletesInvolved:[{displayName:'Goal Scorer'}]},
    {scoringPlay:false,type:{text:'Yellow Card'},athletesInvolved:[{displayName:'Card Player'}]}
  ]})`,context);
  assert.equal(goals.length,1);assert.match(goals[0],/Goal Scorer — 1 goal/);
  assert.match(goals[0],/45&#39;\+2&#39;/);assert.doesNotMatch(goals.join(''),/Assist Player|Card Player/);
  const five=vm.runInContext("nextFive(Array.from({length:8},(_,i)=>({id:String(i),a:'A',b:'B',state:'UPCOMING',when:plus(8-i).toISOString()})))",context);
  assert.equal(five.length,5);assert.equal(five[0].id,'7');
  assert.match(vm.runInContext("cards([{id:'later',a:'A',b:'B',state:'UPCOMING',when:plus(8).toISOString()}],'none',true)",context),/class="card"/);
  assert.doesNotMatch(vm.runInContext("cards([{id:'later',a:'A',b:'B',state:'UPCOMING',when:plus(8).toISOString()}],'none')",context),/class="card"/);
  const prediction=vm.runInContext("readPrediction({sport:'Soccer',raw:{competitions:[{competitors:[{homeAway:'home',team:{displayName:'A'}},{homeAway:'away',team:{displayName:'B'}}]}]}},{predictor:{homeTeam:{gameProjection:'60'},awayTeam:{gameProjection:'20'}}})",context);
  assert.equal(prediction.draw,20);assert.equal(prediction.home,'A');
  assert.equal(vm.runInContext("readPrediction({},{predictor:{homeTeam:{gameProjection:null},awayTeam:{gameProjection:50}}})",context),null);
  assert.match(vm.runInContext("predictionHTML({state:'UPCOMING'})",context),/Prediction unavailable/);
  assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/data-tab="today"|dashFavorites/);
  fail=true;
  await vm.runInContext("cache.clear(); show('browse'); renderBrowse()",context);
  assert.match(element('games').innerHTML,/Could not load live data/);
  assert.doesNotMatch(element('games').innerHTML,/class="card"/,'Failure does not invent scores');
  console.log('PASS: dashboard, Upcoming, escaping, favorites, and unavailable-data behavior');
})().catch(error=>{console.error(error);process.exitCode=1});

