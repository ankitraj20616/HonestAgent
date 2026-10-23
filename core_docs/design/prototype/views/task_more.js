/* Task page states (to do, research, plan, fix limit, safety ask, budget, conflict),
   Task → More views (terminal, docs, history, restore, details, what Claude reads),
   Check and ship extras (comment on a line, edit pull request text) and Side by side. */

/* ---------- helpers for this file ---------- */
/* taskPage() reads D.task. For another task, swap it in only while the page is built. */
function tmTask(over, o) {
  const keep = D.task;
  D.task = {...keep, ...over};
  try { return taskPage(o); } finally { D.task = keep; }
}
function tmTicket(key, state) { return `<button class="tag" style="cursor:pointer;background:none;margin-left:4px" data-go="tickets" title="Linked Jira ticket">${key} · ${state}</button>`; }
function tmBar(left, buttons) {
  return `<div class="sticky box"><span class="grow muted small" style="min-width:220px">${left}</span>${buttons}</div>`;
}
/* Open a view and show a toast there (S.ui resets on a view change, so the toast rides in the start state). */
function tmGoToast(id, msg) {
  go(id, {toast: msg});
  setTimeout(() => { if (S.ui.toast === msg) set({toast: null}); }, 3200);
  return false;
}
function tmFeed(rows) { return `<div class="feed">${rows.map(([time, html]) => `<div><span class="t">${time}</span><span class="e">${html}</span></div>`).join('')}</div>`; }
const tmNow = text => ['now', `<span class="row tight blue"><span class="spin"></span>${text}</span>`];
A.tmJump = el => { const h = document.getElementById(el.dataset.arg); if (h) h.scrollIntoView({behavior: 'smooth', block: 'start'}); return false; };

/* Other tasks of the story (D.tasks) as full task objects */
const TM = {
  csv: {id: 'T-0033', title: 'Export invoices as CSV', repo: 'acme-billing', ticket: 'ACME-151',
    goal: 'Finance can download the invoices of a date range as one CSV file. Today they copy rows from the admin page by hand.',
    done: ['A "Download CSV" button on the invoices page', 'One row per invoice: number, date, customer, total, VAT and status', 'The date range filters the rows; no range means this month', 'A range of 50,000 invoices downloads without timing out', 'Tests cover the columns and the date filter']},
  replay: {id: 'T-0027', title: 'Event replay after reconnect', repo: 'saarthi', agent: 'Codex',
    goal: 'After the app reconnects to the background service, it gets every event it missed, in order, with no gaps and no doubles.',
    done: ['The app sends the last event id it saw when it reconnects', 'The service sends every newer event, oldest first', 'No event is sent twice, even when two reconnects overlap', 'Replaying 10,000 events takes under 1 second', 'Tests cover reconnect, overlap and an empty replay']},
  alembic: {id: 'T-0031', title: 'Upgrade Alembic to 1.14', repo: 'saarthi', agent: 'Codex',
    goal: 'Move the service to Alembic 1.14 to get the new autogenerate fixes. Every migration still runs on an empty database.',
    done: ['pyproject.toml asks for alembic 1.14 or newer', 'uv.lock is refreshed', 'All migrations run on an empty database', 'alembic check finds no drift', 'All tests pass']},
  pdf: {id: 'T-0018', title: 'Invoice PDF export with line-item totals', repo: 'acme-billing', ticket: 'ACME-147',
    goal: 'Customers can download an invoice as a PDF that shows each line item, its tax, and the totals.',
    done: ['A "Download PDF" link on every invoice', 'Each line item shows quantity, price, tax and line total', 'Totals match the invoice in the database to the cent', 'The PDF has the Acme logo and the VAT number', 'Tests cover rounding and an invoice with 200 lines']},
  search: {id: 'T-0021', title: 'Faster invoice search', repo: 'acme-billing',
    goal: 'Searching invoices by number, customer or email answers in under 100 ms with 200,000 invoices. Today it takes about 840 ms.',
    done: ['Search by invoice number, customer name or email', 'Slowest 5% of searches under 100 ms on the 200,000-invoice test data', 'Same results as today, in the same order', 'Partial words work, like "acme" or "INV-004"', 'Tests cover each search field']},
};

/* ---------- To do: not started yet ---------- */
view('todoTask', {title: 'Task: to do, not started', area: 'Task page', ms: 'M3'}, () => {
  const t = TM.csv, how = ui('how', 'build'), a = agentShort();
  return tmTask({...t, agent: a}, {
    status: ['neutral', 'To do'], statusText: `Goal ready · not started ${tmTicket(t.ticket, 'To Do')}`, noTicket: true, right: '', noGoal: true, sticky: false,
    top: `<div class="card pad-lg mt24">
      <div class="row wrap" style="margin-bottom:8px"><label class="label grow" style="margin:0">Goal</label><span class="faint small">${a} drafted this from ${t.ticket}. Change anything.</span></div>
      <textarea class="textarea" rows="2">${esc(t.goal)}</textarea>
      <label class="label" style="margin:20px 0 4px">What done looks like</label>
      <div class="faint small mb8">${a} checks each of these before you review.</div>
      <div class="col" style="gap:8px">${t.done.map(d => `<div class="row"><span class="check"></span><input value="${esc(d)}" style="flex:1;border:none;border-bottom:1px solid var(--border);background:transparent;padding:6px 0;outline:none"></div>`).join('')}
        <button class="link" style="align-self:flex-start;padding:6px 0" data-act="toast" data-arg="Added an empty line. Type what done looks like.">+ Add one</button></div>
      <div class="divider" style="margin:22px 0 18px"></div>
      <div class="row wrap"><div class="grow" style="min-width:220px"><div class="b">Who works on it</div><div class="muted small">${a} works in its own copy of the repo. Your main branch is never touched.</div></div>${agentMenu()}</div>
      <div class="b" style="margin:18px 0 8px">How should ${a} work?</div>
      <div class="row wrap tight">${[['build', 'Build it'], ['plan', 'Plan first, wait for my OK'], ['research', 'Just research, no code'], ['bug', 'Fix a bug, test first']].map(([id, l]) => `<button class="pill ${how === id ? 'on' : ''}" data-set='{"how":"${id}"}'>${l}</button>`).join('')}</div>
    </div>`,
    body: `${tmFeed([['Mon', `Made from Jira <b>${t.ticket}</b> by you`], ['Mon', `${a} drafted the goal and 5 things to be done`], ['', '<span class="faint">Nothing has run yet. No copy of the repo is made until you start.</span>']])}
      ${tmBar('Budget for this task: $3.00 · <a data-go="safety">Safety and cost</a>', `${btn('Save', {act: 'toast', arg: 'Saved. The task stays in To do.'})}${btn(how === 'research' ? 'Start research' : how === 'plan' ? 'Start planning' : 'Start', {kind: 'primary', size: 'lg', go: how === 'research' ? 'research' : how === 'plan' ? 'planReview' : 'work'})}`)}`,
  });
});

/* ---------- Just research, no code ---------- */
const TM_FINDINGS = [
  {t: 'Tax rates are read from the database for every invoice line', d: 'get_rate() runs one query per line. A 40-line invoice makes 40 queries: about 180 ms of the 260 ms it takes to build.', files: ['app/billing/tax.py', 'app/billing/invoice.py']},
  {t: 'Rates change rarely, and only through one admin route', d: 'Only PUT /admin/tax-rates/{region} writes them, about once a month. Clearing the cache there is enough to keep it correct.', files: ['app/admin/tax_rates.py']},
  {t: "There is no Redis, so a cache inside the app fits best", d: 'docker-compose.yml runs only Postgres. A small in-memory cache per region, with a 1 hour expiry, needs no new service.', files: ['docker-compose.yml'],
    links: [['cachetools · TTLCache', 'cachetools.readthedocs.io'], ['functools.lru_cache', 'docs.python.org']]},
];
view('research', {title: 'Task: just research, no code', area: 'Task page', ms: 'M6'}, () => tmTask({id: 'T-0015', title: 'Cache tax rates per region'}, {
  status: ['blue', 'Researching', {spin: true}], statusText: 'Claude is reading the code · read-only, it changes nothing · 4 min', noTicket: true, noGoal: true, sticky: false,
  right: btn('Stop', {act: 'toast', arg: 'Research stopped. The findings so far are kept.'}),
  top: `<div class="card blue row mt24" style="border-radius:18px;padding:14px 20px"><span class="blue b none">Just research</span><span class="grow small" style="color:var(--text)">Claude reads the code and writes down what it finds. It can't change files. Use the findings to make a goal.</span></div>`,
  body: `<div class="row" style="margin:4px 0 12px"><h2 class="grow" style="margin:0;font-size:19px">What Claude found <span class="faint" style="font-weight:500;font-size:15px">· ${TM_FINDINGS.length} so far</span></h2><span class="faint small">Switch one off to leave it out of the goal</span></div>
    <div class="grid" style="gap:10px">${TM_FINDINGS.map((f, i) => { const off = ui('foff' + i); return `<div class="card" style="border-radius:18px;padding:18px 20px;${off ? 'opacity:.55' : ''}">
      <div class="row top"><div class="grow"><div class="b" style="font-size:16px">${esc(f.t)}</div><div class="muted" style="margin-top:4px">${esc(f.d)}</div></div>
        <label class="row tight faint small none" style="cursor:pointer" data-tog="foff${i}">${toggle(!off)} Use</label></div>
      <div class="row wrap tight mt12">${f.files.map(p => `<span class="tag">${p}</span>`).join('')}${(f.links || []).map(([l, h]) => `<a class="small" data-act="toast" data-arg="Opens ${h} in your browser">${l} ↗</a>`).join('')}</div>
    </div>`; }).join('')}
      <div class="card dashed row" style="border-radius:18px;padding:14px 20px"><span class="spin"></span><span class="grow muted">Checking how the tests set tax rates…</span><span class="faint small">tests/billing/</span></div>
    </div>
    <h2 style="font-size:19px;margin:28px 0 4px">Your notes</h2>
    <div class="faint small mb8">Things Claude should know. They go into the goal with the findings.</div>
    <textarea class="textarea" rows="3" data-model="rnotes" placeholder="e.g. Finance updates EU rates on the 1st of each month. A cache older than 1 hour is fine.">${esc(ui('rnotes', ''))}</textarea>
    <div class="row tight mt8">${btn('+ Add a link', {size: 'sm', kind: 'ghost', act: 'toast', arg: 'Paste a link. Saarthi saves its title for Claude.'})}${btn('+ Add a snippet', {size: 'sm', kind: 'ghost', act: 'toast', arg: 'Paste a log or code snippet. Long ones are cut to 8,000 characters.'})}</div>
    ${tmBar('Claude is still reading. You can make the goal now, or wait.', btn('Make a goal from this', {kind: 'primary', size: 'lg', go: 'newTask'}))}`,
}));

/* ---------- Plan first, wait for my OK ---------- */
view('planReview', {title: 'Task: plan ready, waiting for your OK', area: 'Task page', ms: 'M6'}, () => taskPage({
  status: ['accent', 'Needs you', {dot: true}], statusText: 'Claude wrote a plan and is waiting for your OK', activityGo: 'planReview', right: '',
  top: `<section class="askbox">
    <div class="b accent mb8">Claude made a plan · 2 min ago · nothing is built until you say OK</div>
    <div class="q">Is this plan OK? 5 steps, 2 risks, 1 open question.</div>
    <div class="muted mt8">Read it below. When you approve, Claude builds it in its own copy of the repo. The plan is also saved in Docs.</div>
    <div class="row wrap mt16">${btn('Approve plan and build', {kind: 'primary', size: 'lg', go: 'work'})}${btn('Ask for changes', {size: 'lg', kind: 'surface', tog: 'planAsk'})}</div>
    ${ui('planAsk') ? `<div class="row mt12"><input class="input grow" placeholder="e.g. Use the existing mail queue, and skip step 4 for now">${btn('Send to Claude', {kind: 'surface', act: 'toast', arg: 'Sent. Claude will write plan version 2.'})}</div>` : ''}
  </section>`,
  body: `<div class="card pad-lg" style="border-radius:20px">
    <div class="row wrap" style="margin-bottom:14px"><span class="tag">plan-01.md</span><span class="faint small grow">From the plan run R-0026 · 10:26</span>${btn('Open in Docs', {size: 'xs', go: 'docs'})}</div>
    ${md(D.planMd)}</div>`,
}));

/* ---------- fix tries used up ---------- */
view('fixLimit', {title: 'Task: agent could not fix it in 3 tries', area: 'Task page', ms: 'M4'}, () => {
  const t = TM.replay, who = ui('hintAgent', 'Codex');
  return tmTask(t, {
    status: ['red', 'Needs you', {dot: true}], statusText: 'Codex stopped after 3 tries. The same test still fails.', noTicket: true, right: '', activityGo: 'fixLimit',
    top: `<section class="card red mt24" style="padding:22px 24px;border-radius:24px">
      <div class="row top"><span class="bigmark red">!</span>
        <div class="grow"><div class="display b" style="font-size:24px">Codex could not fix the failing test in 3 tries</div>
          <div style="font-size:16px;margin-top:2px">The same test fails every time: <code>test_replay_has_no_gaps</code>. Nothing else is broken.</div>
          <button class="link mt8" style="color:inherit;opacity:.85;font-weight:500" data-tog="tries">${ui('tries') ? 'Hide what Codex tried' : 'What Codex tried ▾'}</button>
          ${ui('tries') ? `<div class="grid mt12" style="gap:6px">
            ${[['Try 1 · 11:04', 'Sorted events by id before sending them'], ['Try 2 · 11:10', 'Kept the last seen id for each window'], ['Try 3 · 11:17', 'Put a lock around the replay']].map(([w, d]) => `<div class="row tight"><span class="red">✕</span><span class="grow">${d}</span><span class="faint small">${w}</span></div>`).join('')}
            <div class="mt8">${codebox('FAILED tests/test_events.py::test_replay_has_no_gaps\n    ids = [e.id for e in replay(since_id=41)]\n>   assert ids == list(range(42, 61))\nE   AssertionError: event 42 is missing')}</div></div>` : ''}
        </div></div></section>
    <h2 style="margin-bottom:12px">What next?</h2>
    <div class="card flush list" style="border-radius:20px">
      <div class="item" style="display:block;padding:18px 20px">
        <div class="b" style="font-size:16px">Try again with a hint</div>
        <div class="muted small" style="margin:2px 0 12px">One more try. A hint, or a fresh look from another agent, often helps.</div>
        <input class="input" data-model="hint" value="${esc(ui('hint', ''))}" placeholder="e.g. since_id is compared with > in one place and >= in another">
        <div class="row wrap mt12"><span class="muted small">Who tries</span>${seg([['Codex', 'Codex', {set: {hintAgent: 'Codex'}}], ['Claude', 'Claude · fresh look', {set: {hintAgent: 'Claude'}}]], who)}<span class="grow"></span>${btn(`Let ${who} try once more`, {kind: 'primary', act: 'toast', arg: `${who} is trying again with your hint. Try 4 of 4.`})}</div>
      </div>
      <div class="item" style="padding:16px 20px"><div class="grow"><div class="b" style="font-size:16px">Take over in the terminal</div><div class="muted small">Work in the task's copy of the repo yourself. The checks run again when you're done.</div></div>${btn('Open the terminal', {kind: 'surface', go: 'terminal'})}</div>
      <div class="item" style="display:block;padding:16px 20px">
        <div class="row"><div class="grow"><div class="b" style="font-size:16px">Review anyway…</div><div class="muted small">Think the test is wrong? Move on with a failed check and say why.</div></div>${btn(ui('anyway') ? 'Cancel' : 'Review anyway…', {kind: 'surface', tog: 'anyway'})}</div>
        ${ui('anyway') ? `<div class="mt12"><label class="label">Why move on? This goes into the pull request.</label><textarea class="textarea" rows="2" placeholder="e.g. The test starts at id 41, but the fixture makes ids from 43. T-0029 fixes the fixture."></textarea><div class="mt12">${btn('Review with a failed check', {go: 'check'})}</div></div>` : ''}
      </div>
    </div>
    ${emptyNote('Max tries before Saarthi asks you: 3. Change it in <a data-go="settingsProject">project settings</a>.')}`,
    body: tmFeed([['10:58', 'Codex finished the change · 3 files'], ['11:02', '<span class="red">✕</span> 1 test failed: event 42 is missing after a reconnect'], ['11:04', 'Try 1: sorted events by id · <span class="red">still fails</span>'], ['11:10', 'Try 2: kept the last seen id for each window · <span class="red">still fails</span>'], ['11:17', 'Try 3: put a lock around the replay · <span class="red">still fails</span>'], ['11:18', 'Codex stopped and asked you what to do']]),
  });
});

/* ---------- agent asks to run a risky command ---------- */
view('safetyAsk', {title: 'Task: agent asks to run a command', area: 'Task page', ms: 'M8'}, () => {
  const t = TM.alembic, ans = ui('ans');
  const done = {
    once: ['green', 'Allowed once. Codex is running <code>uv lock --upgrade</code>…'],
    always: ['green', 'Saved. In saarthi, agents may now run <code>uv lock</code> without asking. Change it in <a data-go="safety">Safety and cost</a>.'],
    no: ['muted', 'Not allowed. Codex was told and will look for another way.'],
  }[ans];
  return tmTask(t, {
    status: ans && ans !== 'no' ? ['blue', 'Working', {spin: true}] : ['accent', 'Needs you', {dot: true}],
    statusText: ans ? 'Codex is working again' : 'Codex is paused, waiting for your OK', noTicket: true, activityGo: 'safetyAsk',
    top: ans ? `<div class="card mt24 row" style="border-radius:20px;padding:16px 20px"><span class="${done[0]}">${done[0] === 'green' ? '✓' : '–'}</span><span class="grow">${done[1]}</span>${btn('Undo', {size: 'sm', kind: 'ghost', set: {ans: null}})}</div>` :
    `<section class="askbox">
      <div class="b accent mb8">Codex wants to run a command · 9 min ago · paused until you answer</div>
      <div class="q">Can Codex run this command?</div>
      <div class="row mt12" style="height:48px;padding:0 6px 0 16px;border-radius:14px;background:var(--code-bg);border:1px solid var(--border)"><code class="grow" style="font-size:15px">uv lock --upgrade</code><span class="flag">Changes uv.lock</span><span class="flag" style="margin-right:6px">Uses the network</span></div>
      <div class="muted mt12">Codex says: "Alembic 1.14 needs a newer SQLAlchemy. I need to refresh the lock file to get both." It downloads from pypi.org and changes <code>uv.lock</code> in its own copy of the repo.</div>
      <div class="row wrap mt16">${btn('Allow once', {kind: 'primary', size: 'lg', set: {ans: 'once'}})}${btn('Always allow in this project', {size: 'lg', kind: 'surface', set: {ans: 'always'}})}${btn("Don't allow", {size: 'lg', kind: 'ghost', set: {ans: 'no'}})}</div>
      <div class="small muted mt16">Asked because of your setting <b style="color:var(--text)">Safe</b>: asks before commands that change lock files or use the network. <a data-go="safety">Change</a></div>
    </section>`,
    baseFeed: false,
    feed: [['10:31', 'Started working in its own copy of the repo'], ['10:33', 'Read <code>pyproject.toml</code> and <code>migrations/env.py</code>'], ['10:35', 'Changed <code>pyproject.toml</code>: alembic 1.13 → 1.14'], ['10:36', ans ? `You answered: <b>${{once: 'Allow once', always: 'Always allow in this project', no: "Don't allow"}[ans]}</b>` : '<span class="accent">Asked to run <code>uv lock --upgrade</code></span>']].concat(ans === 'once' || ans === 'always' ? [tmNow('Running uv lock --upgrade…')] : []),
  });
});

/* ---------- budget passed (soft warning, runs never stop) ---------- */
view('budgetWarn', {title: 'Task: budget passed (soft warning)', area: 'Task page', ms: 'M8'}, () => {
  const t = TM.pdf, st = ui('bud');
  return tmTask(t, {
    statusText: `Claude is still working · 41 min ${tmTicket(t.ticket, 'In Progress')}`, noTicket: true,
    right: '',
    top: st === 'kept' ? `<div class="card mt24 row" style="border-radius:20px;padding:16px 20px"><span class="green">✓</span><span class="grow">OK, Claude keeps going. We'll tell you again at $6.00, twice the budget.</span>${btn('Undo', {size: 'sm', kind: 'ghost', set: {bud: null}})}</div>` :
    `<section class="card accent mt24" style="padding:22px 24px;border-radius:24px;border:1px solid var(--accent)">
      <div class="row top"><span class="bigmark accent">$</span>
        <div class="grow"><div class="display b" style="font-size:22px">This task passed its budget</div>
          <div style="font-size:16px;margin-top:2px">$3.12 spent of the $3.00 budget. Claude keeps working: Saarthi never stops a run because of cost.</div>
          <div class="meter mt16" style="height:10px"><span style="width:100%"></span></div>
          <div class="row wrap tight mt8 small muted"><span class="grow">R-0031 build · $2.64 · R-0032 fix · $0.48</span><span>Today, all tasks: $4.12</span></div>
          ${st === 'raise' ? `<div class="row wrap mt16"><span class="muted small">New budget for this task</span><input class="input" style="width:120px;height:38px" value="$5.00">${btn('Save', {size: 'sm', kind: 'primary', act: 'tmRaise'})}${btn('Cancel', {size: 'sm', kind: 'ghost', set: {bud: null}})}</div>` :
          `<div class="row wrap mt16">${btn('Keep going', {kind: 'primary', size: 'lg', set: {bud: 'kept'}})}${btn('Stop the agent', {size: 'lg', kind: 'surface', act: 'toast', arg: 'Stopped. Claude saved an undo point. You can start it again later.'})}${btn("Raise this task's budget", {size: 'lg', kind: 'ghost', set: {bud: 'raise'}})}</div>`}
        </div></div></section>
    ${emptyNote('Default budgets are in <a data-go="safety">Safety and cost</a>.')}`,
    baseFeed: false,
    feed: [['10:12', 'Started working in its own copy of the repo'], ['10:20', 'Changed <code>app/invoices/pdf.py</code> <span class="green">+118</span>'], ['10:39', '<span class="green">✓</span> Ran the PDF tests · 9 passed'], ['10:46', '<span class="red">✕</span> Rounding test failed: 0.01 off on a 200-line invoice'], ['10:48', 'Fixing the rounding: round each line, then sum'], ['10:53', '<span class="accent">Passed the $3.00 budget</span>'], tmNow('Writing a test for 200 lines…')],
  });
});
A.tmRaise = () => { S.ui.bud = null; toast('Budget for this task is now $5.00.'); };

/* ---------- update from main hit a conflict ---------- */
view('conflict', {title: 'Task: main moved on, conflict', area: 'Task page', ms: 'M5'}, () => taskPage({
  status: ['accent', 'Needs you', {dot: true}], statusText: 'Updating from main stopped: 1 file needs a decision', activityGo: 'conflict', right: '',
  top: `<section class="askbox">
    <div class="b accent mb8">main moved on · 5 new commits · 1 file changed in both places</div>
    <div class="q">main and Claude both changed <code style="font-size:.85em">app/auth/routes.py</code>.</div>
    <div class="muted mt8">PR #116 "Rate-limit the login endpoint" was merged into main. It changed the lines near the login route, where Claude added the reset routes. Your work is safe: Saarthi saved undo point #2 before the update.</div>
    <div class="grid mt16" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">
      <div><div class="small b mb8">On main</div>${codebox(' @router.post("/login")\n+@limiter.limit("5/minute")\n def login(body: LoginRequest, …', {diff: true})}</div>
      <div><div class="small b mb8">In this task</div>${codebox(' @router.post("/login")\n def login(body: LoginRequest, …\n+@router.post("/password-reset")', {diff: true})}</div>
    </div>
    <div class="row wrap mt16">${btn('Let Claude fix it', {kind: 'primary', size: 'lg', go: 'work'})}${btn('Fix it myself in Files', {size: 'lg', kind: 'surface', act: 'openInFiles', arg: 'app/auth/routes.py'})}${btn('Undo the update', {size: 'lg', kind: 'ghost', act: 'tmUndoUpdate'})}</div>
    <div class="muted small mt12">Claude keeps both changes, then your tests and checks run again.</div>
  </section>`,
  feed: [['10:49', '<span class="green">✓</span> Saved undo point #2'], ['10:50', 'Updating from main · 5 new commits'], ['10:50', '<span class="accent">Stopped: app/auth/routes.py changed in both places</span>']],
}));
A.tmUndoUpdate = () => tmGoToast('details', 'Update undone. Your files are back to undo point #2. Still 5 commits behind main.');

/* ---------- More → Terminal ---------- */
view('terminal', {title: 'Task → More: Claude\'s terminal', area: 'Task page', ms: 'M3'}, () => taskPage({
  tab: 'terminal', statusText: 'Claude is working · 17 min', right: btn('Stop', {act: 'toast', arg: 'Sent Ctrl C to Claude. It stops after the current step.'}),
  input: "Type straight into Claude's terminal…",
  body: `<div class="row wrap" style="margin-bottom:12px"><span class="grow muted small" style="min-width:240px">This is Claude's own terminal, in the task's copy of the repo. Type straight into it. What you type here also shows in Activity.</span>
      ${btn('Open in my terminal app', {size: 'sm', act: 'toast', arg: 'Opened your terminal in ~/.local/share/saarthi/worktrees/acme-billing/T-0012'})}</div>
    ${term(`<span class="d">~/.local/share/saarthi/worktrees/acme-billing/T-0012</span> <span class="b">(saarthi/T-0012-add-password-reset-api)</span>
<span class="p">$</span> claude --resume

<span class="p">✻</span> Claude Code <span class="d">· acme-billing · T-0012 · resumed session R-0027</span>

<span class="p">●</span> You answered: New table. Adding the migration now.
<span class="p">●</span> Write <span class="b">migrations/versions/0042_password_reset_tokens.py</span> <span class="g">+23</span>
<span class="p">●</span> Write <span class="b">tests/auth/test_password_reset.py</span> <span class="g">+61</span>
<span class="p">●</span> Bash <span class="d">uv run pytest tests/auth -q</span>
  <span class="g">.......</span>                                         <span class="g">7 passed</span> in 1.92s
<span class="p">●</span> All reset tests pass. Running the full suite next.
  <span class="d">Would you like me to also add a test for the email text? (y/n)</span>

<span class="p">&gt;</span> █`)}
    <div class="row wrap tight mt12 faint small"><span class="kbd">Ctrl C</span> stop Claude <span class="kbd" style="margin-left:10px">Ctrl D</span> leave the session <span class="grow"></span>Session R-0027 · started 10:41</div>`,
}));

/* ---------- More → Docs (F22) ---------- */
const TM_DOCS = [
  {id: 'plan', group: 'Plans', name: 'Plan · Add password reset API', path: '~/.local/share/saarthi/plans/T-0012/plan-01.md', note: 'From the plan run R-0026', text: D.planMd},
  {id: 'readme', group: 'Changed in this task', name: 'README.md', path: 'README.md', badge: 'changed', note: 'Changed by Claude · +12 lines', text: `# acme-billing

Billing API for Acme. Run with \`uv run uvicorn app.main:app\`.

## Password reset
Users can reset a forgotten password by email.

- \`POST /auth/password-reset\` sends a single-use link. It always answers 202.
- \`POST /auth/password-reset/confirm\` sets the new password. A used or expired link answers 410.

## Settings
| Name | Default | What |
|---|---|---|
| \`RESET_TOKEN_TTL_MINUTES\` | 30 | How long a reset link works |
`},
  {id: 'claude', group: 'Pinned', name: 'CLAUDE.md', path: 'CLAUDE.md', note: 'Pinned in project settings', text: `# acme-billing · rules for agents

## Code
- Python 3.12, FastAPI, SQLAlchemy 2. Run \`uv run pytest -q\` before you finish.
- All mail goes through \`app/mail.send_mail\`. Never call SMTP directly.
- Use timezone-aware UTC times. Never \`datetime.utcnow()\`.

## Database
- Every schema change is an Alembic migration with a \`downgrade()\`.
- Never edit an old migration.

## Tests
- Freeze time with \`freezer\`, never \`sleep\`.
- Reuse the \`client\` and \`user\` fixtures in \`tests/auth/conftest.py\`.
`},
  {id: 'fsd', group: 'Pinned', name: 'FUNCTIONAL_SPECIFICATIONS.md', path: 'core_docs/FUNCTIONAL_SPECIFICATIONS.md', note: 'Pinned in project settings', text: `# acme-billing · functional spec

## F4. Accounts
- **F4.1 Sign up** with email and password.
- **F4.2 Log in.** Five wrong tries in a minute lock the IP for one minute.
- **F4.3 Password reset.** A user asks for a link by email. The link works once, for 30 minutes.

## F5. Invoices
- **F5.1 List and search** by number, customer or email.
- **F5.2 Export** as PDF and CSV.
`},
];
view('docs', {title: 'Task → More: Docs', area: 'Task page', ms: 'M3'}, () => {
  const sel = TM_DOCS.find(d => d.id === ui('doc')) || TM_DOCS[0];
  const heads = sel.text.split('\n').filter(l => /^#{2,3} /.test(l)).map(l => l.replace(/^#+ /, ''));
  const groups = [...new Set(TM_DOCS.map(d => d.group))];
  return taskPage({tab: 'docs', body: `<div style="display:grid;grid-template-columns:minmax(200px,250px) minmax(0,1fr);gap:16px;align-items:start">
    <aside class="card" style="padding:10px;border-radius:18px">
      ${groups.map(g => `<div class="faint small b" style="padding:10px 10px 6px">${g}</div>
        ${TM_DOCS.filter(d => d.group === g).map(d => `<button class="frow ${d.id === sel.id ? 'on' : 'ch'}" style="font-family:Inter,sans-serif;font-size:14px;padding:8px 10px" data-set='{"doc":"${d.id}"}'><span class="grow ellipsis" title="${esc(d.name)}">${esc(d.name)}</span>${d.badge ? `<span class="ft" style="color:var(--accent-text)">${d.badge}</span>` : ''}</button>`).join('')}`).join('')}
      <div class="faint tiny" style="padding:12px 10px 4px">Docs are read-only here. Change them in your editor.</div>
    </aside>
    <section class="card" style="padding:0;border-radius:18px;min-width:0">
      <div class="row wrap" style="padding:14px 18px;border-bottom:1px solid var(--border)">
        <div class="grow" style="min-width:200px"><code class="ellipsis" style="display:block">${esc(sel.path)}</code><div class="faint tiny">${sel.note}</div></div>
        ${btn('Copy path', {size: 'xs', act: 'toast', arg: 'Copied ' + sel.path})}${btn('Open in my editor', {size: 'xs', act: 'toast', arg: 'Opened in your editor: code ' + sel.path})}
      </div>
      ${heads.length ? `<div class="row wrap tight" style="padding:10px 18px;border-bottom:1px solid var(--border)"><span class="faint small">On this page</span>${heads.map(h => `<button class="btn xs ghost" style="padding:0 8px;color:var(--accent-text)" data-act="tmJump" data-arg="h-${esc(h.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${esc(h)}</button>`).join('')}</div>` : ''}
      <div style="padding:20px 24px 24px">${md(sel.text)}</div>
    </section></div>`});
});

/* ---------- More → History ---------- */
const TM_HIST = [
  ['10:58', 'point', 3, 'after the build run · 6 files'],
  ['10:58', 'run', 'Run R-0027 finished · build · 17 min · $0.54'],
  ['10:55', 'you', 'You answered: <b>New table</b>'],
  ['10:52', 'agent', 'Claude asked: new table or Redis?'],
  ['10:51', 'you', 'You undid the update from main · still 5 commits behind'],
  ['10:50', 'agent', 'Update from main stopped: <code>app/auth/routes.py</code> changed in both places'],
  ['10:50', 'point', 2, 'before update from main'],
  ['10:47', 'check', '<span class="green">✓</span> Ran the login tests · 4 passed'],
  ['10:44', 'agent', 'Changed <code>reset.py</code> <span class="green">+42</span>'],
  ['10:41', 'run', 'Run R-0027 started · Claude · build'],
  ['10:38', 'you', 'You saved goal version 3 <button class="link small" data-tog="gdiff">· what changed</button>'],
  ['10:26', 'point', 1, 'after research'],
  ['10:26', 'run', 'Run R-0026 finished · research · 4 min · $0.08 · 1 finding saved'],
  ['10:22', 'run', 'Run R-0026 started · Claude · research, read-only'],
  ['10:21', 'agent', 'Made its own copy of the repo from main'],
  ['10:20', 'you', 'You made this task from Jira ACME-142'],
];
const TM_KIND = {run: 'Run', you: 'You', agent: 'Claude', check: 'Check', point: 'Undo point'};
view('history', {title: 'Task → More: History and undo points', area: 'Task page', ms: 'M3 M8'}, () => {
  const f = ui('hf', 'all'), restored = ui('restored');
  let rows = TM_HIST.slice();
  if (restored) rows = [['now', 'point', 4, 'your files just before the restore'], ['now', 'you', `You restored undo point #${restored}`]].concat(rows);
  rows = rows.filter(r => f === 'all' || (f === 'points' ? r[1] === 'point' : f === 'runs' ? r[1] === 'run' || r[1] === 'check' : r[1] === 'you'));
  const row = r => r[1] === 'point' ?
    `<div class="row" style="padding:10px 14px;margin:6px 0;border-radius:14px;background:var(--accent-soft)"><span class="t faint small" style="width:46px;flex:none">${r[0]}</span><span class="grow"><b>Undo point #${r[2]}</b> <span class="muted">· ${r[3]}</span></span>${r[2] === 4 ? '<span class="faint small">new</span>' : btn('Restore', {size: 'xs', kind: 'surface', act: 'tmRestore', arg: r[2]})}</div>` :
    `<div class="row top" style="padding:9px 14px"><span class="faint small" style="width:46px;flex:none;padding-top:1px">${r[0]}</span><span class="tag none" style="min-width:76px;text-align:center">${TM_KIND[r[1]]}</span><span class="grow">${r[2]}${r[2].includes('goal version') && ui('gdiff') ? `<div class="mt8">${codebox(' Users can reset a forgotten password by email.\n- The link expires after 1 hour\n+ The link expires after 30 minutes\n+ An unknown email gets the same answer (202)', {diff: true})}</div>` : ''}</span></div>`;
  return taskPage({tab: 'history', body: `<div class="row wrap" style="margin-bottom:10px">
      ${seg([['all', 'Everything', {set: {hf: 'all'}}], ['runs', 'Runs and checks', {set: {hf: 'runs'}}], ['you', 'Your answers', {set: {hf: 'you'}}], ['points', 'Undo points', {set: {hf: 'points'}}]], f)}
      <span class="grow"></span><span class="faint small">Newest first · ${restored ? 4 : 3} undo points</span></div>
    <div class="card" style="padding:8px 6px;border-radius:18px">${rows.map(row).join('') || emptyNote('Nothing here yet.')}</div>
    ${emptyNote('Saarthi saves an undo point after every run and before every update from main. Restore puts your files back; it saves the current files first, so nothing is lost.')}`});
});
A.tmRestore = el => { go('restoreConfirm', {pt: Number(el.dataset.arg)}); return false; };

/* ---------- Restore confirm (dialog over History) ---------- */
const TM_PT = {1: ['10:26', 'after research'], 2: ['10:50', 'before the update from main'], 3: ['10:58', 'after the build run']};
overlay('restoreConfirm', () => {
  const n = ui('pt', 2), [time, what] = TM_PT[n] || TM_PT[2];
  return dialog(`<h2 style="margin:0 0 6px;font-size:23px">Go back to undo point #${n}?</h2>
    <p class="muted" style="margin:0 0 18px">Your files in Claude's copy of the repo go back to how they were at ${time}, ${what}.</p>
    <div class="card" style="padding:4px 18px;border-radius:16px">
      ${[['Your current files are saved first, as undo point #4. Nothing is lost.'], ['3 files change: <code>reset.py</code>, <code>routes.py</code>, <code>test_password_reset.py</code>'], ['Your main branch and Jira are not touched.']].map(([t], i, a) => `<div class="row" style="padding:12px 0;${i < a.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}"><span class="green">✓</span><span class="grow">${t}</span></div>`).join('')}
    </div>
    <div class="faint small mt12">If Claude is working, it pauses first, then goes on from the restored files.</div>
    <div class="row mt24" style="justify-content:flex-end">${btn('Cancel', {act: 'closeOverlay'})}${btn('Restore', {kind: 'primary', act: 'tmDoRestore'})}</div>`, {mid: true});
});
view('restoreConfirm', {title: 'Task → More: restore an undo point', area: 'Task page', ms: 'M8', base: 'history', overlay: 'restoreConfirm'}, () => '');
A.tmDoRestore = () => { const n = ui('pt', 2); go('history', {restored: n, toast: `<b>Restored.</b> Your files are back to ${(TM_PT[n] || TM_PT[2])[0]}. <a data-go="history" style="font-weight:500">Undo point #4</a> has the files from before.`}); setTimeout(() => { if (S.view === 'history') set({toast: null}); }, 4000); return false; };

/* ---------- More → Details ---------- */
function tmRow(label, value, action = '') {
  return `<div class="item" style="align-items:flex-start"><span class="faint none" style="width:150px">${label}</span><div class="grow" style="min-width:0">${value}</div>${action ? `<div class="none">${action}</div>` : ''}</div>`;
}
view('details', {title: 'Task → More: Details', area: 'Task page', ms: 'M3 M6 M8'}, () => {
  const t = D.task;
  return taskPage({tab: 'details', body: `
    <div class="b muted" style="margin:6px 0 8px 4px">Where the work is</div>
    <div class="card flush list" style="border-radius:18px">
      ${tmRow('Branch', `<code class="ellipsis" style="display:block">${t.branch}</code>`, btn('Copy', {size: 'xs', act: 'toast', arg: 'Copied ' + t.branch}))}
      ${tmRow('Its own copy', `<code class="ellipsis" style="display:block">${t.copy}</code><div class="faint small">Claude works only here. Your main folder is never touched.</div>`, btn('Open in my editor', {size: 'xs', act: 'toast', arg: 'Opened in your editor: code ' + t.copy}))}
      ${tmRow('Main', `<span class="accent b">Behind main by 5 commits</span><div class="faint small">6 files changed in this task · last update from main 10:21</div>`, btn('Update from main', {size: 'xs', kind: 'soft', go: 'conflict'}))}
      ${tmRow('Ports', '<code>41010–41019</code><div class="faint small">Your app can run here without clashing with other tasks</div>')}
    </div>
    <div class="b muted" style="margin:24px 0 8px 4px">Safety and cost</div>
    <div class="card flush list" style="border-radius:18px">
      ${tmRow('What Claude may do', '<b>Safe</b><div class="faint small">Changes files in its own copy. Asks before commands that change lock files or use the network.</div>', btn('Change', {size: 'xs', go: 'safety'}))}
      ${tmRow('Cost', `<div class="row tight"><b>$0.62</b><span class="muted">of $3.00 budget</span></div><div class="meter mt8" style="max-width:320px"><span style="width:21%"></span></div>`, btn('Change budget', {size: 'xs', go: 'safety'}))}
    </div>
    <div class="b muted" style="margin:24px 0 8px 4px">Agent and runs</div>
    <div class="card flush list" style="border-radius:18px">
      ${tmRow('Agent', 'Claude Code · logged in', btn('Change', {size: 'xs', go: 'settingsAgents'}))}
      ${tmRow('Runs', `<div class="grid" style="gap:4px">${[['R-0026', 'research', '10:22–10:26', '4 min', '$0.08'], ['R-0027', 'build', '10:41–10:58', '17 min', '$0.54']].map(([id, m, w, d, c]) => `<div class="row tight wrap"><code>${id}</code><span>${m}</span><span class="faint small grow">${w} · ${d}</span><span class="small">${c}</span><span class="green small">done</span></div>`).join('')}</div>`)}
      ${tmRow('What Claude reads', '<div>Goal, what done looks like, research notes, plan, 2 lessons, project rules</div><div class="faint small">24 KB of 32 KB · made fresh before each run</div>', btn('See it', {size: 'xs', go: 'contextPack'}))}
      ${tmRow('Jira ticket', '<b>ACME-142</b> · In Review<div class="faint small">Saarthi asks before it changes the ticket</div>', btn('Open', {size: 'xs', go: 'tickets'}))}
    </div>`});
});

/* ---------- What Claude reads (was Context Pack) ---------- */
const TM_PARTS = [
  ['goal', 'Goal', 'version 3', 1.5, true],
  ['done', 'What done looks like', '5 things', 0.6, true],
  ['research', 'Research notes', '1 finding, 3 links · your note "for me only" is left out', 4.2],
  ['plan', 'Plan', 'plan-01.md, the latest plan', 6.1],
  ['lessons', 'Lessons and notes', '2 lessons: "Freeze time in tests, never sleep" · "All mail goes through app/mail.send_mail"', 2.3],
  ['rules', 'Project rules', 'CLAUDE.md · read by Claude itself', 9.3, true],
];
view('contextPack', {title: 'Task → More: what Claude reads', area: 'Task page', ms: 'M6'}, () => {
  const on = p => p[4] || !ui('off_' + p[0]);
  const used = TM_PARTS.filter(on).reduce((a, p) => a + p[3], 0);
  const preview = `# T-0012 · Add password reset API
mode: build · agent: claude · project: acme-billing
branch: saarthi/T-0012-add-password-reset-api

## Goal (version 3)
${D.task.goal}

## What done looks like
${D.task.done.map(d => '- [ ] ' + d).join('\n')}
${on(TM_PARTS[2]) ? `
## Research notes
- Login makes a 60-minute JWT with make_access_token(). No reset flow yet.
- Mail: app/mail.send_mail(to, template, ctx). Templates in app/templates/email/.
- Risk: app/auth/limit.py uses naive datetime.utcnow().
- Link: OWASP Forgot Password Cheat Sheet
` : ''}${on(TM_PARTS[3]) ? `
## Plan (plan-01.md)
1. Add a password_reset_tokens table (Alembic migration 0042).
2. Add app/auth/reset.py: make, hash, store and check tokens.
…
` : ''}${on(TM_PARTS[4]) ? `
## Lessons from this project
- Freeze time in tests, never sleep.
- All mail goes through app/mail.send_mail.
` : ''}
## Project rules (read these files yourself)
- CLAUDE.md`;
  return taskPage({tab: 'details', body: `
    <button class="back" style="margin-bottom:10px" data-go="details">← Details</button>
    <div class="row wrap" style="margin-bottom:4px"><h2 class="grow" style="margin:0;font-size:21px">What Claude reads</h2><span class="tag">next run: build · Claude</span></div>
    <p class="muted" style="margin:0 0 16px">Saarthi writes this before each run. Claude reads it first. The preview below is the exact text.</p>
    <div class="card flush list" style="border-radius:18px">
      ${TM_PARTS.map(p => `<div class="item"><div class="grow" style="min-width:0;${on(p) ? '' : 'opacity:.55'}"><div class="b">${p[1]}</div><div class="faint small">${esc(p[2])}</div></div>
        <span class="small muted none" style="width:64px;text-align:right">${p[3].toFixed(1)} KB</span>
        <span class="none" style="width:46px;display:flex;justify-content:flex-end">${p[4] ? '<span class="faint tiny">always</span>' : toggle(on(p), {tog: 'off_' + p[0]})}</span></div>`).join('')}
      <div class="item" style="display:block">
        <div class="row"><span class="grow b">Size</span><span class="small">${used.toFixed(1)} KB of 32 KB</span></div>
        <div class="meter mt8"><span style="width:${Math.round(used / 32 * 100)}%"></span></div>
        <div class="faint small mt8">When the parts are bigger than 32 KB, the oldest lessons are listed by name only.</div>
      </div>
    </div>
    <div class="row wrap" style="margin:26px 0 10px"><h2 class="grow" style="margin:0;font-size:19px">Preview</h2>${btn('Copy text', {size: 'sm', act: 'toast', arg: 'Copied the text Claude reads'})}${btn('Open as a file', {size: 'sm', act: 'toast', arg: 'Opened .saarthi/context/TASK.md in your editor'})}</div>
    ${codebox(preview, {style: 'max-height:420px;overflow:auto'})}`});
});

/* ---------- Check and ship → comment on a line ---------- */
view('comment', {title: 'Check and ship: comment on a line', area: 'Check and ship', ms: 'M5', needs: 1}, () => {
  const f = D.files['app/auth/routes.py'];
  let n = 0;
  const rows = f.rows.map(r => ({...r, n: r.k === 'del' ? null : ++n}));
  const cmts = tmCmts();
  const open = ui('cl');
  const count = Object.keys(cmts).length;
  const box = (ln, text) => `<div style="margin:6px 16px 10px 82px;padding:12px 14px;border-radius:14px;background:var(--raised);border:1px solid var(--border-strong);font-family:Inter,sans-serif;font-size:15px;white-space:normal">
    <div class="row tight"><span class="b small">You</span><span class="faint tiny grow">on line ${ln}</span>${btn('Delete', {size: 'xs', kind: 'ghost', act: 'tmDelCmt', arg: ln})}</div><div class="mt8" style="margin-top:4px">${esc(text)}</div></div>`;
  const editor = ln => `<div style="margin:6px 16px 10px 82px;padding:12px;border-radius:14px;background:var(--raised);border:1.5px solid var(--accent);font-family:Inter,sans-serif;white-space:normal">
    <textarea class="textarea" rows="2" data-model="cdraft" placeholder="What should Claude change on line ${ln}?">${esc(ui('cdraft', ''))}</textarea>
    <div class="row tight mt8" style="justify-content:flex-end">${btn('Cancel', {size: 'sm', kind: 'ghost', set: {cl: null}})}${btn('Add comment', {size: 'sm', kind: 'surface', act: 'tmAddCmt'})}</div></div>`;
  const near = i => rows.slice(Math.max(0, i - 2), i + 3).some(x => x.k !== 'ctx');
  let skip = 0;
  const flush = () => { const h = skip ? `<div class="ln" style="background:var(--surface-2)"><span class="n">⋯</span><span class="m"></span><span class="c faint" style="font-family:Inter,sans-serif">${skip} unchanged lines</span></div>` : ''; skip = 0; return h; };
  const lines = rows.map((r, i) => { if (!near(i) && !cmts[r.n] && open !== r.n) { skip++; return ''; } return flush() + rowHtml(r); }).join('') + flush();
  function rowHtml(r) { return  `<div class="ln ${r.k === 'ctx' ? '' : r.k} ${cmts[r.n] ? 'cmt' : ''}" ${r.n ? `data-set='{"cl":${r.n}}' style="cursor:pointer" title="Comment on line ${r.n}"` : ''}><span class="n">${r.n || ''}</span><span class="m">${r.k === 'add' ? '+' : r.k === 'del' ? '−' : ' '}</span><span class="c">${hl(r.t || ' ')}</span></div>
    ${r.n && cmts[r.n] ? box(r.n, cmts[r.n]) : ''}${r.n && open === r.n && !cmts[r.n] ? editor(r.n) : ''}`; }
  const g = D.groups[0];
  return checkPage({body: `
    <div class="row wrap tight" style="margin:-8px 0 18px">${chip('Looks good', 'green')}<span class="muted">All 3 checks passed · <a data-go="check">Back to the summary</a></span></div>
    <h2 style="margin:0 0 4px">What changed</h2>
    <div class="faint small mb16">Click any line to comment on it. Claude gets all your comments at once.</div>
    <div class="card flush" style="border-radius:18px">
      <div class="row top" style="padding:16px 18px"><div class="grow"><div class="row tight wrap"><span class="b" style="font-size:16px">${g.title}</span><span class="flag">${g.flag}</span></div><div class="muted" style="margin-top:2px">${g.why}</div></div><span class="faint small none">${g.stat}</span></div>
      <div class="row" style="padding:0 18px 10px"><code class="grow small">${g.file}</code>${btn('Open in Files →', {size: 'xs', act: 'openInFiles', arg: g.file})}</div>
      <div style="margin:0 14px 14px;background:var(--code-bg);border:1px solid var(--border);border-radius:14px;padding:8px 0;overflow-x:auto">${lines}</div>
    </div>
    <div class="grid mt12" style="gap:10px">${D.groups.slice(1).map(x => `<div class="card row" style="border-radius:18px;padding:14px 18px;cursor:pointer" data-go="check"><span class="b grow">${x.title}${x.flag ? ` <span class="flag">${x.flag}</span>` : ''}</span><span class="faint small">${x.stat}</span></div>`).join('')}</div>`,
  bar: `${btn('Cancel', {size: 'lg', go: 'check'})}${count ? btn(`Send ${count} comment${count > 1 ? 's' : ''} to Claude`, {kind: 'primary', size: 'lg', go: 'fixing'}) : '<button class="btn lg" disabled>Send comments to Claude</button>'}`});
});
/* Comments by line number. The story starts with one comment on the new /password-reset route. */
function tmCmts() {
  if (ui('cmts')) return ui('cmts');
  let n = 0, line = 1;
  D.files['app/auth/routes.py'].rows.forEach(r => { if (r.k !== 'del') n++; if (r.t.includes('"/password-reset", status_code=202')) line = n; });
  return {[line]: 'Rate-limit this route like /login (5 per minute per IP).'};
}
A.tmAddCmt = () => { const ln = ui('cl'), txt = (ui('cdraft') || '').trim(); if (!ln || !txt) return; S.ui.cmts = {...tmCmts(), [ln]: txt}; S.ui.cl = null; S.ui.cdraft = ''; };
A.tmDelCmt = (el, e) => { e.stopPropagation(); const c = {...tmCmts()}; delete c[el.dataset.arg]; S.ui.cmts = c; S.ui.cl = null; };

/* ---------- Check and ship → edit pull request text ---------- */
view('editPr', {title: 'Check and ship: edit pull request text', area: 'Check and ship', ms: 'M5', needs: 1}, () => {
  const t = D.task, mode = ui('prv', 'write');
  const body = `Closes ACME-142.

## Goal
${t.goal}

## What done looks like
${t.done.map(d => '- ' + d).join('\n')}

## Tests and checks
- Code style: passed (\`uv run ruff check .\`)
- Tests: 318 passed, 7 new (\`uv run pytest -q\`)
- Type check: passed (\`uv run pyright\`)

## What changed
- New API endpoints: ask for a reset link, then set a new password
- Database change: table \`password_reset_tokens\` (migration 0042)
- Settings: \`RESET_TOKEN_TTL_MINUTES = 30\``;
  return checkPage({editLink: false, body: `
    <p class="muted" style="margin:-10px 0 20px;font-size:16px">Optional. Saarthi wrote this from the goal and the checks. Change anything, or keep the default.</p>
    <div class="card pad-lg" style="border-radius:22px">
      <label class="label">Pull request title</label>
      <input class="input" value="Add password reset API (ACME-142)">
      <div class="row" style="margin:20px 0 8px"><label class="label grow" style="margin:0">Description</label>${seg([['write', 'Write', {set: {prv: 'write'}}], ['preview', 'Preview', {set: {prv: 'preview'}}]], mode)}</div>
      ${mode === 'write' ? `<textarea class="textarea mono" rows="10" style="font-size:13px;line-height:1.6">${esc(body)}</textarea>` : `<div class="tile" style="padding:18px 20px;border-radius:16px;background:var(--bg);border:1px solid var(--border)">${md(body)}</div>`}
      <label class="label" style="margin:20px 0 8px">Commit message</label>
      <input class="input mono" style="font-size:14px" value="feat(auth): add password reset API (T-0012)">
      <div class="faint small mt8">All 6 files become one commit on <code>${t.branch}</code>.</div>
      <div class="divider" style="margin:20px 0 16px"></div>
      <label class="row" style="cursor:pointer" data-tog="draftPr">${toggle(ui('draftPr'))}<span><b>Open as a draft</b> <span class="muted small">· teammates see it, but it can't be merged yet</span></span></label>
    </div>`,
  bar: `${btn('Use default text', {size: 'lg', act: 'toast', arg: 'Back to the default text from the goal and checks.'})}${btn('Approve and create pull request', {kind: 'primary', size: 'lg', go: 'done'})}`});
});

/* ---------- Side by side (was Race) ---------- */
const TM_LANES = [
  {who: 'Claude', time: '9 min 12 s', cost: '$0.31', files: '4 files', branch: 'saarthi/T-0021-faster-invoice-search-claude',
    feed: [['10:41', 'Read <code>app/invoices/search.py</code>'], ['10:43', "Found the slow part: <code>LIKE '%…%'</code> on 3 columns"], ['10:46', 'Added a trigram index · migration 0043'], ['10:48', 'Changed <code>search.py</code> <span class="green">+34</span> <span class="red">−12</span>']], now: 'Running the search tests…'},
  {who: 'Gemini', time: '9 min 05 s', cost: '$0.18', files: '5 files', branch: 'saarthi/T-0021-faster-invoice-search-gemini',
    feed: [['10:41', 'Read <code>search.py</code> and <code>models/invoice.py</code>'], ['10:44', 'Plan: a full-text search column'], ['10:47', 'Added column <code>search_vector</code> · migration 0043'], ['10:49', 'Changed 5 files <span class="green">+96</span> <span class="red">−26</span>']], now: 'Writing tests…'},
];
view('raceRunning', {title: 'Side by side: both agents working', area: 'Side by side', ms: 'M7'}, () => tmTask({...TM.search, agent: 'both agents'}, {
  statusText: 'Side by side · Claude and Gemini both working · 9 min', noTicket: true,
  right: btn('Stop both', {act: 'toast', arg: 'Stopped both. Each keeps its work; you can still compare.'}),
  body: `<div class="card blue row" style="border-radius:16px;padding:12px 18px;margin-bottom:14px"><span class="grow small" style="color:var(--text)">Both started from main at 10:41, each in its own copy of the repo. When both finish, you compare them and keep one.</span></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">${TM_LANES.map(l => `<div class="card" style="border-radius:20px;padding:18px 18px 14px;display:flex;flex-direction:column">
      <div class="row"><span class="display b grow" style="font-size:19px">${l.who}</span>${chip('Working', 'blue', {spin: true})}</div>
      <code class="ellipsis faint tiny" style="display:block;margin-top:4px">${l.branch}</code>
      <div class="row tight wrap mt12">${[l.time, l.cost, l.files].map(x => `<span class="tile small" style="padding:4px 12px;border-radius:999px">${x}</span>`).join('')}</div>
      <div class="feed mt8" style="flex:1">${l.feed.concat([tmNow(l.now)]).map(([time, html]) => `<div style="padding:7px 0"><span class="t" style="width:46px">${time}</span><span class="e small">${html}</span></div>`).join('')}</div>
      <div class="row" style="border-top:1px solid var(--border);padding-top:12px;margin-top:6px"><span class="grow faint small">${l.who === 'Claude' ? 'About 3 min left' : 'About 5 min left'}</span>${btn('Stop this one', {size: 'sm', act: 'toast', arg: `Stopped ${l.who}. The other one keeps working.`})}</div>
    </div>`).join('')}</div>
    ${emptyNote("While both work, fixing, review comments and shipping are off. We'll tell you when both are done.")}`,
  input: 'Tell both agents something…',
}));

const TM_RESULTS = [
  {who: 'Claude', good: true, how: 'Trigram index on number, customer and email', speed: '840 ms → 38 ms', checks: [['Code style', 1], ['Tests · 214 passed, 6 new', 1], ['Type check', 1]], goals: '5 of 5 goals met', files: '4 files · +71 −12', time: '14 min', cost: '$0.48'},
  {who: 'Gemini', good: false, how: 'Full-text search column', speed: '840 ms → 61 ms', checks: [['Code style', 1], ['Tests · 1 failed, 213 passed', 0], ['Type check', 1]], goals: '4 of 5 goals met', files: '5 files · +128 −26', time: '12 min', cost: '$0.29',
    problem: 'Searching "INV-004" finds nothing: the dash splits the word.'},
];
view('race', {title: 'Side by side: compare and keep one', area: 'Side by side', ms: 'M7'}, () => tmTask(TM.search, {
  status: ['accent', 'Needs you', {dot: true}], statusText: 'Both finished · pick the one to keep', noTicket: true, right: '', sticky: false,
  body: `<div class="row wrap" style="margin-bottom:14px"><span class="grow muted">Same goal, same start from main. Here is how each one did.</span>${btn('Compare the code', {size: 'sm', go: 'files'})}</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">${TM_RESULTS.map(r => `<div class="card" style="border-radius:22px;padding:20px;${r.good ? 'border-color:var(--green)' : ''};display:flex;flex-direction:column">
      <div class="row"><span class="display b grow" style="font-size:21px">${r.who}</span>${r.good ? chip('Looks good', 'green') : chip('Has problems', 'red')}</div>
      <div class="muted mt8">${r.how}</div>
      <div class="tile mt12 row" style="padding:10px 14px"><span class="grow small muted">Search time, slowest 5%</span><b>${r.speed}</b></div>
      <div class="grid mt16" style="gap:8px">${r.checks.map(([c, ok]) => `<div class="row tight"><span class="${ok ? 'green' : 'red'}" style="width:18px">${ok ? '✓' : '✕'}</span><span class="grow">${c}</span></div>`).join('')}
        <div class="row tight"><span class="${r.good ? 'green' : 'accent'}" style="width:18px">${r.good ? '✓' : '?'}</span><span class="grow">${r.goals}</span></div></div>
      ${r.problem ? `<div class="small mt12" style="padding:10px 14px;border-radius:14px;background:var(--red-soft);color:var(--red)">${r.problem}</div>` : ''}
      <div class="row wrap tight mt16 small muted" style="flex:1;align-items:flex-end"><span>${r.files}</span><span>·</span><span>${r.time}</span><span>·</span><span>${r.cost}</span></div>
      <div class="mt16">${btn(`Keep ${r.who}'s version`, {kind: r.good ? 'primary' : 'surface', size: 'lg', go: r.good ? 'check' : 'checkFail'})}</div>
    </div>`).join('')}</div>
    ${emptyNote("The version you keep becomes the task's branch and goes to Check and ship. The other one is kept as a hidden snapshot for 7 days, so nothing is lost.")}`,
}));
