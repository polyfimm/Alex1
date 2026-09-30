'use strict';
// ---------- 데이터 ----------
const KEY = 'feedback-note-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
let db = Object.assign({ items: [], checks: {}, people: [] }, load());
const save = () => { localStorage.setItem(KEY, JSON.stringify(db)); queueFileWrite(); };

// ---------- 기기 저장소 ----------
// 기본: 브라우저 localStorage (PC·휴대폰 공통, persist 요청으로 자동 삭제 방지)
// PC(Chrome/Edge): 선택한 JSON 파일에 자동 저장 (File System Access API)
const canFile = 'showSaveFilePicker' in window;
let fh = null, fileState = 'none', fileName = '', persisted = false, wTimer;
const idb = (mode, fn) => new Promise((res, rej) => {
  const o = indexedDB.open('feedback-note-meta', 1);
  o.onupgradeneeded = () => o.result.createObjectStore('kv');
  o.onerror = () => rej(o.error);
  o.onsuccess = () => { const r = fn(o.result.transaction('kv', mode).objectStore('kv')); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); };
});
async function writeFile() {
  if (!fh || fileState !== 'ok') return;
  try { const w = await fh.createWritable(); await w.write(JSON.stringify(db, null, 1)); await w.close(); }
  catch { fileState = 'need'; if (tab === 'more') render(); }
}
function queueFileWrite() { clearTimeout(wTimer); wTimer = setTimeout(writeFile, 400); }
async function initStorage() {
  try { if (navigator.storage?.persist) persisted = await navigator.storage.persist(); } catch {}
  if (canFile) {
    try {
      fh = await idb('readonly', s => s.get('fh'));
      if (fh) { fileName = fh.name; fileState = (await fh.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'need'; }
    } catch {}
  }
  if (tab === 'more') render();
}
window.linkFile = async () => {
  try {
    if (fh && fileState === 'need') {
      if ((await fh.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
    } else {
      fh = await showSaveFilePicker({ suggestedName: 'feedback-note.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
      await idb('readwrite', s => s.put(fh, 'fh'));
      // 기존 파일에 데이터가 있으면 불러올지 묻는다
      const txt = await (await fh.getFile()).text();
      if (txt.trim()) {
        try { const d = JSON.parse(txt); if (Array.isArray(d.items) && confirm(`선택한 파일에 기록 ${d.items.length}건이 있습니다.\n확인: 파일 내용을 불러오기 / 취소: 현재 데이터로 파일 덮어쓰기`)) db = Object.assign({ items: [], checks: {}, people: [] }, d); } catch {}
      }
    }
    fileName = fh.name; fileState = 'ok'; save(); render();
  } catch (e) { if (e.name !== 'AbortError') alert('파일을 연결하지 못했습니다: ' + e.message); }
};
window.unlinkFile = async () => { fh = null; fileState = 'none'; fileName = ''; try { await idb('readwrite', s => s.delete('fh')); } catch {} render(); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // 로컬 날짜 (UTC 어긋남 방지)
const today = () => ymd(new Date());
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
window.toast = msg => {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1600);
};
function countUp(el) {
  const to = +el.dataset.count, suf = el.dataset.suf || '', dec = +el.dataset.dec || 0;
  el.textContent = to.toFixed(dec) + suf;
  if (reduced()) return;
  const t0 = performance.now();
  (function f(t) { const p = Math.min(1, (t - t0) / 800), e = 1 - Math.pow(1 - p, 3); el.textContent = (to * e).toFixed(dec) + suf; if (p < 1) requestAnimationFrame(f); })(t0);
}

// ---------- 3x3 매트릭스 (시점 × 양·질·효과) ----------
const COLS = ['양 (더 많이)', '질 (더 좋게)', '효과 (더 변하게)'];
const ROWS = ['받기 전', '받는 중', '받은 후'];
const CELLS = [
  // 받기 전
  { t: '창구 늘리기', tip: '피드백 줄 사람·채널을 미리 정하고 요청 시점을 잡는다.',
    items: ['피드백 받을 사람 3명 이상 정하기', '언제 요청할지 날짜 잡기', '내 기분·컨디션 확인하기'] },
  { t: '구체적으로 질문 설계', tip: '목적·상황·시도·결과를 밝히고 "어떻게 다르게 하면 좋을까요?"(개선형)로 묻는다.',
    items: ['목적/상황/시도/결과 정리하기', '개선형 질문으로 바꾸기', '평가 기준을 미리 공유하기'] },
  { t: '받아들일 준비', tip: '구체적 개선안·객관적 기준·대면 전달로 감정적 거부감을 줄인다.',
    items: ['서면보다 대면/통화 요청 고려', '구체적 개선안을 함께 달라고 요청', '방어적일 때 받지 않기(기분 자각)'] },
  // 받는 중
  { t: '끊기지 않게 듣기', tip: '반박하지 않고 끝까지 듣고 더 말할 기회를 준다.',
    items: ['끝까지 듣고 메모하기', '"더 있으신가요?" 한 번 더 묻기', '다른 사람에게도 같은 질문하기'] },
  { t: '되묻기', tip: '"언제, 어디서, 어떻게" 할지까지 구체화되도록 질문한다.',
    items: ['구체적 예시 요청하기', '"언제/어떻게 해보면 될까요?" 묻기', '추론한 의도를 확인하기(멘탈 모델)'] },
  { t: '본능 멈추고 성찰', tip: '방어 반응을 멈추고 의도를 파악한 뒤 수용/거부를 구분한다.',
    items: ['즉답하지 않고 잠시 멈추기', '상대의 의도 파악하기', '수용할 것 / 거부할 것 나누기'] },
  // 받은 후
  { t: '감사·후속 요청', tip: '감사 인사로 다음 피드백 기회를 열어둔다.',
    items: ['24시간 안에 감사 인사', '앞으로도 부탁드린다고 전하기', '피드백 기록 남기기'] },
  { t: '정리·해석', tip: '피드백이 나온 멘탈 모델(행동·결과·성과 수준)을 이해한다.',
    items: ['피드백을 행동/결과/성과 수준으로 분류', '상대가 왜 그렇게 말했는지 추론', '여러 피드백의 공통점 찾기'] },
  { t: '실행하고 결과 공유', tip: '계획을 세워 해보고 시도 과정과 결과를 제공자에게 알린다.',
    items: ['언제·어디서·어떻게 계획 세우기', '실제로 시도해보기', '결과와 배운 점을 제공자에게 공유'] },
];

const TYPES = ['개선(Improve)', '비평(Critique)', '아이디어(Brainstorm)', '정보 공유(Share)'];
const ORIGIN = ['내가 요청함', '원치 않았는데 받음', '예상 밖'];

// ---------- 화면 ----------
let tab = 'matrix';
const TABS = ['matrix', 'ask', 'log', 'stats', 'more'];
let prevIdx = 0;
const views = { matrix, ask, log, stats, more };
function render(still) {
  const idx = TABS.indexOf(tab), v = $('#view');
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#tabs').style.setProperty('--idx', idx);
  v.className = still === true ? 'still' : '';
  v.style.setProperty('--dx', Math.sign(idx - prevIdx) * 28 + 'px');
  prevIdx = idx;
  v.innerHTML = views[tab]();
  [...v.children].forEach((c, i) => c.style.setProperty('--i', i));
  v.querySelectorAll('.cell').forEach((c, i) => c.style.setProperty('--i', i + 2));
  v.querySelectorAll('.item').forEach((c, i) => c.style.setProperty('--i', i));
  v.querySelectorAll('[data-count]').forEach(countUp);
  if (still !== true) window.scrollTo(0, 0);
}
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.tab) { tab = b.dataset.tab; render(); } };
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

const R = 15.915; // 원 둘레 = 100
const ring = (pct, label) => `<svg class="ring" viewBox="0 0 40 40"><circle class="bg" cx="20" cy="20" r="${R}"/><circle class="fg" cx="20" cy="20" r="${R}" style="stroke-dasharray:${pct} 100"/><text x="20" y="23" data-count="${pct}" data-suf="%">${pct}%</text></svg>`;
function matrix() {
  const done = Object.values(db.checks).filter(Boolean).length;
  const rowDone = r => [0, 1, 2].reduce((s, c) => s + CELLS[r * 3 + c].items.filter((_, k) => db.checks[(r * 3 + c) + '-' + k]).length, 0);
  let h = `<div class="card hero">${ring(Math.round(done / 27 * 100))}<div class="rows"><b>${done}/27 완료</b>` +
    ROWS.map((n, r) => `<div class="r"><span>${n}</span><div class="pips" style="flex:1;margin:0">${Array.from({ length: 9 }, (_, k) => `<i class="${k < rowDone(r) ? 'on' : ''}" style="animation-delay:${k * 40}ms"></i>`).join('')}</div></div>`).join('') +
    `</div></div><p class="muted">피드백의 <b>양·질·효과</b>를 <b>받기 전/중/후</b> 각각에서 높이는 9칸 전략입니다. 칸을 눌러 체크하세요.</p><div class="grid">`;
  h += COLS.map(c => `<div class="h">${c}</div>`).join('');
  CELLS.forEach((c, i) => {
    if (i % 3 === 0) h += `<div class="rowh">▼ ${ROWS[i / 3]}</div>`;
    const n = c.items.filter((_, k) => db.checks[i + '-' + k]).length;
    h += `<button class="cell ${n === 3 ? 'done' : ''}" onclick="openCell(${i})"><b>${c.t}</b>${esc(c.tip)}<div class="pips">${[0, 1, 2].map(k => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}<em>${n === 3 ? '✓' : n + '/3'}</em></div></button>`;
  });
  return h + '</div>';
}
window.setCheck = (k, v) => { db.checks[k] = v; save(); };
window.openCell = i => {
  const c = CELLS[i];
  modal(`<div class="card"><h2 style="margin-top:0">${ROWS[Math.floor(i / 3)]} · ${COLS[i % 3]}</h2><b>${c.t}</b><p class="muted">${esc(c.tip)}</p>` +
    c.items.map((t, k) => `<label class="check"><input type="checkbox" ${db.checks[i + '-' + k] ? 'checked' : ''} onchange="setCheck('${i}-${k}',this.checked)">${esc(t)}</label>`).join('') +
    `<div class="row"><button class="btn" onclick="closeModal();render(true)">닫기</button></div></div>`);
};

function ask() {
  return `<div class="card"><h2 style="margin-top:0">개선형 피드백 요청 만들기</h2>
  <p class="muted">구체적이고 개선을 묻는 질문일수록 피드백의 양·질·효과가 모두 좋아집니다.</p>
  <label>목적 (무엇을 이루려는가)</label><input id="a1" oninput="mkAsk()">
  <label>상황 (어떤 상황에서)</label><input id="a2" oninput="mkAsk()">
  <label>시도한 것</label><input id="a3" oninput="mkAsk()">
  <label>결과</label><input id="a4" oninput="mkAsk()">
  <label>받는 사람 (선택)</label><input id="a5" oninput="mkAsk()" placeholder="예: 팀장님">
  <h2>완성된 요청문</h2><pre id="askOut">위 항목을 채워보세요.</pre>
  <div class="row"><button class="btn" onclick="copy($('#askOut').textContent)">복사</button></div></div>
  <div class="card"><b>참고</b><p class="muted">가능하면 서면보다 대면·통화로 요청하고, 여러 사람에게 같은 질문을 해보세요.</p></div>`;
}
window.mkAsk = () => {
  const v = i => $('#a' + i).value.trim();
  if (!v(1) && !v(2) && !v(3) && !v(4)) return $('#askOut').textContent = '위 항목을 채워보세요.';
  const who = v(5) ? v(5) + ', ' : '';
  $('#askOut').textContent = `${who}안녕하세요.\n저는 ${v(1) || '(목적)'}을(를) 위해, ${v(2) || '(상황)'}에서 ${v(3) || '(시도)'}을(를) 해봤고 결과는 ${v(4) || '(결과)'}였습니다.\n제 목적을 달성하려면 어떻게 다르게 해보면 좋을까요? 언제, 어떤 방식으로 해보면 좋을지도 알려주시면 큰 도움이 됩니다.`;
};

const STATUS = { new: '받음', planned: '계획함', tried: '시도함', shared: '공유함' };
// ---------- 캘린더 ----------
let cal = new Date(); cal.setDate(1);
let calSel = null, calDir = 0;
const toneKey = t => (t === 'pos' || t === 'neg') ? t : 'neu';
const TONE_KO = { pos: '긍정', neu: '중립', neg: '부정' };
function calendar() {
  const y = cal.getFullYear(), m = cal.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const by = {}, due = {};
  db.items.forEach(it => {
    (by[it.date] = by[it.date] || []).push(it);
    const d = it.plan && it.plan.due; if (d && it.status !== 'shared') due[d] = true;
  });
  let cells = '일월화수목금토'.split('').map(w => `<div class="w">${w}</div>`).join('');
  for (let i = 0; i < first; i++) cells += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const s = `${y}-${pad(m + 1)}-${pad(d)}`, list = by[s] || [], dow = (first + d - 1) % 7;
    cells += `<button class="d ${dow === 0 ? 'sun' : ''} ${s === today() ? 'today' : ''} ${s === calSel ? 'sel' : ''} ${due[s] ? 'due' : ''}" onclick="pickDay('${s}')" aria-label="${m + 1}월 ${d}일 ${list.length}건">${d}<span class="dots">${list.slice(0, 3).map(it => `<i class="${toneKey(it.tone)}"></i>`).join('')}</span></button>`;
  }
  return `<div class="card"><div class="cal-head"><b>${y}년 ${m + 1}월</b><div class="nv"><button onclick="moveMonth(-1)" aria-label="이전 달">‹</button><button onclick="goToday()">오늘</button><button onclick="moveMonth(1)" aria-label="다음 달">›</button></div></div>
    <div class="cal" style="--cd:${calDir * 30}px">${cells}</div>
    <div class="legend"><span><i class="pos"></i>긍정</span><span><i class="neu"></i>중립</span><span><i class="neg"></i>부정</span><span><i class="du"></i>실행 예정일</span></div></div>`;
}
window.moveMonth = n => { cal = new Date(cal.getFullYear(), cal.getMonth() + n, 1); calDir = n; render(true); };
window.goToday = () => { const n = new Date(); calDir = (n > cal) ? 1 : -1; cal = new Date(n.getFullYear(), n.getMonth(), 1); calSel = today(); render(true); };
window.pickDay = s => { calSel = calSel === s ? null : s; calDir = 0; render(true); };

function log() {
  const all = [...db.items].sort((a, b) => b.date.localeCompare(a.date));
  const items = calSel ? all.filter(it => it.date === calSel) : all;
  const head = calSel
    ? `<div class="row" style="margin:0 0 10px;align-items:center"><b>${parseD(calSel).getMonth() + 1}월 ${parseD(calSel).getDate()}일 · ${items.length}건</b><button class="ghost btn" onclick="pickDay('${calSel}')">전체 보기</button></div>`
    : '';
  return calendar() + `<div class="row" style="margin:0 0 12px"><button class="btn" onclick="editItem(null,${calSel ? `'${calSel}'` : 'null'})">+ ${calSel ? '이 날짜에 ' : ''}피드백 기록</button></div>` + head +
    (items.length ? items.map(it => `<div class="card item" onclick="editItem('${it.id}')">
      <div class="chips"><span class="chip ${it.tone === 'neg' ? 'neg' : ''}">${TONE_KO[toneKey(it.tone)]}</span><span class="chip">${esc(it.type)}</span><span class="chip">${STATUS[it.status]}</span>${it.plan && it.plan.due ? `<span class="chip">📅 ${it.plan.due}</span>` : ''}</div>
      <p style="margin:8px 0 4px">${esc(it.content).slice(0, 120)}</p><div class="muted">${esc(it.source || '출처 없음')} · ${it.date}</div></div>`).join('')
      : `<p class="muted">${calSel ? '이 날짜의 기록이 없습니다.' : '아직 기록이 없습니다. 받은 피드백을 남겨보세요.'}</p>`);
}
window.editItem = (id, date) => {
  const it = db.items.find(x => x.id === id) || { id: uid(), date: date || today(), tone: 'neu', type: TYPES[0], origin: ORIGIN[0], mood: 3, status: 'new', plan: {} };
  const MOODS = ['😣', '😕', '😐', '🙂', '😄'];
  const opt = (arr, v) => arr.map(a => `<option ${a === v ? 'selected' : ''}>${a}</option>`).join('');
  const f = (n, l, ta) => `<label>${l}</label>${ta ? `<textarea id="f_${n}">${esc(it[n])}</textarea>` : `<input id="f_${n}" value="${esc(it[n])}">`}`;
  modal(`<div class="card"><h2 style="margin-top:0">피드백 기록</h2>
    <label>받은 날짜</label><input id="f_date" type="date" value="${it.date}">
    ${f('source', '누구에게서?')}${f('content', '받은 피드백 내용', 1)}
    <label>받은 방식</label><select id="f_origin">${opt(ORIGIN, it.origin)}</select>
    <label>질문 유형</label><select id="f_type">${opt(TYPES, it.type)}</select>
    <label>성격</label><select id="f_tone"><option value="pos" ${it.tone === 'pos' ? 'selected' : ''}>긍정</option><option value="neu" ${it.tone === 'neu' ? 'selected' : ''}>중립</option><option value="neg" ${it.tone === 'neg' ? 'selected' : ''}>부정</option></select>
    <label>받을 때 내 기분 (1 나쁨 ~ 5 좋음)</label><div class="mood"><input id="f_mood" type="range" min="1" max="5" value="${it.mood}" oninput="document.getElementById('moodEmo').textContent=${JSON.stringify(MOODS).replace(/"/g, "'")}[this.value-1]"><span id="moodEmo">${MOODS[it.mood - 1]}</span></div>
    <div class="card" style="margin-top:12px"><b>멈추고 성찰하기</b><p class="muted">특히 부정적 피드백일 때, 반응하기 전에 아래를 적어보세요.</p>
    ${f('inferred', '① 상대는 왜 이렇게 말했을까? (내 추론)', 1)}${f('confirmed', '② 상대에게 확인한 의도', 1)}${f('accept', '③ 수용할 것 / 거부할 것', 1)}</div>
    <label>행동 계획 — 언제 / 어디서 / 어떻게</label>
    <input id="f_when" placeholder="언제" value="${esc(it.plan.when)}" style="margin-bottom:6px"><input id="f_where" placeholder="어디서" value="${esc(it.plan.where)}" style="margin-bottom:6px"><input id="f_how" placeholder="어떻게" value="${esc(it.plan.how)}">
    <label>실행 예정일 (캘린더에 표시)</label><input id="f_due" type="date" value="${esc(it.plan.due)}">
    <label>진행 상태</label><select id="f_status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === it.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
    ${f('result', '시도 결과 · 배운 점', 1)}
    <div class="row"><button class="btn" onclick="saveItem('${it.id}')">저장</button>
    <button class="ghost btn" onclick="thanks()">감사·결과 공유 문구</button>
    <button class="ghost btn" onclick="closeModal()">취소</button>
    ${db.items.some(x => x.id === it.id) ? `<button class="danger btn" onclick="delItem('${it.id}')">삭제</button>` : ''}</div>
    <pre id="thx" hidden></pre></div>`);
};
window.saveItem = id => {
  const g = n => $('#f_' + n).value.trim();
  const it = { id, date: g('date') || today(), source: g('source'), content: g('content'), origin: g('origin'), type: g('type'), tone: g('tone'), mood: +g('mood'),
    inferred: g('inferred'), confirmed: g('confirmed'), accept: g('accept'), status: g('status'), result: g('result'),
    plan: { when: g('when'), where: g('where'), how: g('how'), due: g('due') }, updated: Date.now() };
  if (!it.content) return alert('피드백 내용을 입력하세요.');
  const i = db.items.findIndex(x => x.id === id);
  i < 0 ? db.items.push(it) : db.items[i] = it;
  save(); closeModal(); cal = new Date(parseD(it.date).getFullYear(), parseD(it.date).getMonth(), 1); calDir = 0; render(true); toast('저장했습니다');
};
window.delItem = id => { if (confirm('삭제할까요?')) { db.items = db.items.filter(x => x.id !== id); save(); closeModal(); render(true); toast('삭제했습니다'); } };
window.thanks = () => {
  const g = n => $('#f_' + n).value.trim();
  const p = [g('when'), g('where'), g('how')].filter(Boolean).join(' / ');
  const t = g('result')
    ? `${g('source') || ''} 안녕하세요.\n말씀해주신 피드백대로 해봤습니다. ${p ? `(${p})\n` : ''}결과: ${g('result')}\n덕분에 많이 배웠습니다. 감사합니다!`
    : `${g('source') || ''} 안녕하세요.\n귀한 피드백 감사합니다. ${p ? `피드백을 토대로 ${p}로 실행해보겠습니다.` : '실행해보고 결과를 공유드리겠습니다.'}`;
  const el = $('#thx'); el.hidden = false; el.textContent = t; copy(t);
};

// ---------- 통계 (SVG 직접 그림, 외부 라이브러리 없음) ----------
const monday = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
const hbars = rows => rows.map(([l, n, w], i) => `<div class="hb"><span>${esc(l)}</span><div class="tr"><i style="--w:${w}%;--i:${i}"></i></div><b>${n}</b></div>`).join('');

function weeklyChart(items) {
  const start = monday(new Date()); start.setDate(start.getDate() - 49);
  const wk = Array.from({ length: 8 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i * 7); return { d, pos: 0, neu: 0, neg: 0 }; });
  items.forEach(it => { const i = Math.floor((monday(parseD(it.date)) - start) / 6048e5); if (i >= 0 && i < 8) wk[i][toneKey(it.tone)]++; });
  const W = 320, H = 150, L = 20, B = 22, T = 16, cw = (W - L - 4) / 8, bw = cw * .58;
  const max = Math.max(3, ...wk.map(w => w.pos + w.neu + w.neg)), sy = v => (H - B - T) * v / max;
  let s = `<line class="grid-l" x1="${L}" x2="${W}" y1="${H - B}" y2="${H - B}"/><line class="grid-l" x1="${L}" x2="${W}" y1="${T}" y2="${T}"/><text x="${L - 4}" y="${T + 3}" text-anchor="end">${max}</text><text x="${L - 4}" y="${H - B + 3}" text-anchor="end">0</text>`;
  wk.forEach((w, i) => {
    const x = L + i * cw + (cw - bw) / 2; let y = H - B;
    ['pos', 'neu', 'neg'].forEach(k => { if (w[k]) { const h = sy(w[k]); y -= h; s += `<rect class="bar ${k}" style="--i:${i}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="2"><title>${w.d.getMonth() + 1}/${w.d.getDate()}주 ${TONE_KO[k]} ${w[k]}건</title></rect>`; } });
    const tot = w.pos + w.neu + w.neg;
    if (tot) s += `<text x="${x + bw / 2}" y="${y - 3}" text-anchor="middle" style="fill:var(--ink)">${tot}</text>`;
    s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${w.d.getMonth() + 1}/${w.d.getDate()}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="주간 피드백 건수">${s}</svg>`;
}
function moodChart(items) {
  const pts = [...items].sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  if (pts.length < 2) return '<p class="muted">기록이 2건 이상이면 기분 변화 선이 나타납니다.</p>';
  const W = 320, H = 130, L = 20, T = 10, B = 22, sx = i => L + 8 + i * (W - L - 16) / (pts.length - 1), sy = v => T + (5 - v) * (H - T - B) / 4;
  let g = ''; for (let v = 1; v <= 5; v++) g += `<line class="grid-l" x1="${L}" x2="${W}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${L - 4}" y="${sy(v) + 3}" text-anchor="end">${v}</text>`;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(i)} ${sy(p.mood || 3)}`).join(' ');
  const lab = pts.map((p, i) => (i % Math.ceil(pts.length / 6) === 0) ? `<text x="${sx(i)}" y="${H - 8}" text-anchor="middle">${+p.date.slice(5, 7)}/${+p.date.slice(8)}</text>` : '').join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="기분 변화">${g}<path class="area" d="${d} L${sx(pts.length - 1)} ${sy(1)} L${sx(0)} ${sy(1)}Z"/><path class="line" pathLength="1" d="${d}"/>${pts.map((p, i) => `<circle class="dot" style="--i:${i}" cx="${sx(i)}" cy="${sy(p.mood || 3)}" r="3"><title>${p.date} 기분 ${p.mood}</title></circle>`).join('')}${lab}</svg>`;
}
function donut(items) {
  const c = { pos: 0, neu: 0, neg: 0 }; items.forEach(it => c[toneKey(it.tone)]++);
  const n = items.length; let off = 0;
  const seg = ['pos', 'neu', 'neg'].map((k, i) => { const len = c[k] / n * 100, s = len ? `<circle class="seg" style="--i:${i};stroke:var(--${k === 'pos' ? 'main' : k === 'neg' ? 'warn' : 'neu'});stroke-dasharray:${len} ${100 - len};stroke-dashoffset:${-off}" cx="20" cy="20" r="${R}"><title>${TONE_KO[k]} ${c[k]}건</title></circle>` : ''; off += len; return s; }).join('');
  const col = { pos: 'main', neu: 'neu', neg: 'warn' };
  return `<div class="donut"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="${R}" style="stroke:var(--line)"/>${seg}<text x="20" y="22.5" data-count="${n}">${n}</text></svg><ul>${['pos', 'neu', 'neg'].map(k => `<li><i style="background:var(--${col[k]})"></i>${TONE_KO[k]} <b>${c[k]}</b>건 <span class="muted">(${Math.round(c[k] / n * 100)}%)</span></li>`).join('')}</ul></div>`;
}
function stats() {
  const it = db.items, n = it.length, done = Object.values(db.checks).filter(Boolean).length;
  const mk = today().slice(0, 7), thisMonth = it.filter(x => x.date.startsWith(mk)).length;
  if (!n) return `<div class="card"><h2 style="margin-top:0">통계</h2><p class="muted">아직 기록이 없습니다. 기록 탭에서 받은 피드백을 남기면 여기에 차트가 나타납니다.</p><div class="row"><button class="btn" onclick="tab='log';render()">기록하러 가기</button></div></div>`;
  const acted = it.filter(x => x.status === 'tried' || x.status === 'shared').length;
  const avg = it.reduce((s, x) => s + (x.mood || 3), 0) / n;
  const tile = (v, l, suf = '', dec = 0) => `<div class="tile"><b data-count="${v}" data-suf="${suf}" data-dec="${dec}">${v.toFixed(dec)}${suf}</b><span>${l}</span></div>`;
  const order = ['new', 'planned', 'tried', 'shared'], reach = s => it.filter(x => order.indexOf(x.status) >= order.indexOf(s)).length;
  const neg = it.filter(x => x.tone === 'neg'), negActed = neg.filter(x => x.status === 'tried' || x.status === 'shared').length;
  const cnt = (arr, key) => arr.map(a => [a, it.filter(x => x[key] === a).length]);
  const bars = rows => { const m = Math.max(1, ...rows.map(r => r[1])); return hbars(rows.map(([l, c]) => [l, c, c / m * 100])); };
  return `<div class="tiles">${tile(n, '전체 기록')}${tile(thisMonth, '이번 달')}${tile(Math.round(acted / n * 100), '실행률', '%')}${tile(avg, '평균 기분', '', 1)}</div>
  ${neg.length ? `<div class="note">💡 부정 피드백 ${neg.length}건 중 <b>${negActed}건</b>을 실제로 시도했어요${negActed === neg.length ? ' — 대단해요!' : '. 남은 건은 계획부터 세워볼까요?'}</div>` : ''}
  <div class="card"><h2 style="margin-top:0">주간 피드백 (최근 8주)</h2>${weeklyChart(it)}<div class="legend"><span><i class="pos"></i>긍정</span><span><i class="neu"></i>중립</span><span><i class="neg"></i>부정</span></div></div>
  <div class="card"><h2 style="margin-top:0">받을 때 내 기분</h2>${moodChart(it)}</div>
  <div class="card"><h2 style="margin-top:0">긍정 · 부정 비율</h2>${donut(it)}</div>
  <div class="card"><h2 style="margin-top:0">실행 단계 (받음 → 공유)</h2>${hbars([['받음', reach('new')], ['계획함', reach('planned')], ['시도함', reach('tried')], ['공유함', reach('shared')]].map(([l, c]) => [l, c, c / n * 100]))}</div>
  <div class="card"><h2 style="margin-top:0">질문 유형</h2>${bars(cnt(TYPES, 'type'))}<h2>받은 방식</h2>${bars(cnt(ORIGIN, 'origin'))}</div>
  <div class="card"><div class="hero">${ring(Math.round(done / 27 * 100))}<div><b>매트릭스 진행도</b><p class="muted" style="margin:4px 0 0">27개 중 ${done}개 체크</p></div></div></div>`;
}

function more() {
  return `<div class="card"><h2 style="margin-top:0">참고 개념</h2>
  <p class="muted"><b>3x3 매트릭스</b>: 양·질·효과 × 전·중·후. <b>개선형 질문</b>이 가장 효과적. <b>부정 피드백</b>은 방어기제를 일으키므로 구체적 개선안·객관적 수치·대면 전달이 도움. <b>멘탈 모델</b>: 상대 조언의 이유를 스스로 추론한 뒤 확인. <b>후속 공유</b>: 시도 결과를 알리면 관계와 효능감이 좋아짐.</p></div>
  <div class="card"><h2 style="margin-top:0">저장 위치</h2>
  <p class="muted"><b>이 기기 저장(기본)</b>: 기록은 이 기기의 브라우저 저장소에 자동 저장됩니다${persisted ? ' (삭제 방지 허용됨)' : ''}. PC와 휴대폰은 서로 독립적입니다. 브라우저 사이트 데이터를 지우면 함께 사라지니 가끔 내보내기로 백업하세요.</p>
  ${canFile ? `<p class="muted"><b>PC 파일 자동 저장</b>: ${fileState === 'ok' ? `연결됨 — <b>${esc(fileName)}</b> (변경할 때마다 자동 기록)` : fileState === 'need' ? `<b>${esc(fileName)}</b> 재연결 필요 (브라우저 재시작 후 권한 확인)` : '내 PC의 원하는 폴더에 JSON 파일로 저장합니다.'}</p>
  <div class="row"><button class="btn" onclick="linkFile()">${fileState === 'ok' ? '다른 파일로 변경' : fileState === 'need' ? '다시 연결' : '저장 파일 지정'}</button>${fileState !== 'none' ? '<button class="ghost btn" onclick="unlinkFile()">연결 해제</button>' : ''}</div>`
  : '<p class="muted">이 브라우저는 파일 자동 저장을 지원하지 않습니다(PC Chrome/Edge에서 가능). 내보내기를 사용하세요.</p>'}
  </div>
  <div class="card"><h2 style="margin-top:0">백업 · 이동</h2><p class="muted">휴대폰에서는 내보내기를 누르면 공유 창이 열려 파일 앱·메신저·클라우드로 보낼 수 있습니다.</p>
  <div class="row"><button class="btn" onclick="exp()">내보내기(JSON)</button><label class="btn ghost" style="margin:0;display:inline-block;cursor:pointer">가져오기<input type="file" accept=".json" hidden onchange="imp(this.files[0])"></label></div></div>`;
}
window.exp = async () => {
  const name = 'feedback-note-' + today() + '.json';
  const file = new File([JSON.stringify(db, null, 1)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '피드백 노트 백업' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; a.click();
};
let pending = null;
window.imp = f => f && f.text().then(t => {
  try {
    const d = JSON.parse(t); if (!Array.isArray(d.items)) throw 0;
    pending = d;
    const ids = new Set(db.items.map(x => x.id)), added = d.items.filter(x => !ids.has(x.id)).length;
    modal(`<div class="card"><h2 style="margin-top:0">가져오기</h2>
      <p>파일에 기록 <b>${d.items.length}건</b>이 있습니다. 이 기기에는 <b>${db.items.length}건</b>이 있고, 그중 새로 추가될 기록은 <b>${added}건</b>입니다.</p>
      <p class="muted"><b>병합</b>: 양쪽 기록을 모두 남깁니다. 같은 기록은 더 최근에 수정한 쪽을 씁니다. 체크한 매트릭스 항목도 합칩니다.<br><b>덮어쓰기</b>: 이 기기의 데이터를 파일 내용으로 바꿉니다.</p>
      <div class="row"><button class="btn" onclick="doImport('merge')">병합</button><button class="danger btn" onclick="doImport('replace')">덮어쓰기</button><button class="ghost btn" onclick="closeModal()">취소</button></div></div>`);
  } catch { alert('올바른 파일이 아닙니다.'); }
});
window.doImport = mode => {
  const d = pending; pending = null; if (!d) return;
  if (mode === 'replace') db = Object.assign({ items: [], checks: {}, people: [] }, d);
  else {
    const map = new Map(db.items.map(x => [x.id, x]));
    d.items.forEach(x => { const o = map.get(x.id); if (!o || (x.updated || 0) > (o.updated || 0)) map.set(x.id, x); });
    db.items = [...map.values()];
    Object.entries(d.checks || {}).forEach(([k, v]) => { if (v) db.checks[k] = true; });
  }
  save(); closeModal(); render(true); toast(mode === 'merge' ? '병합했습니다' : '덮어썼습니다');
};

// ---------- 공통 ----------
function modal(h) { const m = $('#modal'); m.innerHTML = h; m.hidden = false; }
window.closeModal = () => { $('#modal').hidden = true; };
window.copy = t => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('복사했습니다'), () => toast('복사하지 못했습니다'));
window.render = render;

render();
initStorage();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js');
