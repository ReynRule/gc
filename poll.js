// RWPH tracker: 1초마다 wave 확인 → 오르면 해당 시간(KST)의 RWPH +1
// + 한 번에 10웨이브 이상 오르면 JUMP 기록 (점프 값은 10~12 / 20~22 / 30~32 → 10점프 / 20점프 / 30점프)
// + API의 시즌(start~end)이 바뀌면 점프 기록 초기화
// + 페이지 전체 새로고침 없이 data/state.json 폴링으로 UI 유지하며 갱신
const fs = require('fs');
const { execSync } = require('child_process');
const PLAYER = process.env.PLAYER || 'ReynRule';
const URL = `https://raongames.com/growcastle/restapi/season/now/players/${encodeURIComponent(PLAYER)}`;
const RUN_MS = (Number(process.env.RUN_MINUTES) || 345) * 60 * 1000;
const HANDOFF_AT = Number(process.env.HANDOFF_AT) || 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COMMIT_EVERY_MS = 1 * 60 * 1000;
const MAX_HOURS = 24;
const JUMP_MIN = 10;
const STATE = 'data/state.json';
const newJumps = () => ({ total: 0, j10: 0, j20: 0, j30: 0, hours: {} });
const tierOf = (d) => (d >= 30 ? 30 : d >= 20 ? 20 : 10);
let state = { player: PLAYER, lastWave: null, hours: {}, season: { start: null, end: null }, jumps: newJumps(), past: [], updated: 0 };
const load = () => {
  try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE, 'utf8')) }; } catch {}
  state.player = PLAYER;
  state.season ??= { start: null, end: null };
  state.jumps ??= newJumps();
  state.jumps.hours ??= {};
  state.past ??= [];
};
load();
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString();
const hourKey = (ms) => kst(ms).slice(0, 13);
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RWPH Tracker</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--line:#30363d;--text:#e6edf3;--sub:#8b949e;--acc:#58a6ff;--hot:#f0883e;--ok:#3fb950}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:radial-gradient(1200px 600px at 10% -10%,#1b2a4a 0,transparent 60%),var(--bg);color:var(--text);font:14px/1.5 -apple-system,"Segoe UI","Noto Sans KR",sans-serif;font-variant-numeric:tabular-nums}
.wrap{max-width:860px;margin:0 auto;padding:24px 16px 48px;padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right));padding-bottom:max(48px,env(safe-area-inset-bottom))}
h1{margin:0;font-size:22px;letter-spacing:.5px}
h1 small{color:var(--sub);font-weight:400;font-size:13px;margin-left:8px}
.sub{color:var(--sub);margin:4px 0 18px;word-break:keep-all}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.card .l{color:var(--sub);font-size:12px}
.card .v{font-size:22px;font-weight:700;margin-top:2px}
.card.click{cursor:pointer;border-color:#5b3a1e;background:linear-gradient(135deg,#2a1c10,#161b22)}
.card.click .v{color:var(--hot)}
.card.click:hover{border-color:var(--hot)}
.hint{color:var(--sub);font-size:11px;margin-top:2px}
.panel{display:none;margin-bottom:16px}
.panel.open{display:block}
.tiers{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 12px}
.tier{flex:1;min-width:110px;text-align:center;border:1px solid var(--line);border-radius:10px;padding:10px;background:#0d1117}
.tier b{display:block;font-size:20px;color:var(--hot)}
.tier span{color:var(--sub);font-size:12px}
table{width:100%;border-collapse:collapse}
th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--sub);font-weight:500;font-size:12px}
td.n,th.n{text-align:right}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.now td{background:#1c2a1f}
.badge{display:inline-block;background:var(--ok);color:#04210d;border-radius:6px;padding:0 6px;font-size:11px;font-weight:700;margin-left:6px}
.jbtn{display:inline-block;cursor:pointer;color:var(--hot);font-weight:700;border-radius:6px;padding:2px 8px;border:1px solid #5b3a1e;background:#2a1c10}
.jbtn:hover{border-color:var(--hot)}
.jnone{color:var(--sub)}
tr.detail td{background:#12171e;color:var(--sub);font-size:13px}
tr.detail b{color:var(--hot)}
h2{font-size:15px;margin:22px 0 8px}
.foot{color:var(--sub);font-size:12px;margin-top:16px}
@media (max-width:600px){
  body{font-size:13px}
  .wrap{padding-top:16px}
  h1{font-size:19px}
  h1 small{display:block;margin:2px 0 0}
  .sub{font-size:12px;margin-bottom:12px}
  .grid{grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
  .card{padding:10px 12px;border-radius:10px}
  .card .v{font-size:17px}
  .card.click{grid-column:1/-1;padding:12px 14px}
  .card.click .v{font-size:22px}
  .tiers{gap:6px}
  .tier{min-width:0;padding:8px 4px}
  .tier b{font-size:18px}
  .tier span{font-size:11px}
  th,td{padding:8px 6px}
  th{font-size:11px}
  #rows td:first-child,#seasonRows td:first-child,#pastRows td:first-child{white-space:normal;min-width:84px;line-height:1.35}
  .badge{margin-left:4px;padding:0 5px;font-size:10px}
  .jbtn{padding:6px 10px;font-size:13px;min-height:32px;min-width:44px;text-align:center}
  tr.detail td{white-space:normal;line-height:1.8}
  h2{font-size:14px;margin:18px 0 6px}
  .foot{font-size:11px}
}
</style>
</head>
<body>
<div class="wrap">
  <h1>RWPH</h1>
  <div class="sub" id="sub"></div>
  <div class="grid" id="cards"></div>
  <div class="card panel" id="seasonPanel">
    <div class="l">시즌 점프 상세 (클릭해서 닫기)</div>
    <div class="tiers" id="tiers"></div>
    <div class="scroll"><table>
      <thead><tr><th>시간대 (KST)</th><th class="n">10점프</th><th class="n">20점프</th><th class="n">30점프</th><th class="n">합계</th></tr></thead>
      <tbody id="seasonRows"></tbody>
    </table></div>
  </div>
  <h2>최근 24시간</h2>
  <div class="card scroll"><table>
    <thead><tr><th>시간대 (KST)</th><th class="n">RWPH</th><th class="n">wave+</th><th class="n">JUMP</th></tr></thead>
    <tbody id="rows"></tbody>
  </table></div>
  <div id="pastWrap" style="display:none">
    <h2>이전 시즌</h2>
    <div class="card scroll"><table>
      <thead><tr><th>시즌 (KST)</th><th class="n">총 점프</th></tr></thead>
      <tbody id="pastRows"></tbody>
    </table></div>
  </div>
  <div class="foot">Made By ReynRule</div>
</div>
<script>
var D = /*DATA*/null;
var $ = function(id){return document.getElementById(id)};
var nf = function(n){return Number(n).toLocaleString('en-US')};
var kst = function(ms){return new Date(ms+9*3600e3).toISOString()};
var fmt = function(ms){return kst(ms).replace('T',' ').slice(0,16)};
var label = function(k){var hh=Number(k.slice(11,13));return k.slice(0,10)+' '+k.slice(11,13)+':00~'+String((hh+1)%24).padStart(2,'0')+':00'};
var seasonOpen = false;
var openJumps = {};
var lastUpdated = (D && D.updated) || 0;

function render(){
  var J = D.jumps || {total:0,j10:0,j20:0,j30:0,hours:{}};
  var H = D.hours || {};
  var nowKey = kst(Date.now()).slice(0,13);
  var ss = D.season && D.season.start ? new Date(D.season.start+'Z').getTime() : null;
  var se = D.season && D.season.end ? new Date(D.season.end+'Z').getTime() : null;
  $('sub').textContent = (D.player||'') + (ss ? '  ·  시즌 ' + fmt(ss) + ' ~ ' + fmt(se) + ' (KST)' : '');

  var keys = Object.keys(H).sort().slice(-24);
  var gain = keys.reduce(function(s,k){return s+(H[k].gain||0)},0);
  var best = keys.reduce(function(b,k){return (b==null||(H[k].count||0)>(H[b].count||0))?k:b},null);

  var cards = [
    ['Last wave', D.lastWave==null?'-':nf(D.lastWave)],
    ['24h 합계', '+'+nf(gain)+' wave'],
    ['Best hour', best?best.slice(11,13)+':00 ['+nf(H[best].count)+']':'-'],
    ['Updated (KST)', D.updated?kst(D.updated).replace('T',' ').slice(5,19):'-']
  ];
  var cardsEl = $('cards');
  cardsEl.innerHTML = '';
  cards.forEach(function(c){
    var d=document.createElement('div');d.className='card';
    d.innerHTML='<div class="l">'+c[0]+'</div><div class="v">'+c[1]+'</div>';
    cardsEl.appendChild(d);
  });
  var jc=document.createElement('div');jc.className='card click';
  jc.innerHTML='<div class="l">시즌 총 JUMP</div><div class="v">'+nf(J.total)+'</div><div class="hint">클릭해서 10/20/30 상세 보기</div>';
  jc.onclick=function(){
    seasonOpen = !seasonOpen;
    $('seasonPanel').classList.toggle('open', seasonOpen);
  };
  cardsEl.appendChild(jc);

  $('seasonPanel').classList.toggle('open', seasonOpen);
  $('seasonPanel').onclick=function(){
    seasonOpen = false;
    $('seasonPanel').classList.remove('open');
  };

  var tiersEl = $('tiers');
  tiersEl.innerHTML = '';
  [['10점프 (10~12)',J.j10],['20점프 (20~22)',J.j20],['30점프 (30~32)',J.j30]].forEach(function(t){
    var d=document.createElement('div');d.className='tier';
    d.innerHTML='<b>'+nf(t[1]||0)+'</b><span>'+t[0]+'</span>';
    tiersEl.appendChild(d);
  });

  var jk = Object.keys(J.hours||{}).sort().reverse();
  $('seasonRows').innerHTML = jk.length ? jk.map(function(k){
    var h=J.hours[k];
    return '<tr><td>'+label(k)+'</td><td class="n">'+(h.j10||0)+'</td><td class="n">'+(h.j20||0)+'</td><td class="n">'+(h.j30||0)+'</td><td class="n"><b>'+((h.j10||0)+(h.j20||0)+(h.j30||0))+'</b></td></tr>';
  }).join('') : '<tr><td colspan="5" class="jnone">이번 시즌 점프 기록 없음</td></tr>';

  var tb = $('rows');
  tb.innerHTML = '';
  keys.slice().reverse().forEach(function(k){
    var h=H[k]||{count:0,gain:0};
    var jh=(J.hours&&J.hours[k])||{j10:0,j20:0,j30:0};
    var jt=(jh.j10||0)+(jh.j20||0)+(jh.j30||0);
    var tr=document.createElement('tr');
    if(k===nowKey) tr.className='now';
    tr.innerHTML='<td>'+label(k)+(k===nowKey?'<span class="badge">NOW</span>':'')+'</td>'
      +'<td class="n">'+nf(h.count||0)+'</td>'
      +'<td class="n">+'+nf(h.gain||0)+'</td>'
      +'<td class="n">'+(jt?'<span class="jbtn">'+jt+'</span>':'<span class="jnone">-</span>')+'</td>';
    tb.appendChild(tr);
    if(jt){
      var dt=document.createElement('tr');
      dt.className='detail';
      dt.style.display = openJumps[k] ? '' : 'none';
      dt.innerHTML='<td colspan="4">10점프 <b>'+(jh.j10||0)+'</b>회 &nbsp;·&nbsp; 20점프 <b>'+(jh.j20||0)+'</b>회 &nbsp;·&nbsp; 30점프 <b>'+(jh.j30||0)+'</b>회</td>';
      tb.appendChild(dt);
      tr.querySelector('.jbtn').onclick=function(){
        openJumps[k] = !openJumps[k];
        dt.style.display = openJumps[k] ? '' : 'none';
      };
    }
  });

  var P = (D.past||[]).slice().reverse();
  if(P.length){
    $('pastWrap').style.display='';
    $('pastRows').innerHTML = P.map(function(p){
      return '<tr><td>'+fmt(new Date(p.start+'Z').getTime())+' ~ '+fmt(new Date(p.end+'Z').getTime())+'</td><td class="n"><b>'+nf(p.total)+'</b></td></tr>';
    }).join('');
  } else {
    $('pastWrap').style.display='none';
  }
}

function refreshData(){
  fetch('data/state.json?t='+Date.now(), {cache:'no-store'})
    .then(function(r){if(!r.ok) throw new Error(r.status); return r.json();})
    .then(function(json){
      if(!json) return;
      if((json.updated||0) <= lastUpdated) return;
      lastUpdated = json.updated||0;
      D = json;
      render();
    })
    .catch(function(){});
}

render();
setInterval(refreshData, 30000);
</script>
</body>
</html>
`;
function render() {
  const data = JSON.stringify({
    player: PLAYER,
    lastWave: state.lastWave,
    updated: Date.now(),
    season: state.season,
    jumps: state.jumps,
    past: state.past,
    hours: Object.fromEntries(Object.entries(state.hours).sort().slice(-MAX_HOURS)),
  }).replace(/</g, '\\u003c');
  fs.writeFileSync('index.html', HTML_TEMPLATE.replace('/*DATA*/null', () => data));
}
function save() {
  state.updated = Date.now();
  const keys = Object.keys(state.hours).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_HOURS))) delete state.hours[k];
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
  render();
}
function commit() {
  save();
  try {
    execSync('git add index.html data/state.json');
    if (!execSync('git status --porcelain').toString().trim()) return;
    execSync('git commit -m "chore: update rwph [skip ci]"');
    try { execSync('git pull --rebase --autostash', { stdio: 'ignore' }); } catch {}
    execSync('git push', { stdio: 'ignore' });
    console.log('committed', new Date().toISOString());
  } catch (e) { console.error('commit failed', e.message); }
}
async function tick() {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(4000) });
    const json = await res.json();
    const me = json?.result?.list?.find((p) => p.nick === PLAYER) ?? json?.result?.list?.[0];
    if (!me) return;
    const sd = json?.result?.date;
    if (sd?.start && sd?.end && (state.season.start !== sd.start || state.season.end !== sd.end)) {
      if (state.season.start) {
        console.log('season changed', state.season, '->', sd);
        state.past.push({ start: state.season.start, end: state.season.end, total: state.jumps.total });
        state.past = state.past.slice(-30);
      }
      state.season = { start: sd.start, end: sd.end };
      state.jumps = newJumps();
      state.lastWave = null;
    }
    const wave = me.wave;
    const k = hourKey(Date.now());
    if (state.lastWave != null && wave > state.lastWave) {
      const diff = wave - state.lastWave;
      const h = (state.hours[k] ??= { count: 0, gain: 0 });
      h.count += 1;
      h.gain += diff;
      if (diff >= JUMP_MIN) {
        const t = tierOf(diff);
        const jh = (state.jumps.hours[k] ??= { j10: 0, j20: 0, j30: 0 });
        jh['j' + t] += 1;
        state.jumps['j' + t] += 1;
        state.jumps.total += 1;
        console.log(`JUMP +${diff} (${t})`, new Date().toISOString());
      }
    }
    state.hours[k] ??= { count: 0, gain: 0 };
    state.lastWave = wave;
  } catch (e) { /* 네트워크 오류는 무시하고 다음 틱 */ }
}
function dispatchNext(at) {
  try {
    execSync(`gh workflow run rwph.yml --ref ${process.env.GITHUB_REF_NAME || 'main'} -f handoff_at=${at}`, { stdio: 'inherit' });
    console.log('next run dispatched, handoff at', new Date(at).toISOString());
  } catch (e) { console.error('dispatch failed (cron 백업이 복구함)', e.message); }
}
(async () => {
  if (!HANDOFF_AT && Date.now() - (state.updated || 0) < 10 * 60 * 1000) {
    console.log('이미 실행 중인 job이 있어 종료합니다.');
    return;
  }
  let start = Date.now();
  if (HANDOFF_AT) {
    start = HANDOFF_AT;
    await sleep(Math.max(0, HANDOFF_AT - Date.now()));
    for (let i = 0; i < 40; i++) {
      try { execSync('git pull --rebase --autostash', { stdio: 'ignore' }); load(); } catch {}
      if ((state.updated || 0) >= HANDOFF_AT - 2000) break;
      await sleep(1000);
    }
  }
  const end = start + RUN_MS;
  let lastCommit = Date.now(), next = Date.now(), dispatched = false;
  while (Date.now() < end) {
    await tick();
    if (!dispatched && process.env.GITHUB_ACTIONS && Date.now() >= end - 120000) {
      dispatched = true;
      dispatchNext(end);
    }
    if (Date.now() - lastCommit >= COMMIT_EVERY_MS) { commit(); lastCommit = Date.now(); }
    next += 1000;
    await sleep(Math.max(0, next - Date.now()));
  }
  commit();
})();
