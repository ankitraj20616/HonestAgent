/* Saarthi prototype core: state, router, events, shared parts, app frame, prototype panel.
   How to add a screen (see README.md in this folder):
     view('id', {title, area, ms:'M3', chrome:'app'|'bare', needs, base, overlay}, () => html)
   Clicks use attributes, no inline JS:
     data-go="<id>"          open a view
     data-act="name"         run A.name(el) then re-render; data-arg="x" is passed as el.dataset.arg
     data-tog="key"          flip S.ui[key]
     data-set='{"k":1}'      merge JSON into S.ui
     data-model="key"        (inputs) store the value in S.ui[key]; add data-live to re-render on each key */

const S = {view: null, project: 'all', agent: 'claude', theme: 'dark', ui: {}};
const VIEWS = {};
const ORDER = [];
const A = {};
const OVERLAYS = {};

/* The main flow, in order. "Next →" in the prototype bar follows it, then the order screens were added. */
const FLOW = ['setup1', 'setup2', 'homeEmpty', 'newTask', 'work', 'question', 'checks', 'files', 'checkFail', 'fixing', 'check', 'done', 'home'];

const AREAS = ['First run', 'Home', 'New task', 'Task page', 'Files', 'Check and ship', 'Done', 'Side by side', 'Project tools', 'Settings', 'Overlays', 'Errors and states', 'CLI', 'Notes'];

function view(id, meta, render) {
  if (VIEWS[id]) throw new Error('duplicate view ' + id);
  VIEWS[id] = {id, chrome: 'app', ...meta, render};
  ORDER.push(id);
}
function overlay(id, fn) { OVERLAYS[id] = fn; }

/* ---------- helpers ---------- */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])); }
function ui(k, d) { return k in S.ui ? S.ui[k] : d; }
function set(patch) { Object.assign(S.ui, patch); render(); }
function attrs(o = {}) {
  let s = '';
  if (o.go) s += ` data-go="${o.go}"`;
  if (o.act) s += ` data-act="${o.act}"`;
  if (o.arg !== undefined) s += ` data-arg="${esc(o.arg)}"`;
  if (o.tog) s += ` data-tog="${o.tog}"`;
  if (o.set) s += ` data-set='${JSON.stringify(o.set)}'`;
  if (o.title) s += ` title="${esc(o.title)}"`;
  if (o.disabled) s += ' disabled';
  return s;
}
/* go(id, init): open a view; init is the starting S.ui of that view (optional). */
function go(id, init) {
  if (!VIEWS[id]) { console.warn('no view', id); return; }
  if (location.hash.slice(1) === id) { S.ui = init || {}; render(); window.scrollTo(0, 0); return; }
  S.nextUi = init || null;
  location.hash = id;
}
function toast(html, ms = 3200) { set({toast: html}); clearTimeout(toast._t); toast._t = setTimeout(() => set({toast: null}), ms); }
function store(k, v) { try { v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

/* ---------- parts ---------- */
const I = {
  logo: (s = 26) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#E9A23B" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2.5v7.3M12 14.2v7.3M2.5 12h7.3M14.2 12h7.3M5.3 5.3l5.1 5.1M13.6 13.6l5.1 5.1M18.7 5.3l-5.1 5.1M10.4 13.6l-5.1 5.1"/></svg>`,
  down: (s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/></svg>`,
  gear: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  check: (s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
};

function btn(label, o = {}) {
  const cls = ['btn', o.kind || '', o.size || ''].join(' ').trim();
  return `<button class="${cls}"${attrs(o)}>${label}</button>`;
}
function chip(text, tone = 'neutral', o = {}) {
  const lead = o.spin ? '<span class="spin" style="width:10px;height:10px"></span>' : o.dot ? '<span class="dot" style="width:7px;height:7px;background:currentColor"></span>' : '';
  return `<span class="chip ${tone}">${lead}${text}</span>`;
}
function back(label = '← All tasks', to = 'home') { return `<button class="back" data-go="${to}">${label}</button>`; }
function page(body, cls = '') { return `<main class="page ${cls}">${body}</main>`; }
function head(o) {
  return `${o.back === false ? '' : back(o.backLabel, o.backTo)}
  ${o.eyebrow ? `<div class="eyebrow">${o.eyebrow}</div>` : ''}
  <div class="row top wrap" style="margin-bottom:${o.sub ? 6 : 20}px">
    <h1 class="grow" style="margin:0">${o.title}</h1>${o.right || ''}
  </div>
  ${o.sub ? `<p class="lead" style="margin:0 0 22px;font-size:16px">${o.sub}</p>` : ''}`;
}
function okRow(name, right = '', o = {}) {
  const mark = o.bad ? '<span class="badmark">!</span>' : o.wait ? '<span class="okmark" style="background:var(--surface-2);color:var(--faint)">…</span>' : `<span class="okmark">${I.check()}</span>`;
  return `<div class="item">${mark}<span class="grow" style="font-weight:500">${name}</span><span class="faint small">${right}</span></div>`;
}
function toggle(on, o = {}) { return `<span class="toggle ${on ? 'on' : ''}"${attrs(o)}></span>`; }
function seg(items, cur) {
  return `<div class="seg">${items.map(([id, label, o = {}]) => `<button class="${id === cur ? 'on' : ''}"${attrs(o)}>${label}</button>`).join('')}</div>`;
}
function codebox(text, o = {}) {
  const body = o.diff ? esc(text).split('\n').map(l => l.startsWith('+') ? `<span class="add">${l}</span>` : l.startsWith('-') ? `<span class="del">${l}</span>` : l).join('\n') : esc(text);
  return `<div class="codebox"${o.style ? ` style="${o.style}"` : ''}>${body}</div>`;
}
function term(html) { return `<div class="term">${html}</div>`; }
function dialog(body, o = {}) {
  return `<div class="scrim ${o.mid ? 'mid' : ''}" data-act="closeOverlay"><div class="dialog ${o.wide ? 'wide' : ''}" data-stop="1">${body}</div></div>`;
}
function emptyNote(text) { return `<p class="faint small" style="margin:14px 4px 0">${text}</p>`; }

/* Very small syntax colouring for the code view (Python-ish). Input is raw text. */
function hl(line) {
  const re = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(def|class|return|if|else|elif|for|in|import|from|as|None|True|False|raise|with|not|or|and|is|pass|try|except|async|await|lambda)\b|\b(\d+)\b|\b([a-z_][a-zA-Z0-9_]*)(?=\()/g;
  let out = '', last = 0, m;
  while ((m = re.exec(line))) {
    out += esc(line.slice(last, m.index));
    const cls = m[1] ? 'tok-c' : m[2] ? 'tok-s' : m[3] ? 'tok-k' : m[4] ? 'tok-n' : 'tok-f';
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = re.lastIndex;
  }
  return out + esc(line.slice(last));
}

/* Tiny markdown: headings, lists, code fences, tables, bold, inline code. Enough for docs and notes. */
function md(text) {
  const lines = text.split('\n'); let out = '', i = 0;
  const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) { let code = ''; i++; while (i < lines.length && !lines[i].startsWith('```')) code += lines[i++] + '\n'; i++; out += `<pre><code>${esc(code)}</code></pre>`; continue; }
    if (/^#{1,3} /.test(l)) { const n = l.match(/^#+/)[0].length; out += `<h${n} id="h-${esc(l.slice(n + 1).toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${inline(l.slice(n + 1))}</h${n}>`; i++; continue; }
    if (/^\s*[-*] /.test(l)) { out += '<ul>'; while (i < lines.length && /^\s*[-*] /.test(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*[-*] /, ''))}</li>`; out += '</ul>'; continue; }
    if (/^\d+\. /.test(l)) { out += '<ol>'; while (i < lines.length && /^\d+\. /.test(lines[i])) out += `<li>${inline(lines[i++].replace(/^\d+\. /, ''))}</li>`; out += '</ol>'; continue; }
    if (l.startsWith('|')) {
      const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = r => r.split('|').slice(1, -1).map(c => c.trim());
      out += '<table><tr>' + cells(rows[0]).map(c => `<th>${inline(c)}</th>`).join('') + '</tr>' + rows.slice(2).map(r => '<tr>' + cells(r).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</table>';
      continue;
    }
    if (!l.trim()) { i++; continue; }
    let para = ''; while (i < lines.length && lines[i].trim() && !/^(#|```|\s*[-*] |\d+\. |\|)/.test(lines[i])) para += (para ? ' ' : '') + lines[i++];
    out += `<p>${inline(para)}</p>`;
  }
  return `<div class="md">${out}</div>`;
}

/* ---------- task helpers shared by many screens ---------- */
function projectTasks() { return D.tasks.filter(t => S.project === 'all' || t.repo === S.project); }
function needsCount(repo = 'all') { return D.tasks.filter(t => t.g === 'needs' && (repo === 'all' || t.repo === repo)).length; }
function agentShort() { return (D.agents.find(a => a.id === S.agent) || D.agents[0]).short; }

/* ---------- app frame ---------- */
function topBar(v) {
  const needs = v.needs ?? needsCount();
  const menu = ui('menu');
  const projName = S.project === 'all' ? 'All projects' : S.project;
  const tool = (label, to, note) => `<button class="mi" data-go="${to}"><span>${label}</span><small>${note}</small></button>`;
  return `<header class="topbar">
    <button class="brand" data-go="home" aria-label="Home">${I.logo()}<span>Saarthi</span></button>
    <div style="position:relative">
      <button class="picker" data-set='{"menu":${menu === 'proj' ? 'null' : '"proj"'}}' data-keepmenu="1">${esc(projName)} ${I.down(16)}</button>
      ${menu === 'proj' ? `<div class="menu" data-keepmenu="1">
        <div class="mh">Project tools</div>
        ${tool('Board view', 'board', '4 columns')}
        ${tool('Project files', 'projectFiles', 'browse the repo')}
        ${tool('Lessons and notes', 'notes', 'was Memory')}
        ${tool('Saved instructions', 'playbooks', 'was Playbooks')}
        ${tool('Jira tickets', 'tickets', '6 for you')}
        ${tool('Safety and cost', 'safety', '$4.12 today')}
        <div class="divider"></div>
        <div class="mh">Your projects · all open in this window</div>
        ${[['all', 'All projects']].concat(D.projects.map(p => [p.id, p.id])).map(([id, name]) => `<button class="mi ${id === S.project ? 'on' : ''}" data-act="setProject" data-arg="${id}"><span>${esc(name)}</span>${needsCount(id) ? `<small class="accent b">${needsCount(id)} need you</small>` : ''}</button>`).join('')}
        <button class="mi" data-go="setup1"><span class="accent">+ Add a project</span></button>
      </div>` : ''}
    </div>
    <div class="grow"></div>
    <button class="search" data-act="openOverlay" data-arg="commandBar">${I.search}<span class="grow ellipsis" style="text-align:left">Search or jump to…</span><span class="kbd">Ctrl K</span></button>
    ${needs > 0 ? `<button class="needs" data-act="goNeeds"><span class="dot"></span>${needs === 1 ? '1 needs you' : needs + ' need you'}</button>` : '<span class="calm">Nothing needs you</span>'}
    <button class="iconbtn" data-go="settings" aria-label="Settings">${I.gear}</button>
  </header>`;
}

/* ---------- prototype bar (not part of the product) ---------- */
function nextOf(id) {
  const i = FLOW.indexOf(id);
  if (i >= 0 && i < FLOW.length - 1) return FLOW[i + 1];
  const rest = ORDER.filter(x => !FLOW.includes(x));
  const j = rest.indexOf(id);
  if (i === FLOW.length - 1) return rest[0];
  return j >= 0 && j < rest.length - 1 ? rest[j + 1] : null;
}
function protoBar(v) {
  if (new URLSearchParams(location.search).has('noproto')) return '';
  const nxt = nextOf(v.id);
  const open = ui('protoOpen');
  const mode = load('saarthi-proto-mode') || 'area';
  let list = '';
  if (open) {
    const groups = mode === 'flow' ? [['Main flow', FLOW]] :
      mode === 'ms' ? ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'].map(m => [m, ORDER.filter(id => (VIEWS[id].ms || '').split(/[ ,+]/).includes(m))]).filter(g => g[1].length) :
      AREAS.map(a => [a, ORDER.filter(id => VIEWS[id].area === a)]).filter(g => g[1].length);
    list = `<div class="proto-panel" data-keepmenu="1">
      <div class="ph">${[['area', 'By area'], ['flow', 'Main flow'], ['ms', 'By milestone']].map(([m, l]) => `<button class="${m === mode ? 'on' : ''}" data-act="protoMode" data-arg="${m}">${l}</button>`).join('')}
        <button data-act="toggleTheme">${S.theme === 'dark' ? 'Light theme' : 'Dark theme'}</button></div>
      <div class="pl">${groups.map(([g, ids]) => `<div class="pg">${g}</div>` + ids.map(id => `<button class="pv ${id === v.id ? 'on' : ''}" data-go="${id}">${esc(VIEWS[id].title)}<span class="ms">${VIEWS[id].ms || ''}</span></button>`).join('')).join('')}</div>
    </div>`;
  }
  return `${list}<div class="proto" data-keepmenu="1">
    <button data-tog="protoOpen">Screens · ${ORDER.length}</button>
    <span class="cur">${esc(v.title)}</span>
    ${nxt ? `<button class="next" data-go="${nxt}">Next →</button>` : ''}
  </div>`;
}

/* ---------- render ---------- */
function current() { return VIEWS[S.view] || VIEWS[FLOW[0]]; }
function render() {
  const v = current();
  const root = document.getElementById('app');
  const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.model : null;
  const caret = focus ? document.activeElement.selectionStart : null;
  let body;
  try {
    const base = v.base ? VIEWS[v.base] : v;
    body = base.render();
    const ov = ui('overlay') || v.overlay;
    if (ov && OVERLAYS[ov]) body += OVERLAYS[ov]();
  } catch (e) {
    console.error(e);
    body = `<main class="page"><h1>Screen error</h1>${codebox(String(e.stack || e))}</main>`;
    window.__protoErrors = (window.__protoErrors || []).concat(v.id + ': ' + e.message);
  }
  const chrome = (v.base ? VIEWS[v.base].chrome : v.chrome) === 'app';
  root.innerHTML = (chrome ? topBar(v) : '') + (v.banner ? v.banner() : '') + body +
    (ui('toast') ? `<div class="toast">${ui('toast')}</div>` : '') + protoBar(v);
  if (focus) {
    const el = root.querySelector(`[data-model="${focus}"]`);
    if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* not a text input */ } }
  }
  document.title = 'Saarthi · ' + v.title;
}

/* ---------- actions shared by every screen ---------- */
A.setProject = el => { S.project = el.dataset.arg; S.ui.menu = null; if (!['home', 'board', 'projectFiles'].includes(S.view)) go('home'); };
A.goNeeds = () => go({question: 'question', checkFail: 'checkFail', check: 'check', done: 'check'}[S.view] || 'home');
A.openOverlay = el => set({overlay: el.dataset.arg, menu: null});
A.closeOverlay = () => { const v = current(); if (v.overlay) go(v.base); else set({overlay: null}); };
A.toggleTheme = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = S.theme; store('saarthi-theme', S.theme); };
A.protoMode = el => { store('saarthi-proto-mode', el.dataset.arg); };
A.toast = el => toast(esc(el.dataset.arg));
A.setAgent = el => { S.agent = el.dataset.arg; S.ui.menu = null; };

document.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-act],[data-tog],[data-set],[data-stop]');
  if (!e.target.closest('[data-keepmenu]') && (S.ui.menu || S.ui.protoOpen)) { S.ui.menu = null; S.ui.protoOpen = false; if (!t) render(); }
  if (!t) return;
  if (t.dataset.stop && !t.matches('[data-go],[data-act],[data-tog],[data-set]')) return;
  if (t.tagName === 'A' || t.closest('a')) e.preventDefault();
  if (t.dataset.go) { go(t.dataset.go); return; }
  if (t.dataset.tog) S.ui[t.dataset.tog] = !S.ui[t.dataset.tog];
  if (t.dataset.set) Object.assign(S.ui, JSON.parse(t.dataset.set));
  if (t.dataset.act) { const f = A[t.dataset.act]; if (!f) { console.warn('no action', t.dataset.act); return; } if (f(t, e) === false) return; }
  render();
});
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.model;
  if (!k) return;
  S.ui[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if ('live' in e.target.dataset) render();
});
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); set({overlay: 'commandBar'}); return; }
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); set({overlay: 'quickCapture'}); return; }
  if (e.key === 'Escape') { if (ui('overlay') || current().overlay) A.closeOverlay(); else if (S.ui.menu || S.ui.protoOpen) set({menu: null, protoOpen: false}); else if (current().id !== 'home' && current().chrome === 'app') go('home'); render(); return; }
  if (!typing && e.key === '?') { set({overlay: 'shortcuts'}); return; }
  if (!typing && e.key === 'ArrowRight' && e.altKey) { const n = nextOf(current().id); if (n) go(n); }
});
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  S.view = VIEWS[id] ? id : FLOW[0];
  S.ui = S.nextUi || {};
  S.nextUi = null;
  window.scrollTo(0, 0);
  render();
});

/* ?selftest renders every screen, checks every data-go target, and writes PASS or FAIL in the title. */
function selftest() {
  const bad = [];
  for (const id of ORDER) {
    S.view = id; S.ui = {}; window.__protoErrors = [];
    render();
    if (window.__protoErrors.length) bad.push(...window.__protoErrors);
    document.querySelectorAll('[data-go]').forEach(el => { if (!VIEWS[el.dataset.go]) bad.push(`${id}: link to missing view "${el.dataset.go}"`); });
    document.querySelectorAll('[data-act]').forEach(el => { if (!A[el.dataset.act]) bad.push(`${id}: missing action "${el.dataset.act}"`); });
  }
  const missingFlow = FLOW.filter(id => !VIEWS[id]);
  if (missingFlow.length) bad.push('missing flow views: ' + missingFlow.join(', '));
  document.title = bad.length ? 'FAIL ' + bad.length : 'PASS ' + ORDER.length;
  document.getElementById('app').innerHTML = `<main class="page"><h1 id="selftest">${document.title}</h1>${codebox(bad.join('\n') || 'All screens render. All links and actions resolve.')}</main>`;
}

function boot() {
  const q = new URLSearchParams(location.search);
  S.theme = q.get('theme') || load('saarthi-theme') || 'dark';
  document.documentElement.dataset.theme = S.theme;
  if (q.has('selftest')) { selftest(); return; }
  const id = location.hash.slice(1);
  S.view = VIEWS[id] ? id : FLOW[0];
  if (q.get('ui')) { try { S.ui = JSON.parse(q.get('ui')); } catch (e) { /* bad JSON: ignore */ } }  /* ?ui={"tab":"changes"} for screenshots */
  render();
}
