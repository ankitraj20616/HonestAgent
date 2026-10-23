/* Settings: one frame with a tab row (General · Agents · Project · Safety and cost · Jira · Health · About).
   Settings save by themselves (they live in the background service, so the CLI sees the same values).
   Helpers here start with "st" so they never clash with other view files. */

const ST_TABS = [['settings', 'General'], ['settingsAgents', 'Agents'], ['settingsProject', 'Project'], ['safety', 'Safety and cost'], ['settingsJira', 'Jira'], ['settingsHealth', 'Health'], ['settingsAbout', 'About']];

function stFrame(cur, body, o = {}) {
  return page(`${back('← Home', 'home')}
    <div class="row wrap" style="margin-bottom:16px"><h1 class="grow" style="margin:0">Settings</h1>${o.right || '<span class="faint small">Changes save by themselves</span>'}</div>
    <div class="row wrap tight" style="margin-bottom:26px">${ST_TABS.map(([id, l]) => `<button class="pill ${id === cur ? 'on' : ''}" data-go="${id}">${l}</button>`).join('')}</div>
    ${body}`);
}
/* One settings row: label + help on the left, the control on the right. */
function stRow(label, help, control, o = {}) {
  return `<div class="item" style="padding:16px 20px;${o.top ? 'align-items:flex-start' : ''}"><div class="grow" style="min-width:200px"><div style="font-weight:600">${label}</div>${help ? `<div class="muted small">${help}</div>` : ''}</div><div class="none row tight">${control}</div></div>`;
}
function stSection(title, rows, note = '') {
  return `<h2 style="margin:0 0 10px;font-size:18px">${title}</h2><div class="card flush list" style="margin-bottom:${note ? 8 : 28}px">${rows}</div>${note ? `<div class="faint small" style="margin:0 4px 28px">${note}</div>` : ''}`;
}
/* A chip whose dot has the chip's own colour (core chip() dots are always amber). */
function stChip(text, tone) { return `<span class="chip ${tone}"><span class="dot" style="width:7px;height:7px;background:currentColor"></span>${text}</span>`; }
function stCopy(cmd, key) {
  return `<div class="row" style="height:42px;padding:0 6px 0 14px;border-radius:14px;background:var(--code-bg);border:1px solid var(--border)"><code class="grow">${cmd}</code>${btn(ui(key) ? 'Copied' : 'Copy', {size: 'xs', kind: 'surface', set: {[key]: true}})}</div>`;
}

/* ---------- General (M3) ---------- */
view('settings', {title: 'Settings: General', area: 'Settings', ms: 'M3'}, () => {
  const n = ui('parallel', 4);
  return stFrame('settings', `
    ${stSection('Look and feel', `
      ${stRow('Theme', 'Dark is the default. The terminal and the code view follow it.', seg([['dark', 'Dark', S.theme === 'dark' ? {} : {act: 'toggleTheme'}], ['light', 'Light', S.theme === 'light' ? {} : {act: 'toggleTheme'}]], S.theme))}
      ${stRow('Default agent', 'Used for new tasks. You can pick another one on any task.', seg(D.agents.map(a => [a.id, a.ok ? a.short : `<span class="faint">${a.short}</span>`, a.ok ? {act: 'setAgent', arg: a.id} : {disabled: true, title: 'Log in to Codex first (Settings → Agents)'}]), S.agent))}`)}
    ${stSection('Working', `
      ${stRow('Open files in', '<code>{path}</code> and <code>{line}</code> are filled in. If empty: Linux <code>xdg-open</code>, macOS <code>open -t</code>, Windows <code>start</code>.',
        `<input class="input mono" style="width:280px;font-size:14px" value="code --goto {path}:{line}">`, {top: true})}
      ${stRow('Tasks running at once', 'More tasks wait in line and start by themselves.',
        `${btn('−', {size: 'sm', act: 'stStep', arg: -1})}<span class="display b" style="width:32px;text-align:center;font-size:18px">${n}</span>${btn('+', {size: 'sm', act: 'stStep', arg: 1})}`)}
      ${stRow('Quick new task from any app', 'Opens a small box over any window. On macOS: <span class="kbd">Cmd Option N</span>.',
        `<span class="kbd" style="font-size:13px;padding:5px 10px">Ctrl Alt N</span>${btn('Change', {size: 'sm', kind: 'ghost', act: 'toast', arg: 'Press the new keys…'})}`)}`)}
    ${stSection('System', `
      ${stRow('Start Saarthi when I log in', 'The background service starts too, so tasks keep running when the window is closed.', toggle(ui('autostart', true), {set: {autostart: !ui('autostart', true)}}))}
      ${stRow('Notifications', 'When an agent needs you, or a task is ready for review.', toggle(ui('notify', true), {set: {notify: !ui('notify', true)}}))}`,
      'The CLI sees the same values: <code>saarthi settings set parallel_runs 4</code>.')}
  `);
});
A.stStep = el => { S.ui.parallel = Math.max(1, Math.min(16, ui('parallel', 4) + +el.dataset.arg)); };

/* ---------- Agents (M3 M7) ---------- */
const ST_AGENTS = [
  {id: 'claude', name: 'Claude Code', ver: '2.1.12', path: '/usr/local/bin/claude', state: 'Logged in', ok: true, note: 'Default'},
  {id: 'codex', name: 'Codex', ver: '0.46.0', path: '~/.local/bin/codex', state: 'Installed, not logged in', ok: false, fix: 'codex login'},
  {id: 'gemini', name: 'Gemini CLI', ver: '0.9.0', path: '~/.nvm/versions/node/v22/bin/gemini', state: 'Logged in', ok: true, note: 'New'},
];
view('settingsAgents', {title: 'Settings: Agents', area: 'Settings', ms: 'M3 M7'}, () => {
  const tested = ui('tested') || {};
  return stFrame('settingsAgents', `
    <p class="muted" style="margin:0 0 16px">Saarthi runs these AI agents on your computer. Each one uses its own login; Saarthi never sees your password.</p>
    <div class="grid" style="gap:12px">${ST_AGENTS.map(a => `<div class="card" style="border-radius:20px;${S.agent === a.id ? 'border-color:var(--accent)' : ''}">
      <div class="row top wrap">
        <div class="grow" style="min-width:240px">
          <div class="row tight wrap"><span class="display b" style="font-size:18px">${a.name}</span>${stChip(a.state, a.ok ? 'green' : 'accent')}${a.note === 'New' ? chip('New', 'blue') : ''}</div>
          <div class="faint small mono" style="margin-top:4px">${a.ver} · ${a.path}</div>
        </div>
        <div class="row tight">
          <label class="radio row tight ${S.agent === a.id ? 'on' : ''}" style="padding:7px 14px;${a.ok ? '' : 'opacity:.45;cursor:not-allowed'}" ${a.ok ? `data-act="setAgent" data-arg="${a.id}"` : 'title="Log in first"'}>
            <span class="sdot" style="${S.agent === a.id ? 'background:var(--accent);border-color:var(--accent)' : ''}"></span><span class="small" style="font-weight:500">Use for new tasks</span></label>
          ${btn(tested[a.id] ? (a.ok ? '✓ Works' : 'Not logged in') : 'Test it', {size: 'sm', kind: 'surface', act: 'stTest', arg: a.id})}
        </div>
      </div>
      ${a.fix ? `<div class="mt16" style="max-width:520px"><div class="muted small mb8">Run this in a terminal and follow the steps. Then press Test it.</div>${stCopy(a.fix, 'copiedCodex')}</div>` : ''}
      ${tested[a.id] && a.ok ? `<div class="green small mt12">${I.check(14)} Answered a test prompt in 2.1 s. Streaming works.</div>` : ''}
    </div>`).join('')}
      <div class="card dashed row wrap" style="border-radius:20px">
        <div class="grow" style="min-width:240px"><div class="b">+ Add another agent</div><div class="muted small">Coming later. Each agent needs its own adapter inside Saarthi, so you can't add one here yet. Claude Code, Codex and Gemini CLI are supported now.</div></div>
        <button class="btn sm" disabled>Later</button>
      </div>
    </div>
    ${emptyNote('Saarthi finds agents on your PATH. Installed a new one? Press Test it, or run <code>saarthi doctor</code>.')}
  `);
});
A.stTest = el => { S.ui.tested = {...(ui('tested') || {}), [el.dataset.arg]: true}; };

/* ---------- Project (M4 M6) ---------- */
const ST_CHECK_NAME = c => /ruff|lint/.test(c) ? 'Code style' : /pytest|npm test/.test(c) ? 'Tests' : /pyright|tsc/.test(c) ? 'Type check' : /build/.test(c) ? 'Build' : 'Check';
view('settingsProject', {title: 'Settings: Project', area: 'Settings', ms: 'M4 M6'}, () => {
  const pid = ui('proj', S.project === 'all' ? 'acme-billing' : S.project), p = D.projects.find(x => x.id === pid) || D.projects[0];
  const extra = ui('extraChecks') || [];
  const checks = p.checks.concat(extra);
  const reads = [['CLAUDE.md', '3 KB'], ['core_docs/memory/lessons.md', '2 KB'], ['core_docs/decisions/', '14 KB'], ['core_docs/plans/', '10 KB']];
  return stFrame('settingsProject', `
    <div class="row wrap" style="margin-bottom:20px"><span class="b">Project</span>${seg(D.projects.map(x => [x.id, x.id, {set: {proj: x.id, optional: {}, extraChecks: []}}]), p.id)}
      <span class="faint small mono">${p.path}</span></div>
    ${stSection('Tests and checks', checks.map(c => {
      const optional = stIsOpt(p, c);
      return stRow(ST_CHECK_NAME(c), `<code>${esc(c)}</code>`, `<span class="small ${optional ? 'faint' : 'green'}" style="width:66px;text-align:right">${optional ? 'optional' : 'required'}</span>${toggle(!optional, {act: 'stReq', arg: c})}`);
    }).join('') + `<div class="item" style="padding:12px 20px"><input class="input mono grow" style="height:38px;font-size:14px" data-model="newCheck" value="${esc(ui('newCheck', ''))}" placeholder="Add a check, e.g. uv run pytest -q tests/e2e">${btn('Add check', {size: 'sm', act: 'stAddCheck'})}</div>`,
    'Required checks must pass before you review. Optional ones only show their result.')}
    ${stSection('Branches', `
      ${stRow('Branch name starts with', 'Each task gets its own branch, like <code>saarthi/T-0012-add-password-reset-api</code>. Saarthi never pushes to main.', `<input class="input mono" style="width:150px;font-size:14px" value="saarthi/">`)}
      ${stRow('Update from main by', 'When main moves on, the task gets the new commits this way.', seg([['rebase', 'Rebase', {set: {upd: 'rebase'}}], ['merge', 'Merge', {set: {upd: 'merge'}}]], ui('upd', 'rebase')))}`)}
    ${stSection('What agents read', reads.map(([f, s]) => `<div class="item" style="padding:11px 20px"><span class="okmark" style="width:22px;height:22px">${I.check(12)}</span><code class="grow">${f}</code><span class="faint small">${s}</span></div>`).join('') +
      stRow('Size limit', 'Bigger files are cut, and the agent is told so.', `<input class="input mono" style="width:100px;font-size:14px" value="32 KB">`),
      'Sent before each task, with the goal. See it per task in More → Details → What Claude reads.')}
    ${stSection('Jira', stRow('Jira project key', p.id === 'acme-billing' ? 'Tickets from ACME show for this project. <a data-go="settingsJira">Jira settings</a>' : 'No Jira project linked. <a data-go="settingsJira">Connect Jira</a>',
      `<input class="input mono" style="width:120px;font-size:14px" value="${p.id === 'acme-billing' ? 'ACME' : ''}" placeholder="e.g. ACME">`))}
    <div class="tile row wrap" style="border-radius:16px"><span class="grow small">These settings live in <code>${p.id}/.saarthi/project.toml</code>. Commit it, and your team gets the same checks and rules.</span>${btn('Open project.toml', {size: 'sm', act: 'toast', arg: 'Opened in your editor: code --goto .saarthi/project.toml'})}</div>
  `);
});
/* The third check of each project (type check or build) starts as optional; the rest are required. */
function stIsOpt(p, c) { const o = ui('optional') || {}; return c in o ? o[c] : p.checks.indexOf(c) === 2; }
A.stReq = el => { const c = el.dataset.arg, pid = ui('proj', S.project === 'all' ? 'acme-billing' : S.project), p = D.projects.find(x => x.id === pid) || D.projects[0];
  S.ui.optional = {...(ui('optional') || {}), [c]: !stIsOpt(p, c)}; };
A.stAddCheck = () => { const v = (ui('newCheck') || '').trim() || 'uv run pytest -q tests/e2e'; S.ui.extraChecks = [...(ui('extraChecks') || []), v]; S.ui.newCheck = ''; };

/* ---------- Safety and cost (M8) ---------- */
const ST_BLOCKED = [
  ['git push', 'Agents never push. Saarthi pushes the task branch itself, never to main.'],
  ['rm -rf /  ·  rm -rf ~', 'Deleting your disk or home folder.'],
  ['Reading ~/.ssh, ~/.aws, ~/.gnupg', 'Your keys. These folders are not even visible to the agent.'],
  ['Reading ~/.config/gh and git logins', 'Your GitHub and git passwords.'],
  ['sudo …', 'Anything as the system admin.'],
  ['curl … | sh', 'Running a script straight from the internet.'],
  ['psql … prod …', 'Touching the production database (added by this project).'],
  ['Changing .git/config and .git/hooks', 'Git settings stay read-only.'],
];
view('safety', {title: 'Settings: Safety and cost', area: 'Settings', ms: 'M8'}, () => {
  const lvl = ui('lvl', 'safe'), open = ui('blockedOpen');
  const lv = (id, name, d, o = {}) => `<div class="radio ${lvl === id ? 'on' : ''}" style="padding:16px 18px;border-radius:16px" ${o.go ? `data-go="${o.go}"` : `data-set='{"lvl":"${id}"}'`}>
    <div class="row tight"><span class="sdot" style="${lvl === id ? 'background:var(--accent);border-color:var(--accent)' : ''}"></span><span class="b grow">${name}</span>${o.tag || ''}</div>
    <div class="muted small" style="margin:4px 0 0 20px">${d}</div></div>`;
  return stFrame('safety', `
    ${ui('fullOn') ? `<div class="card green row mb16" style="padding:12px 18px;border-radius:16px">${I.check()}<span>Full access is on for <b>T-0031 Upgrade Alembic to 1.14</b> only. Other tasks stay on Safe.</span></div>` : ''}
    <h2 style="margin:0 0 10px;font-size:18px">What agents may do</h2>
    <div class="grid" style="gap:10px;margin-bottom:8px">
      ${lv('read', 'Read only', 'Reads files and changes nothing. Research and reviews always use this.')}
      ${lv('safe', 'Safe', 'Changes files only in its own copy of the repo. Runs allowed commands. Asks you before risky ones.', {tag: chip('Recommended', 'green')})}
      ${lv('full', 'Full access', 'Runs any command without asking, inside a sandbox. Turned on for one task at a time, never as a default.', {go: 'fullAccess', tag: '<span class="faint small">per task →</span>'})}
    </div>
    <div class="faint small" style="margin:0 4px 28px">On Windows, Full access is not offered yet: there is no sandbox there. Linux uses bwrap; macOS uses a sandbox profile.</div>

    <h2 style="margin:0 0 10px;font-size:18px">Always blocked</h2>
    <div class="card flush list" style="margin-bottom:28px">
      <button class="item" style="width:100%;border:none;background:none;cursor:pointer;text-align:left" data-tog="blockedOpen">
        <span class="badmark" style="width:24px;height:24px;font-size:13px">8</span><span class="grow"><b>8 rules</b> <span class="muted">· no agent can do these, in any mode</span></span><span class="faint small">${open ? 'Hide' : 'Show'} ${I.down()}</span></button>
      ${open ? ST_BLOCKED.map(([r, d]) => `<div class="item" style="padding:11px 20px"><code class="none" style="min-width:250px">${r}</code><span class="muted small grow">${d}</span></div>`).join('') +
        `<div class="item" style="padding:11px 20px"><span class="faint small grow">A project can add rules in <code>.saarthi/project.toml</code>, never remove them. Also always asked: <code>alembic downgrade</code>, <code>docker compose down -v</code>.</span></div>` : ''}
    </div>

    <h2 style="margin:0 0 10px;font-size:18px">Spending</h2>
    <div class="card" style="margin-bottom:8px;border-radius:20px">
      <div class="row wrap" style="margin-bottom:10px"><span class="display b grow" style="font-size:22px">$4.12 <span class="muted" style="font-size:16px;font-weight:500">today of $10.00</span></span><span class="faint small">all projects · 9 runs</span></div>
      <div class="meter"><span style="width:41%"></span></div>
      <div class="row wrap mt16" style="gap:20px">
        <label class="row tight"><span class="small b">Per task</span><input class="input mono" style="width:110px;height:38px;font-size:14px" value="$3.00"></label>
        <label class="row tight"><span class="small b">Per day</span><input class="input mono" style="width:110px;height:38px;font-size:14px" value="$10.00"></label>
      </div>
    </div>
    <div class="faint small" style="margin:0 4px 28px">You get one warning when a limit is passed. Runs are never stopped. Codex often reports tokens only; then the cost is an estimate (~).</div>

    ${stSection('Secrets', stRow('Hide secrets', 'Values in <code>.env</code> files, and anything that looks like a key or password, become <code>****</code> before they are saved or sent to an agent.',
      `<span class="faint small">always on</span>${toggle(true)}`))}
  `);
});

overlay('fullAccess', () => {
  const v = (ui('confirmId') || '').trim().toUpperCase(), ok = v === 'T-0031';
  return dialog(`
    <div class="eyebrow">Safety · one task only</div>
    <h2 style="margin:0 0 6px;font-size:24px">Give Codex full access for this task?</h2>
    <div class="row tight wrap mb16"><span class="tag">T-0031</span><span class="muted">Upgrade Alembic to 1.14</span><span class="tag">saarthi</span></div>
    <p class="muted mb16">Codex can run any command without asking you, but only inside a sandbox, and only in its own copy of the repo. It applies from the next run.</p>
    <div class="card flush list mb16" style="border-radius:16px">
      ${okRow('Sandbox works on this computer', 'Linux · bwrap 0.9.0')}
      ${okRow('Your keys stay hidden', '~/.ssh · ~/.aws · other repos')}
      ${okRow('Codex still can\'t push', 'Saarthi pushes, never to main')}
    </div>
    <div class="faint small mb16">On macOS Saarthi uses a sandbox profile instead of bwrap. The network stays on, because the agent needs it.</div>
    <label class="label">Type the task ID to confirm</label>
    <input class="input mono" data-model="confirmId" data-live value="${esc(ui('confirmId', ''))}" placeholder="T-0031" style="${ok ? 'border-color:var(--green)' : ''}">
    <div class="row mt24" style="justify-content:flex-end">${btn('Cancel', {act: 'closeOverlay'})}${ok ? btn('Give full access for T-0031', {kind: 'primary', act: 'stFullOn'}) : '<button class="btn" disabled>Give full access for T-0031</button>'}</div>
  `, {mid: true});
});
view('fullAccess', {title: 'Settings: give full access (confirm)', area: 'Settings', ms: 'M8', base: 'safety', overlay: 'fullAccess'}, () => '');
A.stFullOn = () => { go('safety', {fullOn: true}); return false; };

/* ---------- Jira (M10) ---------- */
view('settingsJira', {title: 'Settings: Jira', area: 'Settings', ms: 'M10'}, () => {
  const t = ui('jiraTest');
  return stFrame('settingsJira', `
    <h2 style="margin:0 0 10px;font-size:18px">Jira Cloud</h2>
    <div class="card pad-lg" style="margin-bottom:28px">
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">
        <div><label class="label">Site</label><input class="input mono" style="font-size:14px" value="acme.atlassian.net"><div class="faint tiny mt8">Jira Cloud only. Saarthi talks only to this site, over HTTPS.</div></div>
        <div><label class="label">Email</label><input class="input" value="ankit@acme.dev"></div>
      </div>
      <label class="label mt16">API token</label>
      <div class="row"><div class="input mono row grow" style="font-size:14px;color:var(--muted)">••••••••••••••••••••3fA9</div>${btn('Replace', {act: 'toast', arg: 'Paste a new token. The old one is removed from the keychain.'})}</div>
      <div class="faint small mt8">Stored in your system keychain. Never in the repo, logs or events. Make one at id.atlassian.com → Security → API tokens.</div>
      <div class="row wrap mt24">${btn('Test connection', {kind: 'primary', set: {jiraTest: true}})}
        ${t ? `<span class="green row tight">${I.check()}<b>Connected as ankit@acme.dev</b><span class="faint small">· 312 ms · can read and change issues</span></span>` : '<span class="faint small">Last checked yesterday · connected</span>'}</div>
    </div>
    ${stSection('Which Jira project goes with which repo', `
      ${stRow('<span class="tag">ACME</span> &nbsp;Acme Billing', '6 tickets for you · sprint "Billing 14"', `<span class="faint small">→</span><select class="btn sm" style="min-width:160px"><option>acme-billing</option><option>saarthi</option><option>clinic-portal</option><option>none</option></select>`)}
      ${stRow('<span class="tag">CLINIC</span> &nbsp;Clinic Portal', 'Not used yet', `<span class="faint small">→</span><select class="btn sm" style="min-width:160px"><option>none</option><option>clinic-portal</option></select>`)}`,
      'Saved per repo in <code>.saarthi/project.toml</code> (key, no secrets).')}
    ${stSection('Changes to Jira', `
      ${stRow('When a task starts', '', '<span class="small">Move the ticket to <b>In Progress</b></span>')}
      ${stRow('When it is ready for review', '', '<span class="small">Move it to <b>In Review</b></span>')}
      ${stRow('When the pull request is open', '', '<span class="small">Add a comment with the PR link</span>')}
      ${stRow('Ask before every change in Jira', 'Each change is a card under Needs you: Send, Edit or Skip.', `<span class="faint small">always on</span>${toggle(true)}`)}`,
      'Saarthi only moves tickets forward. It never closes a ticket; merging the PR in GitHub does that.')}
    <div class="row">${btn('Forget this site', {kind: 'danger', size: 'sm', act: 'toast', arg: 'Removed the token from the keychain and the site from Saarthi.'})}<span class="faint small">Same as <code>saarthi jira logout</code></span></div>
  `);
});

/* ---------- Health (M3) ---------- */
view('settingsHealth', {title: 'Settings: Health', area: 'Settings', ms: 'M3'}, () => {
  const fixed = ui('codexFixed'), again = ui('again');
  return stFrame('settingsHealth', `
    <div class="card flush list" style="margin-bottom:8px">
      ${okRow('Background service', 'running · 127.0.0.1:7878 · started 09:12')}
      ${okRow('Git', '2.43.0')}
      ${okRow('Claude Code', '2.1.12 · logged in')}
      ${fixed ? okRow('Codex', '0.46.0 · logged in') : `<div class="item" style="align-items:flex-start;background:var(--red-soft)"><span class="badmark">!</span><div class="grow"><div style="font-weight:500">Codex <span class="faint small" style="font-weight:400">· 0.46.0</span></div>
        <div class="muted small mb8">Installed, but not logged in. Optional: only needed for tasks you give to Codex. Run this in a terminal:</div><div style="max-width:420px">${stCopy('codex login', 'copiedH')}</div></div>
        ${btn('Check again', {size: 'sm', kind: 'surface', set: {codexFixed: true}})}</div>`}
      ${okRow('Gemini CLI', '0.9.0 · logged in')}
      ${okRow('GitHub', 'gh 2.45.0 · logged in as ankit')}
      ${okRow('Sandbox for Full access', 'bwrap 0.9.0')}
      <div class="item"><span class="okmark">${I.check()}</span><div class="grow"><div style="font-weight:500">Disk space for working copies</div><div class="muted small">1.2 GB in 7 copies · 212 GB free · copies of shipped tasks are removed after 7 days</div></div>${btn('Clean up old copies', {size: 'sm', act: 'toast', arg: 'Removed 3 copies of shipped tasks. Freed 410 MB. Branches stay.'})}</div>
    </div>
    <div class="faint small" style="margin:0 4px 24px">${again ? 'Checked just now.' : 'Checked at 10:58.'} Same checks as <code>saarthi doctor</code> and the first-run setup.</div>
    <div class="row">${btn('Run all checks again', {kind: 'primary', set: {again: true}})}</div>
  `);
});

/* ---------- About (M9) ---------- */
view('settingsAbout', {title: 'Settings: About', area: 'Settings', ms: 'M9'}, () => {
  const os = ui('os', 'linux');
  const dirs = {linux: ['Linux', '~/.local/share/saarthi', '~/.config/saarthi'], mac: ['macOS', '~/Library/Application Support/Saarthi', '~/Library/Preferences/Saarthi'], win: ['Windows', '%LOCALAPPDATA%\\Saarthi', '%APPDATA%\\Saarthi']};
  const mem = (name, mb) => `<div><div class="row tight small"><span class="grow">${name}</span><b>${mb} MB</b><span class="faint">of 150</span></div><div class="meter mt8"><span style="width:${Math.round(mb / 1.5)}%;background:var(--green)"></span></div></div>`;
  return stFrame('settingsAbout', `
    <div class="card pad-lg row wrap" style="margin-bottom:28px;border-radius:22px;gap:18px">
      ${I.logo(48)}
      <div class="grow" style="min-width:220px"><div class="display b" style="font-size:24px">Saarthi 1.0.0</div><div class="muted">Tell the agent what you want. Check the proof. Ship.</div></div>
      <div class="row tight">${stChip(ui('upd') ? 'Up to date · checked just now' : 'Up to date', 'green')}${btn('Check for updates', {kind: 'primary', set: {upd: true}})}</div>
    </div>
    ${stSection('This computer', `
      ${stRow('System', 'Also available for macOS and Windows. One app, the same on every system.', '<span>Ubuntu 24.04 · x86_64</span>')}
      ${stRow('Versions', 'The app and the background service must match.', `<span class="small mono">app 1.0.0 · service 1.0.0</span>${chip('match', 'green')}`)}
      ${stRow('Installer size', 'We keep it under 40 MB. No bundled browser.', '<span class="b">31 MB</span>')}`)}
    <h2 style="margin:0 0 10px;font-size:18px">Memory use now</h2>
    <div class="card" style="margin-bottom:8px"><div class="grid cols">${mem('App window', 96)}${mem('Background service', 88)}</div></div>
    <div class="faint small" style="margin:0 4px 28px">We promise light: under 150 MB each when idle, and the app opens in under 2 s.</div>
    <h2 style="margin:0 0 10px;font-size:18px">Where your data lives</h2>
    <div class="card" style="margin-bottom:28px">
      <div class="row wrap" style="margin-bottom:14px">${seg([['linux', 'Linux'], ['mac', 'macOS'], ['win', 'Windows']].map(([id, l]) => [id, l + (id === 'linux' ? ' · this one' : ''), {set: {os: id}}]), os)}</div>
      <div class="grid" style="gap:8px">
        <div class="row"><span class="small b" style="width:90px">Data</span><code class="grow">${dirs[os][1]}</code></div>
        <div class="row"><span class="small b" style="width:90px">Settings</span><code class="grow">${dirs[os][2]}</code></div>
        <div class="row"><span class="small b" style="width:90px">Copies</span><code class="grow">${dirs[os][1]}${os === 'win' ? '\\worktrees' : '/worktrees'}</code></div>
      </div>
      <div class="row wrap mt16">${btn('Open data folder', {size: 'sm', act: 'toast', arg: 'Opens ' + dirs.linux[1]})}${btn('Copy versions', {size: 'sm', act: 'toast', arg: 'Copied: Saarthi 1.0.0 · service 1.0.0 · Ubuntu 24.04'})}</div>
    </div>
    ${stSection('More', `
      ${stRow('Run setup again', 'Checks your tools and logins, and lets you add a project.', btn('Re-run setup', {size: 'sm', go: 'setup1'}))}
      ${stRow('Open-source licences', 'Saarthi uses Tauri, React, FastAPI, SQLAlchemy, xterm.js, CodeMirror and more.', btn('Show licences', {size: 'sm', kind: 'ghost', act: 'toast', arg: 'Opens the list of licences'}))}
      ${stRow('Test mode', 'Start with <code>saarthi --test-mode</code> to try Saarthi with a fake agent and a sample project. Nothing real changes, and a yellow strip shows at the top.', '<span class="faint small">off</span>', {top: true})}`)}
  `);
});
