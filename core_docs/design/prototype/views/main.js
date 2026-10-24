/* Main flow: first run → Home → New task → Task page → Files → Check and ship → Done.
   Also the shared builders other screen files use: taskPage(), filesView(), checkPage(), agentMenu(). */

/* ---------- first run ---------- */
function setupFrame(step, body) {
  return `<div class="center"><div style="width:100%;max-width:620px">
    <div class="row" style="margin-bottom:28px">${I.logo(30)}<span class="display" style="font-weight:700;font-size:20px">Saarthi</span><span class="grow"></span><span class="faint small">${step}</span></div>
    ${body}</div></div>`;
}
const checkLine = (name, note, right, last) => `<div class="row" style="padding:16px 0;${last ? '' : 'border-bottom:1px solid var(--border)'}"><span class="okmark">${I.check()}</span><span class="grow" style="font-weight:500">${name}${note ? ` <span class="faint" style="font-weight:400">· ${note}</span>` : ''}</span><span class="faint small">${right}</span></div>`;

view('setup1', {title: 'First run: pick a project', area: 'First run', ms: 'M9', chrome: 'bare'}, () => setupFrame('Step 1 of 2', `
  <h1 style="font-size:34px;margin:0 0 12px">Tell the agent what you want. Check the proof. Ship.</h1>
  <p class="lead" style="margin:0 0 30px">Saarthi runs Claude, Codex or Gemini on your repos, asks you when they have a question, runs your tests, and opens a pull request. First, pick a project to work on. You can add more later. They all open in this one window.</p>
  <div class="card pad-lg">
    <label class="label">Project folder</label>
    <div class="row wrap"><div class="input mono" style="flex:1 1 260px;display:flex;align-items:center;border:1.5px solid var(--accent);font-size:14px;height:46px">~/OFFICE/acme-billing</div>${btn('Choose folder…', {size: 'lg', act: 'toast', arg: 'Opens the folder picker of your system'})}</div>
    <div class="row green mt16">${I.check(18)}<span>Git repo found · branch <b>main</b> · github.com/ankit/acme-billing</span></div>
  </div>
  <div class="row wrap mt24">${btn('Continue', {kind: 'primary', size: 'lg', go: 'setup2'})}<span class="faint small">Saarthi adds one small settings file, <code>.saarthi/project.toml</code>. It never commits it.</span></div>`));

view('setup2', {title: 'First run: all set', area: 'First run', ms: 'M9', chrome: 'bare'}, () => setupFrame('Step 2 of 2', `
  <h1 style="font-size:32px;margin:0 0 10px">You're ready</h1>
  <p class="lead" style="margin:0 0 26px">We checked your computer. Everything you need is here.</p>
  <div class="card" style="padding:8px 22px">
    ${checkLine('Git', '', '2.43')}
    ${checkLine('Claude Code', 'your agent', 'logged in')}
    ${checkLine('Gemini CLI', 'second agent', 'logged in')}
    ${checkLine('GitHub', 'to open pull requests', 'logged in as ankit')}
    ${checkLine('Background service', '', 'started for you', true)}
  </div>
  <p class="faint small" style="margin:14px 4px 0">Codex is installed but not logged in. That's optional. You can set it up later in Settings → Agents.</p>
  <div class="row mt24">${btn('Start using Saarthi', {kind: 'primary', size: 'lg', go: 'homeEmpty'})}${btn('Back', {size: 'lg', go: 'setup1'})}</div>`));

view('setup2x', {title: 'First run: one thing to fix', area: 'First run', ms: 'M9', chrome: 'bare'}, () => setupFrame('Step 2 of 2', `
  <h1 style="font-size:32px;margin:0 0 10px">One thing to fix</h1>
  <p class="lead" style="margin:0 0 26px">Saarthi needs one AI agent that is logged in. Claude Code is installed, but not logged in yet.</p>
  <div class="card" style="padding:8px 22px">
    ${checkLine('Git', '', '2.43')}
    <div style="padding:16px 0;border-bottom:1px solid var(--border)">
      <div class="row"><span class="badmark">!</span><span class="grow b">Claude Code isn't logged in</span></div>
      <div style="margin:12px 0 0 42px"><div class="muted mb8">Run this in a terminal and follow the steps:</div>
        <div class="row" style="height:44px;padding:0 6px 0 16px;border-radius:14px;background:var(--code-bg);border:1px solid var(--border)"><code class="grow">claude</code>${btn(ui('copied') ? 'Copied' : 'Copy', {size: 'sm', kind: 'surface', set: {copied: true}})}</div></div>
    </div>
    ${checkLine('Background service', '', 'started for you', true)}
  </div>
  <div class="row wrap mt24">${btn('Check again', {kind: 'primary', size: 'lg', go: 'setup2'})}<span class="faint small">Or use another agent: <code>codex login</code> or <code>gemini</code></span></div>`));

/* ---------- agent picker (Home and New task) ---------- */
function agentMenu() {
  const cur = S.agent;
  const items = D.agents.map(a => ({id: a.id, name: a.name, note: a.note, dot: a.ok ? 'var(--green)' : 'var(--accent)', act: a.ok ? 'setAgent' : null}))
    .concat([{id: 'both', name: 'Two agents side by side', note: 'Both try, you keep the better one', dot: 'var(--blue)', act: 'setAgent'}]);
  return `<div style="position:relative" data-keepmenu="1">
    <button class="btn sm" data-set='{"menu":${ui('menu') === 'agent' ? 'null' : '"agent"'}}'>${S.agent === 'both' ? 'Claude + Gemini' : agentShort()} ${I.down()}</button>
    ${ui('menu') === 'agent' ? `<div class="menu right" style="top:44px">
      <div class="mh">Which agent should do this task?</div>
      ${items.map(a => `<button class="mi ${a.id === cur ? 'on' : ''}" ${a.act ? `data-act="setAgent" data-arg="${a.id}"` : 'data-go="settingsAgents"'}>
        <span class="row tight grow" style="min-width:0"><span class="dot" style="background:${a.dot}"></span><span class="grow" style="min-width:0"><span style="display:block;font-weight:600">${a.name}</span><span class="tiny muted">${a.note}${a.act ? '' : ' · click to set up'}</span></span></span>
        <span class="accent b tiny">${a.id === cur ? '✓' : ''}</span></button>`).join('')}
      <div class="divider"></div><button class="mi" data-go="settingsAgents"><span class="accent small">+ Add another agent in Settings</span></button>
    </div>` : ''}
  </div>`;
}

/* ---------- home ---------- */
view('homeEmpty', {title: 'Home, empty', area: 'Home', ms: 'M3 M9', needs: 0}, () => page(`
  <h1 style="font-size:36px;margin:44px 0 12px">What should ${agentShort()} build?</h1>
  <p class="lead" style="margin:0 0 28px">Describe a task in plain words. ${agentShort()} works in its own copy of your repo, runs your tests, and opens a pull request when you approve.</p>
  <div class="card" style="border:1.5px solid var(--accent);border-radius:24px;padding:18px 18px 14px">
    <input data-model="draft" value="${esc(ui('draft', ''))}" placeholder="e.g. Add password reset API" style="width:100%;border:none;background:transparent;outline:none;font-size:19px;padding:6px 6px 14px">
    <div class="row">${agentMenu()}<span class="grow"></span>${btn('Start', {kind: 'primary', go: 'newTask'})}</div>
  </div>
  <div class="row wrap tight mt16"><span class="faint small">Try one:</span>${['Add password reset API', 'Fix the flaky login test', 'Export invoices as CSV'].map(x => `<button class="btn sm surface" data-set='{"draft":"${x}"}'>${x}</button>`).join('')}</div>
  <div class="grid cols3" style="margin-top:56px">
    ${[['1 · Describe it', 'Claude turns it into a goal you can edit.'], ['2 · Answer questions', "We'll tell you when Claude needs you."], ['3 · Check and ship', 'Tests run by themselves. You approve the PR.']].map(([t, d]) => `<div class="tile" style="padding:18px;border-radius:18px;background:var(--surface)"><div class="display b" style="font-size:17px;margin-bottom:4px">${t}</div><div class="muted small">${d}</div></div>`).join('')}
  </div>`, 'narrow'));

function projectTabs() {
  return `<div class="row wrap tight" style="margin-bottom:22px">
    ${[['all', 'All projects', '']].concat(D.projects.map(p => [p.id, p.id, p.path])).map(([id, name, path]) => {
      const on = id === S.project, n = needsCount(id);
      return `<button class="btn sm" style="${on ? 'background:var(--surface-2);border-color:var(--border-strong);font-weight:600' : 'border-color:var(--border)'}" data-act="setProject" data-arg="${id}" title="${path}">${name}${n ? ` <span class="count">${n}</span>` : ''}</button>`;
    }).join('')}
    <button class="btn sm ghost" style="border:1px dashed var(--border-strong)" data-go="setup1">+ Add project</button>
  </div>`;
}
function taskRow(t, all) {
  const prim = t.k === 'ask' || t.k === 'fail';
  return `<div class="item click" data-go="${t.to || 'todoTask'}">
    <span class="sdot ${t.k}"></span>
    <div class="grow"><div class="row tight wrap"><span style="font-weight:${t.g === 'needs' ? 600 : 500};font-size:16px">${esc(t.title)}</span>${all ? `<span class="tag">${t.repo}</span>` : ''}</div>
      <div class="muted">${esc(t.line)}</div></div>
    ${t.action ? btn(t.action, {kind: prim ? 'primary' : '', go: t.to}) : ''}
  </div>`;
}
function homeList(extraTop = '') {
  const all = S.project === 'all', ts = projectTasks();
  const groups = [['needs', 'Needs you', 'accent'], ['working', 'Working', 'muted'], ['todo', 'To do', 'muted']].map(([g, label, c]) => [label, c, ts.filter(t => t.g === g), g]).filter(x => x[2].length);
  const done = ts.filter(t => t.g === 'done');
  return page(`${projectTabs()}${extraTop}
    <div class="card row" style="border-color:var(--border-strong);border-radius:22px;padding:10px 10px 10px 20px">
      <input class="grow" data-model="draft" value="${esc(ui('draft', ''))}" placeholder="Describe a new task…" style="border:none;background:transparent;outline:none;font-size:17px">
      ${agentMenu()}
      ${all ? `<select class="btn sm" style="padding:0 12px"><option>in acme-billing</option><option>in saarthi</option><option>in clinic-portal</option></select>` : ''}
      ${btn('Start', {kind: 'primary', go: 'newTask'})}
    </div>
    <div class="row" style="margin:32px 0 14px"><h2 class="grow" style="margin:0;font-size:22px">Your tasks <span class="faint" style="font-weight:500;font-size:16px">· ${all ? 'all 3 projects' : S.project}</span></h2>${seg([['list', 'List'], ['board', 'Board', {go: 'board'}]], 'list')}</div>
    ${groups.map(([label, c, rows, g]) => `<div class="b ${c}" style="margin:0 0 8px 4px">${label} · ${rows.length}</div>
      <div class="card flush list ${g === 'needs' ? 'glow' : ''}" style="margin-bottom:26px">${rows.map(t => taskRow(t, all)).join('')}</div>`).join('')}
    <button class="btn ghost" style="padding:0 4px" data-tog="doneOpen">Done this week · ${done.length} ${I.down()}</button>
    ${ui('doneOpen') ? `<div class="card flush list mt8">${done.map(t => `<div class="item"><span class="green">✓</span><div class="grow row tight wrap">${esc(t.title)}${all ? `<span class="tag">${t.repo}</span>` : ''}</div><span class="faint small">${t.when}</span><a class="small">${t.pr}</a></div>`).join('')}</div>` : ''}
  `, 'wide');
}
view('home', {title: 'Home with tasks (all projects)', area: 'Home', ms: 'M3'}, () => homeList());

view('board', {title: 'Board view', area: 'Home', ms: 'M3 M4'}, () => {
  const all = S.project === 'all', ts = projectTasks(), det = ui('detail');
  const cols = [['needs', 'Needs you'], ['working', 'Working'], ['todo', 'To do'], ['done', 'Done']];
  const sub = t => t.g === 'done' ? `<div class="green small mt8">${t.pr} open</div>` : `<div class="muted small" style="margin-top:4px">${esc(t.line.split(' · ')[0])}</div>`;
  return page(`${back()}
    <div class="row wrap" style="margin-bottom:18px"><h2 class="grow" style="margin:0;font-size:24px">Your tasks <span class="faint" style="font-weight:500;font-size:16px">· ${all ? 'all projects' : S.project}</span></h2>
      <label class="row tight muted small" style="cursor:pointer" data-tog="detail">${toggle(det)} Show detailed stages</label>
      ${seg([['list', 'List', {go: 'home'}], ['board', 'Board']], 'board')}</div>
    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px">
      ${cols.map(([g, label]) => { const rows = ts.filter(t => t.g === g); return `<div class="card" style="padding:14px;min-height:420px;${g === 'needs' ? 'border-color:var(--accent)' : ''}">
        <div class="b ${g === 'needs' ? 'accent' : 'muted'}" style="margin:0 4px 12px">${label} · ${rows.length}</div>
        ${rows.map(t => `<div class="tile" style="margin-bottom:10px;cursor:pointer;${t.k === 'ask' ? 'animation:needsGlow 2.4s ease-in-out infinite' : ''}" data-go="${t.to || 'todoTask'}">
          <div class="row tight"><span class="b grow">${esc(t.title)}</span>${t.k === 'fail' ? '<span class="sdot fail"></span>' : t.k === 'review' ? '<span class="sdot review" title="All checks passed"></span>' : ''}</div>
          ${all ? `<div class="mt8"><span class="tag">${t.repo}</span></div>` : ''}${sub(t)}
          ${det && t.stage ? `<div class="tiny faint mono mt8">stage: ${t.stage}</div>` : ''}</div>`).join('')}
      </div>`; }).join('')}
    </div>
    ${emptyNote('Drag a card to move it. Saarthi only allows moves that make sense; a blocked move says why. Example: "Rate-limit the login endpoint can\'t go to Done: approve it in Check and ship first."')}
  `, 'xwide');
});

/* ---------- new task ---------- */
view('newTask', {title: 'New task: drafted goal', area: 'New task', ms: 'M3 M6 M7 M8', needs: 0}, () => {
  const t = D.task, more = ui('moreOpts'), how = ui('how', 'build');
  return page(`${back()}
    <div class="eyebrow">New task · <span class="tag">acme-billing</span></div>
    <h1>${esc(ui('draft') || t.title)}</h1>
    <p class="muted" style="margin:0 0 24px;font-size:16px">${agentShort()} drafted the goal from your words. Change anything, then start.</p>
    <div class="card pad-lg">
      <label class="label">Goal</label>
      <textarea class="textarea" rows="2">${esc(t.goal)}</textarea>
      <label class="label" style="margin:20px 0 4px">What done looks like</label>
      <div class="faint small mb8">${agentShort()} checks each of these before you review.</div>
      <div class="col" style="gap:8px">${t.done.map(d => `<div class="row"><span class="check"></span><input value="${esc(d)}" style="flex:1;border:none;border-bottom:1px solid var(--border);background:transparent;padding:6px 0;outline:none"></div>`).join('')}
        <button class="link" style="align-self:flex-start;padding:6px 0">+ Add one</button></div>
    </div>
    <button class="btn ghost mt16" style="padding:0 4px" data-tog="moreOpts">More options <span class="faint">· research first, saved instructions, side by side</span> ${I.down()}</button>
    ${more ? `<div class="card mt12 grid" style="gap:18px">
      <div><div class="b mb8">How should ${agentShort()} work?</div><div class="row wrap tight">
        ${[['build', 'Build it'], ['plan', 'Plan first, wait for my OK'], ['research', 'Just research, no code'], ['bug', 'Fix a bug, test first']].map(([id, l]) => `<button class="pill ${how === id ? 'on' : ''}" data-set='{"how":"${id}"}'>${l}</button>`).join('')}</div></div>
      <div class="grid cols"><div><div class="b mb8">Saved instructions</div><button class="input row" style="text-align:left;color:var(--muted);cursor:pointer" data-go="playbooks">None · pick one ${I.down()}</button></div>
        <div><div class="b mb8">Extra note for ${agentShort()}</div><input class="input" placeholder="e.g. Keep the public API the same"></div></div>
      <label class="row top" style="cursor:pointer" data-go="raceRunning">${toggle(false)}<span><b>Try two agents side by side</b><br><span class="muted small">Claude and Gemini both work on the same goal. You keep the better result.</span></span></label>
      <div class="faint small">Safety: ${agentShort()} can only change files in its own copy of the repo. <a data-go="safety">Change</a> · Budget for this task: $3.00</div>
    </div>` : ''}
    <div class="sticky" style="padding:14px 16px 14px 20px">
      <span class="grow muted small" style="min-width:200px">${agentShort()} works in its own copy of the repo. Your main branch is never touched.</span>
      ${btn('Save for later', {go: 'home'})}${btn(how === 'research' ? 'Start research' : how === 'plan' ? 'Start planning' : 'Start', {kind: 'primary', size: 'lg', go: how === 'research' ? 'research' : how === 'plan' ? 'planReview' : 'work'})}
    </div>`, 'narrow');
});

/* ---------- task page ---------- */
const BASE_FEED = () => [
  ['10:41', 'Started working in its own copy of the repo'],
  ['10:42', `Read the login code <button class="link faint small" data-tog="reads" style="color:var(--faint)">· 3 files ${ui('reads') ? '▴' : '▾'}</button>${ui('reads') ? '<span class="mono tiny muted" style="display:block;margin-top:6px">app/auth/routes.py · app/auth/security.py · app/mail.py</span>' : ''}`],
  ['10:44', 'Changed <code>reset.py</code> <span class="green">+42</span>'],
  ['10:47', '<span class="green">✓</span> Ran the login tests · 4 passed'],
];
const MORE_TABS = [['terminal', 'Terminal', `type to the agent directly`], ['docs', 'Docs', "the agent's plan, notes"], ['history', 'History', 'timeline, undo points'], ['details', 'Details', 'branch, cost, what it reads'], ['livePreview', 'Live browser', 'watch the agent test it']];

/* o: {status:[tone,label,{spin|dot}], statusText, top, tab, body, feed, baseFeed, right, input, title, backTo} */
function taskPage(o = {}) {
  const t = D.task, tab = o.tab || ui('tab', 'activity');
  const moreTab = MORE_TABS.find(m => m[0] === tab);
  const [tone, label, so] = o.status || ['blue', 'Working', {spin: true}];
  const feed = (o.baseFeed === false ? [] : BASE_FEED()).concat(o.feed || []);
  const activityGo = o.activityGo || 'work';
  const tabBtn = (id, html, extra) => `<button class="${tab === id ? 'on' : ''}" ${extra}>${html}</button>`;
  let content;
  if (o.body !== undefined) content = o.body;
  else if (tab === 'changes') content = `<div class="grid" style="gap:10px">
      ${[['app/auth/reset.py', 'new · +42', 'green'], ['app/auth/routes.py', '+16 −4', 'muted'], ['tests/auth/test_password_reset.py', 'new · +61', 'green']].map(([f, s, c]) => `<div class="card row" style="padding:14px 18px;border-radius:16px;cursor:pointer" data-go="files"><code class="grow">${f}</code><span class="${c} small">${s}</span></div>`).join('')}
      <div class="row wrap mt8"><span class="grow faint small">A grouped summary appears in Check and ship when ${t.agent} is done.</span>${btn('Browse all files →', {size: 'sm', go: 'files'})}</div></div>`;
  else content = `<div class="feed">${feed.map(([time, html]) => `<div><span class="t">${time}</span><span class="e">${html}</span></div>`).join('')}</div>${o.after || ''}`;
  return page(`${back(o.backLabel, o.backTo)}
    <div class="row top wrap">
      <div class="grow" style="min-width:260px">
        <h1>${esc(o.title || t.title)}</h1>
        <div class="row tight wrap">${chip(label, tone, so)}<span class="muted">${o.statusText || ''}</span>
          ${o.noTicket ? '' : `<button class="tag" style="cursor:pointer;background:none" data-go="tickets" title="Linked Jira ticket">${t.ticket} · In Review</button>`}<span class="tag">${t.repo}</span></div>
      </div>
      ${o.right !== undefined ? o.right : btn('Stop', {act: 'toast', arg: 'Stopped. You can resume from the same point.'})}
    </div>
    ${o.top || ''}
    ${o.noGoal ? '' : `<div class="card flush mt24" style="border-radius:20px">
      <button class="row" style="width:100%;padding:16px 20px;border:none;background:none;cursor:pointer;text-align:left" data-tog="goalOpen">
        <span class="b none">Goal</span><span class="grow ellipsis muted">${esc(t.goal.split('. ')[0])}.</span><span class="faint small none">${ui('goalOpen') ? 'Hide' : 'Show 5 things to be done'}</span></button>
      ${ui('goalOpen') ? `<div style="padding:0 20px 18px" class="muted"><div class="mb8" style="color:var(--text)">${esc(t.goal)}</div><div class="b mb8" style="color:var(--text)">What done looks like</div><ul style="margin:0;padding-left:20px;display:grid;gap:4px">${t.done.map(d => `<li>${esc(d)}</li>`).join('')}</ul><div class="mt12">${btn('Edit goal', {size: 'sm', act: 'toast', arg: 'Edits make a new goal version. History keeps the old ones.'})}</div></div>` : ''}
    </div>`}
    <div class="tabs">
      ${tabBtn('activity', 'Activity', moreTab ? `data-go="${activityGo}"` : `data-set='{"tab":"activity","menu":null}'`)}
      ${tabBtn('changes', 'Changes <small>3 files</small>', moreTab ? `data-go="${activityGo}"` : `data-set='{"tab":"changes","menu":null}'`)}
      <button data-go="files">Files</button>
      <span style="position:relative" data-keepmenu="1">${tabBtn(moreTab ? tab : 'more', `${moreTab ? moreTab[1] : 'More'} ▾`, `data-set='{"menu":${ui('menu') === 'more' ? 'null' : '"more"'}}'`)}
        ${ui('menu') === 'more' ? `<div class="menu" style="top:46px;width:290px">${MORE_TABS.map(([id, l, n]) => `<button class="mi" data-go="${id}"><span>${l} <small>· ${n}</small></span></button>`).join('')}</div>` : ''}</span>
    </div>
    ${content}
    ${o.sticky === false ? '' : `<div class="sticky"><input placeholder="${o.input || `Tell ${t.agent} something…`}">${btn('Send', {kind: 'surface', act: 'toast', arg: 'Sent to ' + t.agent})}</div>`}
  `);
}

view('work', {title: 'Task: agent working', area: 'Task page', ms: 'M3', needs: 3}, () => taskPage({
  statusText: 'Claude is working · 6 min · you can leave, we\'ll tell you if it needs you',
  feed: [['now', '<span class="row tight blue"><span class="spin"></span>Planning where to store reset tokens…</span>']],
}));

view('question', {title: 'Task: agent asks a question', area: 'Task page', ms: 'M3'}, () => taskPage({
  status: ['accent', 'Needs you', {dot: true}], statusText: 'Claude is paused, waiting for your answer', activityGo: 'question',
  top: `<section class="askbox">
    <div class="b accent mb8">Claude has a question · 3 min ago · paused until you answer</div>
    <div class="q">Should I store reset tokens in a new database table, or in Redis?</div>
    <div class="muted mt8">The goal doesn't say. A table needs a small migration. Redis is faster but adds a new service.</div>
    <div class="row wrap mt16">${btn('New table <span style="font-weight:500;opacity:.75">· Claude suggests this</span>', {kind: 'primary', size: 'lg', go: 'checks'})}${btn('Use Redis', {size: 'lg', kind: 'surface', go: 'checks'})}</div>
    <div class="row mt12"><input class="input grow" placeholder="Or type your own answer…">${btn('Send', {kind: 'surface', go: 'checks'})}</div>
  </section>`,
}));

const ANSWER_FEED = [['10:55', 'You answered: <b>New table</b>'], ['10:58', 'Added the table <code>password_reset_tokens</code> and wrote 7 tests']];
function checksBox(title) {
  return `<div class="card mt12" style="border-radius:18px">
    <div class="row b mb8"><span class="spin"></span>${title}</div>
    <div class="grid" style="gap:8px">
      <div class="row tight"><span class="green" style="width:18px">✓</span><span class="grow">Code style</span><span class="faint small">0.3 s</span></div>
      <div class="row tight"><span class="blue" style="width:18px">●</span><span class="grow">Tests</span><span class="faint small">running · 67%</span></div>
      <div class="row tight faint"><span style="width:18px">○</span><span class="grow">Type check</span><span class="small">waiting</span></div>
    </div>
    <div class="faint small mt12">You'll be asked to review only when these pass.</div></div>`;
}
view('checks', {title: 'Task: checks running', area: 'Task page', ms: 'M4', needs: 3}, () => taskPage({
  statusText: 'Claude finished. Running your tests and checks…', feed: ANSWER_FEED, after: checksBox('Running tests and checks · 1 of 3 done'),
}));
view('fixing', {title: 'Task: Claude fixing a failed check', area: 'Task page', ms: 'M4', needs: 3}, () => taskPage({
  statusText: 'Claude is fixing the failed test · try 1 of 3',
  feed: ANSWER_FEED.concat([['11:02', '<span class="red">✕</span> 1 test failed: an expired link still worked'], ['11:03', 'You asked Claude to fix it']]),
  after: checksBox('Claude is fixing it. Checks will run again.'),
}));

/* ---------- files (IDE view) ---------- */
const STATUS_TAG = {A: ['new', 'var(--green)'], M: ['changed', 'var(--accent-text)'], D: ['deleted', 'var(--red)']};
Object.values(D.files).forEach(f => {
  f.rows = f.lines.split('\n').map(l => ({k: l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : 'ctx', t: l.slice(1)}));
  f.add = f.rows.filter(r => r.k === 'add').length; f.del = f.rows.filter(r => r.k === 'del').length;
});

/* mode 'task': the task's copy, changes vs main. mode 'project': the main repo, read-only, no changes. */
function filesView(mode) {
  const task = mode === 'task';
  const files = task ? D.files : Object.fromEntries(Object.entries(D.files).filter(([, f]) => f.s !== 'A').map(([p, f]) => [p, {...f, s: '', why: '', rows: f.rows.filter(r => r.k !== 'add').map(r => ({k: 'ctx', t: r.t}))}]));
  const sel = files[ui('sel')] ? ui('sel') : (task ? 'app/auth/reset.py' : 'app/auth/routes.py');
  const tabs = ui('tabsOpen') || (task ? ['app/auth/reset.py', 'app/auth/routes.py'] : ['app/auth/routes.py', 'README.md']);
  const f = files[sel], q = (ui('fq') || '').toLowerCase(), changedOnly = task && ui('changedOnly'), full = !task || ui('full'), closed = ui('closed') || {};
  const looked = ui('looked') || {};
  const paths = Object.keys(files).filter(p => (!changedOnly || files[p].s) && (!q || p.toLowerCase().includes(q)));
  const root = {dirs: {}, files: []};
  paths.forEach(p => { const parts = p.split('/'); let n = root, acc = ''; parts.slice(0, -1).forEach(d => { acc += (acc ? '/' : '') + d; n.dirs[d] = n.dirs[d] || {dirs: {}, files: [], path: acc}; n = n.dirs[d]; }); n.files.push(p); });
  const countCh = n => n.files.filter(p => files[p].s).length + Object.values(n.dirs).reduce((a, d) => a + countCh(d), 0);
  let rows = '';
  const walk = (n, depth) => {
    Object.keys(n.dirs).sort().forEach(d => { const dn = n.dirs[d], open = !closed[dn.path] || !!q, c = countCh(dn);
      rows += `<button class="frow" style="padding-left:${12 + depth * 16}px" data-act="fold" data-arg="${dn.path}"><span class="faint" style="width:10px">${open ? '▾' : '▸'}</span><span class="grow ellipsis">${d}/</span><span class="ft faint">${c ? c + ' changed' : ''}</span></button>`;
      if (open) walk(dn, depth + 1); });
    n.files.sort().forEach(p => { const fl = files[p], [tag, tc] = STATUS_TAG[fl.s] || ['', ''];
      rows += `<button class="frow ${p === sel ? 'on' : ''} ${fl.s ? 'ch' : ''}" style="padding-left:${28 + depth * 16}px" data-act="openFile" data-arg="${p}"><span class="grow ellipsis">${p.split('/').pop()}</span>${looked[p] ? '<span class="ft green">✓</span>' : ''}<span class="ft" style="color:${tc}">${tag}</span></button>`; });
  };
  walk(root, 0);
  let n = 0;
  const lines = f.rows.filter(r => !(full && r.k === 'del')).map(r => {
    const num = r.k === 'del' ? '' : String(++n); const cls = full ? '' : r.k === 'ctx' ? '' : r.k;
    return `<div class="ln ${cls}"><span class="n">${num}</span><span class="m">${!full && r.k === 'add' ? '+' : r.k === 'del' ? '−' : full && r.k === 'add' ? '│' : ' '}</span><span class="c">${hl(r.t || ' ')}</span></div>`;
  }).join('');
  const changed = Object.keys(files).filter(p => files[p].s);
  const [tag, tc] = STATUS_TAG[f.s] || ['unchanged', 'var(--faint)'];
  const proj = S.project === 'all' ? 'acme-billing' : S.project;
  return `<div class="ide">
    <div class="ide-head">
      ${task ? `<button class="back" style="margin:0" data-go="checks">← Task</button>` : `<button class="back" style="margin:0" data-go="home">← Home</button>`}
      <div class="grow" style="min-width:220px">
        <div class="display b" style="font-size:17px">${task ? 'Add password reset API · Files' : `${proj} · Project files`}</div>
        <div class="muted small">${task ? `Claude's copy of the repo · ${changed.length} files changed vs main · you've looked at ${changed.filter(p => looked[p]).length}` : `Branch main · read-only view of the repo on disk · ${Object.keys(files).length} files`}</div>
      </div>
      ${task ? seg([['changes', 'Show changes', {set: {full: false}}], ['full', 'Full file', {set: {full: true}}]], full ? 'full' : 'changes') :
        `<select class="btn sm">${D.projects.map(p => `<option ${p.id === proj ? 'selected' : ''}>${p.id}</option>`).join('')}</select>`}
      ${btn('Open in my editor', {size: 'sm', act: 'toast', arg: 'Opened in your editor: code --goto ' + sel})}
      ${task ? btn('Check and ship', {size: 'sm', kind: 'primary', go: 'check'}) : btn('New task about this file', {size: 'sm', kind: 'primary', go: 'newTask'})}
    </div>
    <div class="ide-body">
      <aside class="ide-tree">
        <div style="padding:12px 12px 8px;display:grid;gap:8px">
          <input class="input" style="height:38px;font-size:14px" data-model="fq" data-live value="${esc(ui('fq', ''))}" placeholder="Find a file…">
          ${task ? `<div class="seg" style="display:flex;background:var(--bg)"><button class="${changedOnly ? '' : 'on'}" style="flex:1" data-set='{"changedOnly":false}'>All files</button><button class="${changedOnly ? 'on' : ''}" style="flex:1" data-set='{"changedOnly":true}'>Changed · ${changed.length}</button></div>` : ''}
        </div>
        <div class="rows">${rows || '<div class="faint small" style="padding:10px">No file matches.</div>'}</div>
      </aside>
      <section style="display:flex;flex-direction:column;min-height:0;min-width:0">
        <div class="ftabs">${tabs.filter(p => files[p]).map(p => `<div class="ftab ${p === sel ? 'on' : ''}" data-act="openFile" data-arg="${p}">${p.split('/').pop()}<button class="x" data-act="closeTab" data-arg="${p}" aria-label="Close">×</button></div>`).join('')}</div>
        <div class="row wrap" style="padding:10px 16px;border-bottom:1px solid var(--border);gap:10px">
          <code class="ellipsis">${sel}</code><span class="tiny b" style="color:${tc}">${tag}</span><span class="tiny faint">${f.s ? `+${f.add} −${f.del}` : ''}</span><span class="grow"></span>
          ${task && f.s ? btn(looked[sel] ? '✓ Looked at' : 'Mark as looked at', {size: 'xs', act: 'look', arg: sel}) : ''}
          ${task ? btn('Next change ↓', {size: 'xs', act: 'nextChange'}) : ''}
          ${btn('Tiny edit', {size: 'xs', act: 'toast', arg: task ? 'Edit mode: allowed while Claude is not running. Saved in Claude\'s copy.' : 'Tiny edits on main are off. Start a task to change code.'})}
        </div>
        ${task && f.why ? `<div class="row top" style="margin:12px 16px 0;padding:12px 16px;border-radius:16px;background:var(--accent-soft)"><span class="none b accent small">Why Claude changed this</span><span class="grow small">${esc(f.why)}</span><button class="link small none" data-go="question">Ask about it</button></div>` :
          `<div class="small muted" style="margin:12px 16px 0;padding:10px 16px;border-radius:16px;background:var(--surface)">${task ? "Unchanged in this task. Read-only view of the file in Claude's copy." : 'This is your main branch. Saarthi never writes here; agents work in their own copies.'}</div>`}
        <div class="code">${lines}</div>
        <div class="ide-foot"><span>${sel.endsWith('.py') ? 'Python' : sel.endsWith('.md') ? 'Markdown' : 'TOML'} · ${n} lines</span><span>Branch ${task ? D.task.branch : 'main'}</span><span class="grow"></span><span>${task ? "Edits stay in Claude's copy. Main is never touched." : 'Read-only'}</span></div>
      </section>
    </div>
  </div>`;
}
A.fold = el => { const c = {...(ui('closed') || {})}; c[el.dataset.arg] = !c[el.dataset.arg]; S.ui.closed = c; };
A.openFile = el => { const p = el.dataset.arg, t = ui('tabsOpen') || (S.view === 'files' ? ['app/auth/reset.py', 'app/auth/routes.py'] : ['app/auth/routes.py', 'README.md']); S.ui.sel = p; S.ui.tabsOpen = t.includes(p) ? t : [...t, p].slice(-5); };
A.closeTab = (el, e) => { e.stopPropagation(); const t = (ui('tabsOpen') || []).filter(x => x !== el.dataset.arg); if (t.length) { S.ui.tabsOpen = t; if (ui('sel') === el.dataset.arg) S.ui.sel = t[t.length - 1]; } };
A.look = el => { S.ui.looked = {...(ui('looked') || {}), [el.dataset.arg]: !(ui('looked') || {})[el.dataset.arg]}; };
A.nextChange = () => { const ch = Object.keys(D.files).filter(p => D.files[p].s), cur = ui('sel') || 'app/auth/reset.py'; A.openFile({dataset: {arg: ch[(ch.indexOf(cur) + 1) % ch.length]}}); };

view('files', {title: 'Files: explore and review the task', area: 'Files', ms: 'M3 M5', needs: 3}, () => filesView('task'));
view('projectFiles', {title: 'Project files (main repo)', area: 'Files', ms: 'M3'}, () => filesView('project'));

/* ---------- check and ship ---------- */
function checkPage(o) {
  return page(`${back()}
    <div class="eyebrow">Check and ship</div>
    <h1 style="margin-bottom:22px">${esc(o.title || D.task.title)}</h1>
    ${o.body}
    <div class="sticky box" style="bottom:16px;margin-top:30px">
      <span class="grow muted small" style="min-width:240px">Opens a pull request from <code>saarthi/T-0012-…</code> into main. <b style="color:var(--text)">Saarthi never pushes to main.</b>${o.editLink === false ? '' : ' <a data-go="editPr">Edit pull request text</a>'}</span>
      ${o.bar}
    </div>`);
}
function verdict(kind, title, line, extra = '') {
  const map = {good: ['green', I.check(22)], look: ['accent', '?'], bad: ['red', '!']};
  const [tone, mark] = map[kind];
  return `<section class="card ${tone === 'accent' ? 'accent' : tone}" style="padding:22px 24px;border-radius:24px${tone === 'accent' ? ';border:1px solid var(--accent)' : ''}">
    <div class="row top"><span class="bigmark ${tone}">${mark}</span>
      <div class="grow"><div class="display b" style="font-size:24px">${title}</div><div style="font-size:16px;margin-top:2px">${line}</div>${extra}</div></div></section>`;
}
function howDecided(score) {
  return `<button class="link mt8" style="color:inherit;opacity:.85;font-weight:500" data-tog="how">${ui('how') ? 'Hide how we decided' : 'How we decided ▾'}</button>
    ${ui('how') ? `<div class="grid mt12" style="gap:6px;font-size:15px">
      <div class="row tight"><span class="green">✓</span><span class="grow">Code style</span><code class="muted tiny">uv run ruff check .</code></div>
      <div class="row tight"><span class="green">✓</span><span class="grow">Tests · 318 passed</span><code class="muted tiny">uv run pytest -q</code></div>
      <div class="row tight"><span class="green">✓</span><span class="grow">Type check</span><code class="muted tiny">uv run pyright</code></div>
      <div class="muted small mt8">The verdict comes from the checks (most weight), the goals and the optional review. Score: ${score} of 100 (Looks good from 70). Change which checks run in <a data-go="settingsProject">project settings</a>.</div></div>` : ''}`;
}

view('check', {title: 'Check and ship: looks good', area: 'Check and ship', ms: 'M4 M5', needs: 1}, () => {
  const codex = ui('codex', 'idle'), unsure = ui('unsure', 'open');
  const v = codex === 'done' ? verdict('look', 'Take a look', 'All 3 checks passed. Codex found 1 medium issue worth fixing first.', howDecided(71)) : verdict('good', 'Looks good', 'All 3 checks passed. 4 of 5 goals met, 1 needs a quick look.', howDecided(78));
  return checkPage({body: `${v}
    <div class="card row wrap mt16" style="border-radius:20px">
      <div class="row tight none">${['forgot', 'sent', 'dash'].map(p => `<div style="width:96px">${bwin('127.0.0.1:41012', BR_PAGES[p], {mini: true})}</div>`).join('')}</div>
      <div class="grow" style="min-width:200px"><div class="b">Live test passed <span class="flag" style="background:var(--green-soft);color:var(--green)">6 of 6 steps</span></div><div class="muted small">Claude reset a password in Chrome, end to end, and tried the used link again. Screenshots, video and trace are kept.</div></div>
      ${btn('See it work', {size: 'sm', go: 'evidence'})}
    </div>
    <h2>What done looks like</h2>
    <div class="card flush">
      ${D.task.done.slice(0, 4).map(d => `<div class="row" style="padding:13px 18px;border-bottom:1px solid var(--border)"><span class="green">✓</span><span class="grow">${esc(d)}</span></div>`).join('')}
      <div style="padding:14px 18px;background:var(--accent-soft)"><div class="row top wrap"><span class="accent b">?</span>
        <div class="grow" style="min-width:220px"><div>Tests cover all of the above</div><div class="muted small">Claude isn't sure: there's no test for the email text.</div></div>
        ${unsure === 'open' ? `<div class="row tight">${btn("That's fine", {size: 'sm', kind: 'surface', set: {unsure: 'ok'}})}${btn('Ask Claude to add it', {size: 'sm', kind: 'surface', go: 'fixing'})}</div>` : '<span class="green small b">Marked fine by you</span>'}</div></div>
    </div>
    <h2 style="margin-bottom:4px">What changed</h2>
    <div class="faint small mb16">6 files · +171 −4 · grouped by Claude. Click a group to see the code. Comment on any line to ask for a change.</div>
    <div class="grid" style="gap:10px">${D.groups.map((g, i) => `<div class="card flush" style="border-radius:18px">
      <button class="row top" style="width:100%;padding:16px 18px;border:none;background:none;cursor:pointer;text-align:left" data-set='{"open":${ui('open') === i ? -1 : i}}'>
        <div class="grow"><div class="row tight wrap"><span class="b" style="font-size:16px">${g.title}</span>${g.flag ? `<span class="flag">${g.flag}</span>` : ''}</div><div class="muted mt8" style="margin-top:2px">${g.why}</div></div><span class="faint small none">${g.stat}</span></button>
      ${ui('open') === i ? `<div style="margin:0 14px 14px">${codebox(g.diff, {diff: true})}</div><div class="row tight" style="margin:0 14px 14px">${btn('Open in Files →', {size: 'sm', act: 'openInFiles', arg: g.file})}${btn('Comment on a line', {size: 'sm', go: 'comment'})}</div>` : ''}
    </div>`).join('')}</div>
    <div class="card dashed row wrap mt24">
      ${codex === 'idle' ? `<div class="grow" style="min-width:220px"><div class="b">Want a second pair of eyes?</div><div class="muted small">Codex reads the changes and lists anything risky. It changes nothing. About 3 min, ~$0.20.</div></div>${btn('Ask Codex to review', {kind: 'surface', set: {codex: 'done'}})}` :
      `<div class="grow" style="min-width:220px"><div class="b">Codex found 1 thing worth fixing <span class="flag">medium</span></div><div class="muted">Compare token hashes with <code>hmac.compare_digest</code>, not <code>==</code>, to avoid a timing leak. <span class="faint">reset.py line 41</span></div></div>${btn('Let Claude fix it', {kind: 'surface', go: 'fixing'})}`}
    </div>`,
  bar: `${btn('Request changes', {size: 'lg', go: 'comment'})}${btn('Approve and create pull request', {kind: 'primary', size: 'lg', go: 'done'})}`});
});
A.openInFiles = el => { const sel = el.dataset.arg; go('files', {sel, tabsOpen: ['app/auth/reset.py', sel]}); return false; };

view('checkFail', {title: 'Check and ship: has problems', area: 'Check and ship', ms: 'M4', needs: 1}, () => checkPage({body: `
  ${verdict('bad', 'Has problems', '1 test failed: an expired reset link still works. Claude can fix this by itself.',
    `<div class="row wrap mt16">${btn('Let Claude fix it', {kind: 'primary', size: 'lg', go: 'fixing'})}<span class="muted small">Claude gets the failing output. 3 tries left.</span></div>`)}
  <div class="card flush mt24">
    <div class="row" style="padding:14px 18px;border-bottom:1px solid var(--border)"><span class="green">✓</span><span class="grow">Code style</span></div>
    <div style="padding:14px 18px;border-bottom:1px solid var(--border)"><div class="row"><span class="red">✕</span><span class="grow b">Tests · 1 failed, 318 passed</span><button class="link muted small" style="color:var(--muted)" data-tog="log">${ui('log') ? 'Hide output' : 'Show output'}</button></div>
      ${ui('log') ? `<div class="mt12">${codebox('FAILED tests/auth/test_password_reset.py::test_token_expires_after_30_min\n    freezer.tick(timedelta(minutes=31))\n>   assert r.status_code == 410\nE   AssertionError: assert 200 == 410')}</div>` : ''}</div>
    <div class="row" style="padding:14px 18px"><span class="green">✓</span><span class="grow">Type check</span></div>
  </div>
  ${emptyNote('Goals are checked after all tests pass, so no time or money is spent on unfinished work.')}
  <div class="mt24"><button class="btn ghost" style="padding:0 4px" data-tog="override">Think the test is wrong? Review anyway…</button>
    ${ui('override') ? `<div class="card mt12"><label class="label">Why move on? This goes into the pull request.</label><textarea class="textarea" rows="2" placeholder="e.g. CI runs in UTC; the test fixture freezes local time. T-0019 fixes it."></textarea><div class="mt12">${btn('Review with a failed check', {go: 'check'})}</div></div>` : ''}</div>`,
  bar: `<button class="btn lg" disabled>Approve after the fix</button>`}));

/* ---------- done ---------- */
view('done', {title: 'Done: pull request created', area: 'Done', ms: 'M5 M6 M10', needs: 1}, () => {
  const l = ui('lessons', 'ask'), wb = ui('writeBack', 'ask');
  return page(`
    <span class="bigmark green" style="width:60px;height:60px;margin-top:20px">${I.check(28)}</span>
    <h1 style="font-size:34px;margin:20px 0 6px">Pull request #118 is open</h1>
    <p class="lead" style="margin:0 0 22px">Add password reset API is done. Your teammates can review it on GitHub.</p>
    <div class="row wrap">${btn('Open on GitHub', {kind: 'primary', size: 'lg', act: 'toast', arg: 'Opens github.com/ankit/acme-billing/pull/118'})}${btn('Copy link', {size: 'lg', act: 'toast', arg: 'Link copied'})}${btn('Back to tasks', {size: 'lg', go: 'home'})}</div>
    <div class="grid muted mt24" style="gap:8px">
      <div><span class="green">✓</span>  Saved 6 files as one commit</div>
      <div><span class="green">✓</span>  Pushed branch <code>${D.task.branch}</code> (not main)</div>
      <div><span class="green">✓</span>  Opened PR #118 into main, with the goal and check results in the description</div>
    </div>
    <div class="card pad-lg mt24" style="border-radius:22px">
      ${wb === 'ask' ? `<div class="row top wrap"><div class="grow" style="min-width:240px"><div class="b" style="font-size:17px">Update Jira? <span class="tag">ACME-142</span></div><div class="muted">Move it to <b>In Review</b> and add a comment with the PR link.</div></div><div class="row tight">${btn('Send to Jira', {kind: 'soft', set: {writeBack: 'sent'}})}${btn('Skip', {kind: 'ghost', set: {writeBack: 'skip'}})}</div></div>` :
        wb === 'sent' ? '<div class="green b">✓ ACME-142 moved to In Review. Comment added with the PR link.</div>' : '<div class="muted">Jira not changed.</div>'}
    </div>
    <div class="card pad-lg mt16" style="border-radius:22px">
      ${l === 'ask' ? `<div class="b" style="font-size:17px">Lessons learned <span class="faint small" style="font-weight:400">· optional</span></div>
        <div class="muted" style="margin:4px 0 14px">Claude suggests remembering these for future tasks in this project:</div>
        <ul style="margin:0 0 16px;padding-left:20px;display:grid;gap:6px"><li>Use timezone-aware UTC times in expiry checks.</li><li>Hash reset tokens before saving; compare with hmac.compare_digest.</li></ul>
        <div class="row wrap">${btn('Save both', {kind: 'soft', set: {lessons: 'saved'}})}${btn('Edit first', {go: 'noteEdit'})}${btn('Skip', {kind: 'ghost', set: {lessons: 'skip'}})}</div>` :
        l === 'saved' ? '<div class="green b">✓ Saved 2 lessons. <a data-go="notes" style="font-weight:500">See lessons and notes</a></div>' : '<div class="muted">Skipped. Nothing was saved.</div>'}
    </div>
    ${emptyNote("Claude's working copy for this task is cleaned up in 7 days. The branch stays. <a>Clean up now</a>")}
  `, 'narrow');
});
