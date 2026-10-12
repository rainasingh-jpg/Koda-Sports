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
  Date, Map, Set, URLSearchParams, setInterval:()=>0,
  fetch:async()=> {
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
  await vm.runInContext("show('browse'); tab='today'; renderBrowse()",context);
  assert.match(element('games').innerHTML,/Home &amp; Team/,'Today includes scheduled games today');
  vm.runInContext("toggleTeam({stopPropagation(){}}, 'Soccer', 'Home & Team')",context);
  assert.deepEqual(JSON.parse(storage.get('ivaanFavorites')),['Soccer::Home & Team']);
  vm.runInContext("toggleLeague({stopPropagation(){}}, 'Soccer', 'Premier League')",context);
  assert.deepEqual(JSON.parse(storage.get('kodaFavoriteLeagues')),['Soccer::Premier League']);
  vm.runInContext("toggleGame({stopPropagation(){}}, 'fixture-1')",context);
  assert.deepEqual(JSON.parse(storage.get('kodaFavoriteGames')),['fixture-1']);
  fail=true;
  await vm.runInContext("cache.clear(); show('browse'); renderBrowse()",context);
  assert.match(element('games').innerHTML,/Could not load live data/);
  assert.doesNotMatch(element('games').innerHTML,/class="card"/,'Failure does not invent scores');
  console.log('PASS: dashboard, Today, escaping, favorites, and unavailable-data behavior');
})().catch(error=>{console.error(error);process.exitCode=1});
