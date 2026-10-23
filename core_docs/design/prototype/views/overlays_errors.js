/* Overlays (command bar, new task, shortcut sheet) and error and loading states. */

/* ---------- helpers for this file ---------- */
/* Close the overlay (or leave the overlay view) and show a toast on the screen below. */
function oeCloseToast(msg) {
  const v = current();
  if (v.overlay) { go(v.base, {toast: msg}); setTimeout(() => { if (S.ui.toast === msg) set({toast: null}); }, 3200); return false; }
  S.ui.overlay = null; toast(msg); return false;
}
/* A plain list of rows inside a dialog, styled like the top-bar menu. */
const oeList = rows => `<div class="menu" style="position:static;width:auto;box-shadow:none;border:none;background:none;padding:0">${rows}</div>`;
const oeKeys = s => s.split(' ').map(k => `<span class="kbd">${k}</span>`).join(' ');

/* ---------- Command bar (Ctrl K) ---------- */
const OE_CMD = [
  ['Tasks', 'T-0012 · Add password reset API', 'acme-billing · Claude has a question', {go: 'question'}, ''],
  ['Tasks', 'T-0009 · Rate-limit the login endpoint', 'acme-billing · ready for your review', {go: 'check'}, ''],
  ['Projects', 'acme-billing', '2 need you · 2 working', {act: 'oeProject', arg: 'acme-billing'}, ''],
  ['Projects', 'saarthi', '2 need you', {act: 'oeProject', arg: 'saarthi'}, ''],
  ['Projects', 'clinic-portal', '1 working', {act: 'oeProject', arg: 'clinic-portal'}, ''],
  ['Files', 'app/auth/reset.py', 'Add password reset API · new', {act: 'openInFiles', arg: 'app/auth/reset.py'}, ''],
  ['Actions', 'New task', '', {act: 'openOverlay', arg: 'quickCapture'}, 'Ctrl Alt N'],
  ['Actions', 'Start run', 'T-0033', {go: 'todoTask'}, 'R'],
  ['Actions', 'Open in my editor', 'T-0012', {act: 'toast', arg: 'Opened in your editor: code ~/.local/share/saarthi/worktrees/acme-billing/T-0012'}, 'E'],
  ['Actions', 'Go to Board', '', {go: 'board'}, 'G B'],
  ['Actions', 'Settings', '', {go: 'settings'}, 'Ctrl ,'],
  ['Actions', 'Toggle theme', '', {act: 'toggleTheme'}, 'Ctrl Shift L'],
];
A.oeProject = el => { S.project = el.dataset.arg; S.ui.overlay = null; if (current().overlay || S.view !== 'home') { go('home'); return false; } };
overlay('commandBar', () => {
  const q = (ui('cq') || '').toLowerCase().trim();
  const hits = OE_CMD.filter(r => !q || (r[1] + ' ' + r[2] + ' ' + r[0]).toLowerCase().includes(q));
  let first = true;
  const groups = [...new Set(hits.map(r => r[0]))].map(g => `<div class="mh">${g}</div><div style="${g === 'Actions' ? 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0 4px' : ''}">` + hits.filter(r => r[0] === g).map(([, label, note, o, keys]) => {
    const on = first; first = false;
    const lead = g === 'Tasks' ? `<span class="sdot ${label.startsWith('T-0012') ? 'ask' : 'review'}"></span>` : g === 'Files' ? '<span class="none" style="width:9px;height:11px;margin:0 2px;border:1.5px solid var(--faint);border-radius:2px"></span>' : g === 'Projects' ? '<span class="dot" style="background:var(--faint)"></span>' : '<span class="faint" style="width:12px;text-align:center">›</span>';
    return `<button class="mi ${on ? 'on' : ''}"${attrs(o)}><span class="row tight grow" style="min-width:0">${lead}<span class="ellipsis ${g === 'Files' ? 'mono' : ''}" style="${g === 'Files' ? 'font-size:14px' : ''}">${esc(label)}</span>${note ? `<small class="ellipsis">${esc(note)}</small>` : ''}</span>${keys ? `<span class="none">${oeKeys(keys)}</span>` : ''}</button>`;
  }).join('') + '</div>').join('');
  return dialog(`<div class="row" style="height:50px;padding:0 6px 0 16px;border-radius:999px;border:1.5px solid var(--accent);background:var(--bg)">
      <span class="faint">${I.search}</span><input data-model="cq" data-live value="${esc(ui('cq', ''))}" placeholder="Search tasks, projects, files, or type a command" style="flex:1;min-width:0;border:none;background:transparent;outline:none;font-size:16px"><span class="kbd" style="margin-right:8px">Esc</span></div>
    <div style="max-height:58vh;overflow:auto;margin:10px -8px 0">${hits.length ? oeList(groups) : emptyNote(`Nothing matches "${esc(q)}". Press Enter to make a new task with this title.`)}</div>
    <div class="row wrap faint small" style="border-top:1px solid var(--border);margin:8px -24px -8px;padding:12px 24px 0;gap:16px">
      <span>${oeKeys('↑ ↓')} move</span><span>${oeKeys('Enter')} open</span><span>${oeKeys('Esc')} close</span><span class="grow"></span><span>Type a task id like <code>T-0012</code> to jump to it</span></div>`, {wide: true});
});
view('commandBar', {title: 'Command bar (Ctrl K)', area: 'Overlays', ms: 'M3', base: 'home', overlay: 'commandBar'}, () => '');

/* ---------- New task, from any app (Ctrl Alt N) ---------- */
overlay('quickCapture', () => dialog(`
  <div class="row" style="margin-bottom:16px"><h2 class="grow" style="margin:0;font-size:22px">New task</h2><span class="kbd">Ctrl Alt N</span></div>
  <input class="input" data-model="qcTitle" value="${esc(ui('qcTitle', ''))}" placeholder="What should be done? e.g. Show VAT number on invoices" style="height:50px;font-size:16px;border:1.5px solid var(--accent)">
  <div class="row wrap mt16"><span class="muted small">Project</span>
    <select class="btn sm" style="padding:0 12px">${D.projects.map(p => `<option ${p.id === (S.project === 'all' ? 'acme-billing' : S.project) ? 'selected' : ''}>${p.id}</option>`).join('')}</select>
    <span class="grow"></span><span class="faint small">Claude drafts the goal when you start.</span></div>
  <div class="row mt24" style="justify-content:flex-end">${btn('Start now', {act: 'oeStartNow'})}${btn('Save to To do', {kind: 'primary', act: 'oeSaveTodo'})}</div>
  <div class="faint tiny mt12">Works from any app, even when Saarthi is in the background.</div>`, {mid: false}));
A.oeSaveTodo = () => oeCloseToast(`<b>Saved to To do</b> · ${esc(ui('qcTitle') || 'Show VAT number on invoices')} · acme-billing`);
A.oeStartNow = () => { go('newTask', {draft: ui('qcTitle') || 'Show VAT number on invoices'}); return false; };
view('quickCapture', {title: 'New task from any app (Ctrl Alt N)', area: 'Overlays', ms: 'M3', base: 'home', overlay: 'quickCapture'}, () => '');

/* ---------- Keyboard shortcuts (?) ---------- */
const OE_KEYS = [
  ['Anywhere', [['Search or jump', 'Ctrl K'], ['New task, from any app', 'Ctrl Alt N'], ['This sheet', '?'], ['Search on this screen', '/'], ['Close a dialog or go back', 'Esc'], ['Toggle theme', 'Ctrl Shift L']]],
  ['Go to', [['Home', 'G H'], ['Board view', 'G B'], ['Lessons and notes', 'G N'], ['Jira tickets', 'G J'], ['Settings', 'Ctrl ,']]],
  ['Task page', [['Start', 'R'], ['Send to the agent', 'Ctrl Enter'], ['Stop the agent', 'Ctrl .'], ['Activity, Changes, Files', '1 2 3'], ['Open in my editor', 'E']]],
  ['Files and Check and ship', [['Next change, previous change', '] ['], ['Mark as looked at', 'L'], ['Comment on this line', 'C'], ['Ask Codex to review', 'O'], ['Approve and create pull request', 'A']]],
];
overlay('shortcuts', () => dialog(`
  <div class="row" style="margin-bottom:6px"><h2 class="grow" style="margin:0;font-size:22px">Keyboard shortcuts</h2>${btn('Close', {size: 'sm', act: 'closeOverlay'})}</div>
  <p class="muted small" style="margin:0 0 18px">Shortcuts don't work while you type in a text box or the terminal. The command bar shows the same keys.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px 28px">
    ${OE_KEYS.map(([g, rows]) => `<div><div class="b small accent" style="margin:8px 0 4px">${g}</div>
      ${rows.map(([l, k]) => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--border)"><span class="grow small">${l}</span><span class="none">${oeKeys(k)}</span></div>`).join('')}</div>`).join('')}
  </div>`, {wide: true, mid: true}));
view('shortcuts', {title: 'Keyboard shortcuts (?)', area: 'Overlays', ms: 'M9', base: 'home', overlay: 'shortcuts'}, () => '');

/* ---------- errors and states ---------- */
function oeFrame(body) {
  return `<div class="center"><div style="width:100%;max-width:600px">
    <div class="row" style="margin-bottom:34px">${I.logo(30)}<span class="display" style="font-weight:700;font-size:20px">Saarthi</span></div>${body}</div></div>`;
}

view('errService', {title: 'Background service stopped', area: 'Errors and states', ms: 'M9', chrome: 'bare'}, () => oeFrame(`
  <span class="bigmark red">!</span>
  <h1 style="font-size:32px;margin:18px 0 10px">Saarthi's background service stopped</h1>
  <p class="lead" style="margin:0 0 24px">Your tasks and work are safe. Every task keeps its own copy of the repo on disk. Agents that were running pick up where they stopped.</p>
  <div class="card row" style="border-radius:18px;padding:14px 20px"><span class="spin faint"></span><span class="grow muted">Trying again every few seconds · last try 2 s ago</span></div>
  <div class="row wrap mt24">${btn('Restart it', {kind: 'primary', size: 'lg', act: 'oeRestart'})}${btn(ui('tech') ? 'Hide technical details ▴' : 'Show technical details ▾', {size: 'lg', kind: 'ghost', tog: 'tech'})}</div>
  ${ui('tech') ? `<div class="mt16">${codebox(`127.0.0.1:7878 · connection refused · since 11:42:08

Linux     systemctl --user status saarthid
          journalctl --user -u saarthid -n 50
macOS     launchctl print gui/$UID/ai.saarthi.daemon
Windows   Task Manager → Services → Saarthi service

Log file  ~/.local/share/saarthi/logs/saarthid.log`)}<div class="row tight mt12">${btn('Copy details', {size: 'sm', act: 'toast', arg: 'Copied. Paste it into a bug report.'})}${btn('Open the log', {size: 'sm', act: 'toast', arg: 'Opened saarthid.log in your editor'})}</div></div>` : ''}`));
A.oeRestart = () => { go('home', {toast: '<b>Background service is back.</b> All your tasks are here.'}); setTimeout(() => { if (S.view === 'home') set({toast: null}); }, 3200); return false; };

view('errAgent', {title: 'Agent not logged in', area: 'Errors and states', ms: 'M9'}, () => homeList(`
  <div class="card red row top wrap" style="border-radius:20px;padding:16px 18px;margin-bottom:22px">
    <span class="badmark">!</span>
    <div class="grow" style="min-width:260px"><div class="b" style="font-size:16px">Claude isn't logged in, so new tasks can't start. Your tasks are safe.</div>
      <div class="muted small" style="margin-top:2px">Run this in a terminal and follow the steps. Running agents are not affected.</div>
      <div class="row tight wrap mt12">
        <div class="row" style="height:40px;padding:0 4px 0 14px;border-radius:12px;background:var(--code-bg);border:1px solid var(--border);min-width:200px"><code class="grow">claude</code>${btn(ui('copied') ? 'Copied' : 'Copy', {size: 'xs', kind: 'surface', set: {copied: true}})}</div>
        ${btn('Check again', {size: 'sm', kind: 'surface', act: 'oeCheckAgain'})}<a class="small" data-go="settingsAgents">Use another agent</a></div></div>
  </div>`));
A.oeCheckAgain = () => { go('home', {toast: '<b>Claude is logged in.</b> New tasks can start again.'}); setTimeout(() => { if (S.view === 'home') set({toast: null}); }, 3200); return false; };

view('reconnecting', {title: 'Reconnecting to the background service', area: 'Errors and states', ms: 'M9',
  banner: () => `<div class="banner"><span class="spin"></span><span>Reconnecting to the background service… your agents keep working</span><span class="faint">· try 3 · nothing is lost</span></div>`},
() => VIEWS.question.render());

view('versionMismatch', {title: 'App and service versions differ', area: 'Errors and states', ms: 'M9', chrome: 'bare'}, () => oeFrame(`
  <span class="bigmark accent">↑</span>
  <h1 style="font-size:32px;margin:18px 0 10px">Saarthi needs an update</h1>
  <p class="lead" style="margin:0 0 24px">This app is older than the background service it talks to. Update the app so they match. Your tasks are safe, and nothing runs until they match.</p>
  <div class="card" style="padding:4px 20px;border-radius:18px">
    <div class="row" style="padding:14px 0;border-bottom:1px solid var(--border)"><span class="grow" style="font-weight:500">This app</span><code>1.0.2</code><span class="chip accent" style="margin-left:4px;min-width:74px;justify-content:center">older</span></div>
    <div class="row" style="padding:14px 0"><span class="grow" style="font-weight:500">Background service</span><code>1.1.0</code><span class="chip neutral" style="margin-left:4px;min-width:74px;justify-content:center">newer</span></div>
  </div>
  <div class="row wrap mt24">${btn('Update the app', {kind: 'primary', size: 'lg', act: 'toast', arg: 'Downloading Saarthi 1.1.0 (31 MB)… the app restarts by itself.'})}${btn('Restart the service', {size: 'lg', act: 'toast', arg: 'Service restarted. It is still 1.1.0, so the app still needs the update.'})}</div>
  <p class="faint small" style="margin:14px 4px 0">Updated the service by hand? Restarting it is enough when both are the same version. <a data-go="settingsAbout">What's new in 1.1.0</a></p>`));
