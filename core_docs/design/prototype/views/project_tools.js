/* Project tools: Lessons and notes, Saved instructions, Jira tickets (from the project menu in the top bar).
   Helpers here start with "pt" so they never clash with other view files. */

const PT_PROJECT = 'acme-billing';
function ptHead(tool, o = {}) {
  return head({eyebrow: `${PT_PROJECT} → ${tool}`, backLabel: o.backLabel || '← Home', backTo: o.backTo || 'home', ...o});
}

/* ---------- lessons and notes (M6) ---------- */
const PT_LESSONS_MD = `# Lessons learned · acme-billing

Short rules from past tasks. Agents read this file before each task.

## Use timezone-aware UTC times in expiry checks
- From: Add password reset API (T-0012), today
- Compare with \`datetime.now(timezone.utc)\`. A local time broke the expiry test.

## Freeze time in tests, never sleep
- From: Fix flaky login test (T-0011), 10 Oct
- Use the \`freezer\` fixture. \`time.sleep\` made the test fail 1 run in 10.

## Use cursor pagination on (created_at, id)
- From: Add pagination to /invoices (T-0006), 7 Oct
- Offset pagination was slow past page 400. Reuse \`app/pagination.py\`.

## All mail goes through app/mail.send_mail
- From: Sign-up email verification (T-0005), 3 Oct
- It signs mail with DKIM. Mail sent another way lands in spam.
`;
const PT_LESSONS_MINE = PT_LESSONS_MD.replace('A local time broke the expiry test.', 'A local time broke the expiry test.\n- Store expiry times as UTC in the database too.');
const PT_LESSONS_DISK = PT_LESSONS_MD + `
## Hash reset tokens before saving
- From: Priya S, edited in her editor at 11:02
- Save only the SHA-256 hash. Compare with \`hmac.compare_digest\`.
`;

const PT_OLDER = ['Run alembic upgrade head in the test fixture, not by hand', 'Keep money as Decimal with 2 places', 'Return 202 for unknown emails, never 404', 'Mock the mail server with the outbox fixture',
  'Use app.clock.Clock, not datetime.now, in services', 'One migration per pull request', 'Prefer small endpoints over one with many flags', 'Log the invoice ID, never the customer email',
  'Seed test data with factories, not fixtures files', 'Read the CSV spec in core_docs/billing.md first'];

const PT_SECS = {
  lessons: {label: 'Lessons learned', n: 14, path: 'core_docs/memory/lessons.md', file: 'lessons.md'},
  decisions: {label: 'Decisions', n: 2, path: 'core_docs/decisions/', file: 'ADR-002-session-tokens.md', items: [
    {t: 'Session tokens in the database, not JWT', f: 'ADR-002-session-tokens.md', when: '2 Oct', d: 'We must be able to log a user out at once. A token table makes that one delete.'},
    {t: 'Store money as Decimal, never float', f: 'ADR-001-money-as-decimal.md', when: '14 Sep', d: 'Rounding bugs in invoices came from float maths. All amounts use Decimal with 2 places.'}]},
  plans: {label: 'Plans', n: 2, path: 'core_docs/plans/', file: 'm2_invoices.md', items: [
    {t: 'M2 · Invoices and export', f: 'm2_invoices.md', when: '5 of 9 steps', d: 'Next: CSV export (ACME-151), then the PDF footer (ACME-147).'},
    {t: 'M1 · Accounts and login', f: 'm1_accounts.md', when: 'done', d: 'Sign-up, login, email check, password reset (T-0012 is the last step).'}]},
  rules: {label: 'Project rules', n: 4, path: 'CLAUDE.md', file: 'CLAUDE.md', items: [
    {t: 'All mail goes through app/mail.send_mail', d: 'Never call smtplib directly.'},
    {t: 'Money is Decimal with 2 places', d: 'Never float, not even in tests.'},
    {t: 'Run the checks before saying done', d: '<code>uv run ruff check .</code>, <code>uv run pytest -q</code> and <code>uv run pyright</code>.'},
    {t: 'Never change a merged migration', d: 'Add a new migration instead.'}]},
  shipped: {label: 'Shipped log', n: 0, path: 'core_docs/timeline/shipped.md', file: 'shipped.md', items: [
    {t: 'Add password reset API', when: 'today', d: 'PR #118 · 6 files · 2 lessons saved'},
    {t: 'Fix invoice rounding', when: 'Tue', d: 'PR #112 · 3 files · 1 lesson saved'},
    {t: 'Add audit log table', when: 'Mon', d: 'PR #109 · 5 files'},
    {t: 'Fix flaky login test', when: '10 Oct', d: 'PR #104 · 2 files · 1 lesson saved'}]},
};
const PT_SEC_MD = {
  lessons: PT_LESSONS_MD,
  decisions: '# ADR-002 · Session tokens in the database\n\n## Why\nWe must be able to log a user out at once.\n\n## Decision\n- One row per session in `sessions`.\n- Logout deletes the row.\n',
  plans: '# M2 · Invoices and export\n\n1. Invoice list with cursor pagination\n2. Invoice PDF with line-item totals\n3. CSV export per month (ACME-151)\n4. PDF footer (ACME-147)\n',
  rules: '# acme-billing · rules for agents\n\n1. All mail goes through `app/mail.send_mail`.\n2. Money is Decimal with 2 places.\n3. Run the checks before saying done.\n4. Never change a merged migration.\n',
  shipped: '# Shipped log\n\n- today · Add password reset API · PR #118\n- Tue · Fix invoice rounding · PR #112\n- Mon · Add audit log table · PR #109\n',
};

function ptLessonCard(l) {
  return `<div class="card ${l.fresh ? 'accent' : ''}" style="padding:16px 18px;border-radius:18px${l.fresh ? ';border:1px solid var(--accent)' : ''}">
    <div class="row top"><div class="grow"><div class="row tight wrap"><span class="b" style="font-size:16px">${esc(l.t)}</span>${l.fresh ? chip('New today', 'accent') : ''}</div>
      <div class="muted small" style="margin-top:2px">From the task “${esc(l.from)}” · ${l.when}</div></div>
      ${btn('Edit', {size: 'sm', kind: 'surface', act: 'ptEditNote', arg: 'lessons'})}</div></div>`;
}
function ptSecBody(id) {
  const s = PT_SECS[id];
  if (id === 'lessons') {
    const more = ui('older');
    return `<div class="grid" style="gap:10px">${D.lessons.map(ptLessonCard).join('')}
      ${more ? PT_OLDER.map(t => `<div class="row" style="padding:10px 18px;border-radius:14px;background:var(--surface)"><span class="grow">${t}</span><span class="faint small">Sep</span></div>`).join('') : ''}</div>
      <button class="btn ghost mt12" style="padding:0 4px" data-tog="older">${more ? 'Hide older lessons' : 'Show 10 older lessons'} ${I.down()}</button>`;
  }
  if (id === 'rules') {
    return `<div class="card flush list">${s.items.map((r, i) => `<div class="item"><span class="count" style="background:var(--surface-2);color:var(--muted)">${i + 1}</span><div class="grow"><div class="b">${r.t}</div><div class="muted small">${r.d}</div></div></div>`).join('')}</div>
      ${emptyNote('Agents also read <code>AGENTS.md</code> if it exists. Both files are in your repo, so the whole team uses the same rules.')}`;
  }
  return `<div class="grid" style="gap:10px">${s.items.map(it => `<div class="card" style="padding:16px 18px;border-radius:18px">
    <div class="row top"><div class="grow"><div class="b" style="font-size:16px">${it.t}</div><div class="muted" style="margin-top:2px">${it.d}</div>
      ${it.f ? `<div class="faint tiny mono mt8">${it.f}</div>` : ''}</div><span class="faint small none">${it.when}</span></div></div>`).join('')}</div>`;
}

view('notes', {title: 'Lessons and notes', area: 'Project tools', ms: 'M6'}, () => {
  const sec = PT_SECS[ui('sec')] ? ui('sec') : 'lessons', s = PT_SECS[sec];
  return page(`${ptHead('Lessons and notes', {title: 'Lessons and notes', sub: 'Plain markdown files in <code>core_docs/</code>. Agents read these before each task.',
      right: btn('Open folder', {size: 'sm', act: 'toast', arg: 'Opens core_docs/ in your file manager'})})}
    ${ui('saved') ? `<div class="card green row mb16" style="padding:12px 18px;border-radius:16px">${I.check()}<span>Saved <code>${s.file}</code> in your main folder. Saarthi does not commit it.</span></div>` : ''}
    <div style="display:grid;grid-template-columns:250px minmax(0,1fr);gap:20px;align-items:start">
      <nav class="card flush list" style="border-radius:18px">
        ${Object.entries(PT_SECS).map(([id, x]) => `<div class="item click" style="padding:12px 16px;${id === sec ? 'background:var(--accent-soft);' : ''}" data-set='{"sec":"${id}","older":false,"saved":false}'>
          <span class="grow" style="font-weight:${id === sec ? 600 : 500}">${x.label}</span>${x.n ? `<span class="faint small">${x.n}</span>` : ''}</div>`).join('')}
      </nav>
      <section>
        <div class="row wrap" style="margin-bottom:14px"><div class="grow"><h2 style="margin:0">${s.label}</h2><code class="faint tiny">${s.path}</code></div>
          ${btn('Edit file', {kind: 'primary', act: 'ptEditNote', arg: sec})}</div>
        ${ptSecBody(sec)}
      </section>
    </div>
    ${emptyNote('New lessons come from the "Lessons learned" card after a task is shipped. You choose what is saved. Edits change files in your main folder; Saarthi never commits them.')}`, 'wide');
});
A.ptEditNote = el => { go('noteEdit', {sec: el.dataset.arg}); return false; };

view('noteEdit', {title: 'Lessons and notes: edit a file', area: 'Project tools', ms: 'M6'}, () => {
  const sec = PT_SECS[ui('sec')] ? ui('sec') : 'lessons', s = PT_SECS[sec];
  const conflict = ui('conflict'), both = ui('both');
  const start = sec === 'lessons' ? PT_LESSONS_MINE : PT_SEC_MD[sec];
  const text = ui('noteMd', start);
  const banner = conflict ? `<div class="card accent mb16" style="border:1px solid var(--accent);border-radius:20px">
      <div class="row top wrap"><span class="bigmark accent" style="width:36px;height:36px;font-size:17px">!</span>
        <div class="grow" style="min-width:260px"><div class="b" style="font-size:17px">This file changed on disk while you were editing.</div>
          <div class="muted">Someone saved <code>${s.file}</code> at 11:02, after you opened it at 10:51. Nothing was overwritten. Choose what to keep.</div>
          <div class="row wrap tight mt12">${btn('Keep mine', {kind: 'primary', act: 'ptKeep', arg: 'mine'})}${btn('Use the disk version', {kind: 'surface', act: 'ptKeep', arg: 'disk'})}${btn(both ? 'Hide both' : 'Show both', {kind: 'surface', tog: 'both'})}</div></div></div>
      ${both ? `<div class="grid cols mt16">
        <div><div class="small b mb8">Only in yours</div>${codebox('## Use timezone-aware UTC times in expiry checks\n+ - Store expiry times as UTC in the database too.', {diff: true})}</div>
        <div><div class="small b mb8">Only on disk · saved 11:02</div>${codebox('+ ## Hash reset tokens before saving\n+ - From: Priya S, edited in her editor at 11:02\n+ - Save only the SHA-256 hash.', {diff: true})}</div></div>
        <div class="faint small mt8">Keep mine adds your line and keeps Priya's new lesson too: nothing is lost.</div>` : ''}
    </div>` : '';
  return page(`${ptHead('Lessons and notes', {title: `Edit ${s.label.toLowerCase()}`, backLabel: '← Lessons and notes', backTo: 'notes',
      sub: `<code>${s.path}${s.path.endsWith('/') ? s.file : ''}</code> · in your main folder, branch main`})}
    ${banner}
    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:stretch">
      <div><div class="label">Markdown</div><textarea class="textarea mono" style="font-size:13px;line-height:1.65;height:480px;resize:none;border-radius:18px" data-model="noteMd" data-live>${esc(text)}</textarea></div>
      <div><div class="label">Preview</div><div class="card" style="height:480px;overflow:auto;border-radius:18px;padding:20px 22px">${md(text)}</div></div>
    </div>
    <div class="sticky" style="padding:10px 10px 10px 22px">
      <span class="grow muted small" style="min-width:220px">Saves the file in your main folder. Saarthi does not commit it. Agents read it from the next task.</span>
      ${btn('Cancel', {go: 'notes'})}${conflict ? '<button class="btn" disabled>Save · choose above first</button>' : btn('Save', {kind: 'primary', act: 'ptSaveNote', arg: sec})}
    </div>
    <div class="faint small mt16" style="margin-left:4px">Prototype: <button class="link small" data-set='{"conflict":${conflict ? 'false' : 'true'},"both":false}'>${conflict ? 'go back to normal editing' : 'show what happens when the file changes on disk'}</button></div>`, 'wide');
});
A.ptSaveNote = el => { go('notes', {sec: el.dataset.arg, saved: true}); return false; };
A.ptKeep = el => {
  const mine = el.dataset.arg === 'mine';
  S.ui.noteMd = mine ? PT_LESSONS_DISK.replace('A local time broke the expiry test.', 'A local time broke the expiry test.\n- Store expiry times as UTC in the database too.') : PT_LESSONS_DISK;
  S.ui.conflict = false; S.ui.both = false;
  toast(mine ? 'Kept your edit and added the new lesson from disk. Press Save to write the file.' : 'Loaded the version on disk. Your edit is gone.');
};

/* ---------- saved instructions (M6) ---------- */
const PT_PB_BODY = `Bug in {{project}}: {{task_title}}
{{goal}}

1. Write a test that fails because of this bug. Run it. Show that it fails.
2. Fix the code with the smallest change. Follow the style of the files around it.
3. Run the checks and show the real output.

Done means all of this is true:
{{done}}

Checks that failed last time:
{{failing_checks}}`;
const PT_FIELDS = {
  project: 'acme-billing',
  task_title: 'Add password reset API',
  goal: () => D.task.goal,
  done: () => D.task.done.map(d => '- ' + d).join('\n'),
  failing_checks: 'Tests · tests/auth/test_password_reset.py::test_token_expires_after_30_min\n  assert 200 == 410',
};
function ptFill(body) {
  return esc(body).replace(/\{\{(\w+)\}\}/g, (m, k) => {
    const v = PT_FIELDS[k];
    if (v === undefined) return `<span class="red">${m} (unknown field)</span>`;
    return `<span class="accent">${esc(typeof v === 'function' ? v() : v)}</span>`;
  });
}
const PT_IMPORT = [
  {t: 'Start of a session', f: 'start-of-a-session.md', s: 'Read core_docs/README.md and MILESTONES.md, then the last entry in the shipped log…'},
  {t: 'Plan a milestone item', f: 'plan-a-milestone-item.md', s: 'Read the related part of FUNCTIONAL_SPECIFICATIONS.md. Write a plan in core_docs/plans/…'},
  {t: 'Build with tests first', f: 'build-with-tests-first.md', s: 'Follow the plan. Write the failing test first, then the code…'},
  {t: 'Bug fix', f: 'bug-fix-2.md', s: 'Read the full files involved, not parts. Find the cause before you change code…', note: 'bug-fix.md exists, so this one is saved as bug-fix-2.md'},
  {t: 'Review before commit', f: 'review-before-commit.md', s: 'Review the current changes against the spec. Check the stage rules and the tests…'},
];
const PT_IMPORT_MD = `# Quick prompts

## Start of a session
Read core_docs/README.md and MILESTONES.md, then the last entry in the shipped log. Tell me what is next.

## Plan a milestone item
Read the related part of FUNCTIONAL_SPECIFICATIONS.md. Write a plan in core_docs/plans/ and wait for my OK.

## Build with tests first
…3 more headings`;

view('playbooks', {title: 'Saved instructions', area: 'Project tools', ms: 'M6'}, () => page(`
  ${ptHead('Saved instructions', {title: 'Saved instructions', sub: 'Ready-made instructions you can give an agent when you start a task. Each one is a plain markdown file.',
    right: `<div class="row tight">${btn('Import from a file', {act: 'ptImport'})}${btn('New', {kind: 'primary', act: 'ptOpenPb', arg: 'new'})}</div>`})}
  ${ui('imported') ? `<div class="card green row mb16" style="padding:12px 18px;border-radius:16px">${I.check()}<span>Imported ${ui('imported')} saved instructions from <code>quick-prompts.md</code>.</span></div>` : ''}
  <div class="grid cols3">${D.playbooks.map((p, i) => `<button class="card" style="text-align:left;cursor:pointer;border-radius:20px;display:flex;flex-direction:column;gap:6px;min-height:150px" data-act="ptOpenPb" data-arg="${i}">
    <span class="display b" style="font-size:17px">${esc(p.t)}</span><span class="muted small grow">${esc(p.d)}</span>
    <span class="row tight wrap"><span class="tag">${esc(p.src.split(' · ')[0])}</span>${p.src.includes(' · ') ? `<span class="faint small">${esc(p.src.split(' · ')[1])}</span>` : '<span class="faint small">any agent</span>'}</span></button>`).join('')}</div>
  ${emptyNote('Pick one in New task → More options → Saved instructions. Files live in <code>.saarthi/playbooks/</code> (this project), <code>~/.config/saarthi/playbooks/</code> (all projects) or come built in. Same name in two places? This project wins.')}`, 'wide'));
A.ptOpenPb = el => { go('playbookEdit', {pb: el.dataset.arg}); return false; };
A.ptImport = () => { go('playbookEdit', {imp: true}); return false; };

view('playbookEdit', {title: 'Saved instructions: edit and import', area: 'Project tools', ms: 'M6'}, () => {
  if (ui('imp')) {
    const ticks = ui('ticks') || PT_IMPORT.map(() => true), n = ticks.filter(Boolean).length, where = ui('where', 'project');
    return page(`${ptHead('Saved instructions', {title: 'Import from a file', backLabel: '← Saved instructions', backTo: 'playbooks',
        sub: 'Each <code>##</code> heading in the file becomes one saved instruction. Nothing is saved until you click Import.'})}
      <div class="card pad-lg">
        <div class="row wrap"><div class="grow" style="min-width:240px"><div class="label">File</div>
          <div class="row"><div class="input mono row" style="font-size:14px;flex:1">~/OFFICE/saarthi/quick-prompts.md</div>${btn('Choose…', {act: 'toast', arg: 'Opens the file picker of your system'})}</div></div>
          <div><div class="label">Save to</div>${seg([['project', 'This project', {set: {where: 'project'}}], ['all', 'All projects', {set: {where: 'all'}}]], where)}</div></div>
        <div style="display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:18px;margin-top:20px">
          <div><div class="small b mb8">The file</div>${codebox(PT_IMPORT_MD, {style: 'font-size:12px'})}</div>
          <div><div class="small b mb8">5 found</div><div class="card flush list" style="border-radius:16px">
            ${PT_IMPORT.map((p, i) => `<div class="item click" style="align-items:flex-start;padding:12px 16px" data-act="ptTick" data-arg="${i}">
              <span class="check ${ticks[i] ? 'on' : ''}" style="margin-top:3px">${ticks[i] ? '✓' : ''}</span>
              <div class="grow"><div class="row tight wrap"><span class="b">${p.t}</span><span class="tag">${p.f}</span></div>
                <div class="muted small ellipsis">${esc(p.s)}</div>${p.note ? `<div class="accent tiny mt8" style="margin-top:2px">${p.note}</div>` : ''}</div></div>`).join('')}
          </div></div>
        </div>
      </div>
      <div class="row wrap mt24">${n ? btn(`Import ${n}`, {kind: 'primary', size: 'lg', act: 'ptDoImport', arg: n}) : '<button class="btn lg" disabled>Import</button>'}${btn('Cancel', {size: 'lg', go: 'playbooks'})}
        <span class="faint small">Saved in <code>${where === 'project' ? '.saarthi/playbooks/' : '~/.config/saarthi/playbooks/'}</code></span></div>`, 'wide');
  }
  const isNew = ui('pb') === 'new', p = isNew ? {t: '', src: 'This project · Claude'} : D.playbooks[+ui('pb', 1)] || D.playbooks[1];
  const body = ui('pbBody', isNew ? 'Task in {{project}}: {{task_title}}\n{{goal}}\n\nDone means:\n{{done}}' : PT_PB_BODY);
  const agent = ui('pbAgent', /Codex/.test(p.src) ? 'codex' : /Gemini/.test(p.src) ? 'gemini' : /Claude/.test(p.src) ? 'claude' : 'any');
  const builtIn = p.src.startsWith('Built-in');
  const slug = (p.t || 'new-instructions').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
  return page(`${ptHead('Saved instructions', {title: isNew ? 'New saved instructions' : esc(p.t), backLabel: '← Saved instructions', backTo: 'playbooks',
      sub: `<code>.saarthi/playbooks/${slug}.md</code>${builtIn ? ' · built in, so saving makes your own copy in this project' : ''}`})}
    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start">
      <div class="card pad-lg">
        <label class="label">Name</label><input class="input" value="${esc(p.t)}" placeholder="e.g. Fix a bug, test first">
        <label class="label mt16">Which agent</label>
        ${seg([['any', 'Any'], ['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini']].map(([id, l]) => [id, l, {set: {pbAgent: id}}]), agent)}
        <label class="label mt16">Instructions</label>
        <textarea class="textarea mono" style="font-size:13px;line-height:1.65;min-height:300px" data-model="pbBody" data-live>${esc(body)}</textarea>
        <div class="row wrap tight mt12"><span class="faint small">Fill-in fields:</span>${Object.keys(PT_FIELDS).map(k => `<span class="tag">{{${k}}}</span>`).join('')}</div>
      </div>
      <div class="card" style="border-radius:20px;position:sticky;top:80px">
        <div class="row wrap" style="margin-bottom:10px"><div class="grow"><div class="b">Preview the exact text sent to the agent</div>
          <div class="muted small">Filled in with task T-0012 · Add password reset API</div></div><span class="tag">T-0012</span></div>
        <div class="codebox" style="max-height:470px;overflow:auto">${ptFill(body)}</div>
        <div class="faint small mt12">Amber text comes from the task. An unknown field shows in red, and the task won't start until it's fixed.</div>
      </div>
    </div>
    <div class="sticky" style="padding:10px 10px 10px 22px">
      <span class="grow muted small" style="min-width:200px">Saved instructions are added after the goal and the project rules.</span>
      ${isNew || builtIn ? '' : btn('Delete', {kind: 'ghost', act: 'toast', arg: 'Deleted. The file moved to the trash.'})}${btn('Cancel', {go: 'playbooks'})}${btn('Save', {kind: 'primary', go: 'playbooks'})}
    </div>`, 'wide');
});
A.ptTick = el => { const t = (ui('ticks') || PT_IMPORT.map(() => true)).slice(); t[+el.dataset.arg] = !t[+el.dataset.arg]; S.ui.ticks = t; };
A.ptDoImport = el => { go('playbooks', {imported: el.dataset.arg}); return false; };

/* ---------- Jira tickets (M10) ---------- */
const PT_SPRINT = [
  {key: 'ACME-139', t: 'Webhook retries', s: 'To Do · Low', start: true},
  {key: 'ACME-144', t: 'Monthly statement email', s: 'In Progress · Marco D'},
  {key: 'ACME-146', t: 'Currency symbol in totals', s: 'Done · Priya S'},
  {key: 'ACME-148', t: 'Retry failed card payments', s: 'To Do · Medium', start: true},
  {key: 'ACME-149', t: 'Notes field on invoices', s: 'In Review · Marco D'},
  {key: 'ACME-152', t: 'Audit log export', s: 'To Do · Low', start: true},
  {key: 'ACME-154', t: 'Faster invoice list', s: 'In Progress · Priya S'},
  {key: 'ACME-156', t: 'Check customer addresses', s: 'To Do · Medium', start: true},
];
const PT_BUGS = ['ACME-153', 'ACME-150'];
function ptStatus(s) {
  const [st, ...rest] = s.split(' · ');
  const tone = st === 'Done' ? 'green' : st === 'To Do' ? 'neutral' : 'blue';
  return `${chip(st, tone)}<span class="muted small">${rest.join(' · ').replace('linked to ', 'task ')}</span>`;
}
function ptTicketsPage(offline) {
  const tab = ui('tview', 'mine');
  const rows = tab === 'sprint' ? D.tickets.concat(PT_SPRINT) : tab === 'bugs' ? D.tickets.filter(t => PT_BUGS.includes(t.key)) : D.tickets;
  const q = (ui('tq') || '').toLowerCase();
  const shown = rows.filter(t => !q || (t.key + ' ' + t.t).toLowerCase().includes(q));
  return page(`${ptHead('Jira tickets', {title: 'Jira tickets', sub: `acme.atlassian.net · project ACME · linked to <span class="tag">${PT_PROJECT}</span>`,
      right: btn(offline ? 'Try again' : 'Refresh', {size: 'sm', act: 'toast', arg: offline ? 'Still can\'t reach acme.atlassian.net. We\'ll try again in 1 min.' : 'Synced just now · 50 tickets'})})}
    ${offline ? `<div class="card dashed row wrap mb16" style="border-radius:18px"><span class="spin faint"></span><div class="grow" style="min-width:220px"><div class="b">1 change waits for Jira</div>
      <div class="muted small">Move ACME-150 to In Review and add the PR link. It is sent once Jira is back, after you say OK. Nothing is lost or sent twice.</div></div></div>` : ''}
    <div class="row wrap" style="margin-bottom:14px">
      ${seg([['mine', 'Mine · 6', {set: {tview: 'mine'}}], ['sprint', 'Sprint · 14', {set: {tview: 'sprint'}}], ['bugs', 'Bugs · 2', {set: {tview: 'bugs'}}]], tab)}
      <span class="grow"></span>
      <input class="input" style="max-width:300px;height:40px" data-model="tq" data-live value="${esc(ui('tq', ''))}" placeholder="Search key or title…">
    </div>
    <div class="card flush list">${shown.map(t => `<div class="item ${t.linked ? 'click' : ''}" ${t.linked ? `data-go="${t.linked}"` : ''}>
      <span class="tag" style="min-width:82px;text-align:center">${t.key}</span>
      <div class="grow"><div style="font-weight:500;font-size:16px">${esc(t.t)}</div><div class="row tight wrap" style="margin-top:2px">${ptStatus(t.s)}</div></div>
      ${t.linked ? btn('Open task', {size: 'sm', go: t.linked}) : t.start ? btn('Start as task', {size: 'sm', kind: 'soft', go: 'ticketStart'}) : '<span class="faint small">not yours</span>'}
    </div>`).join('') || '<div class="item faint">No ticket matches.</div>'}</div>
    <div class="row wrap faint small mt16" style="margin-left:4px;gap:8px">
      <span>${offline ? 'Saved 2 h ago · 50 tickets on this computer' : 'Synced 2 min ago · 50 tickets saved on this computer'}</span><span>·</span>
      <span>Saarthi asks before it changes anything in Jira.</span><span class="grow"></span><a data-go="settingsJira">Settings → Jira</a>
    </div>`, 'wide');
}
view('tickets', {title: 'Jira tickets', area: 'Project tools', ms: 'M10'}, () => ptTicketsPage(false));
view('ticketsOffline', {title: 'Jira tickets: Jira can\'t be reached', area: 'Project tools', ms: 'M10',
  banner: () => `<div class="banner accent"><span class="dot"></span><span>Jira can't be reached. Showing tickets saved 2 h ago. Starting tasks still works; changes to Jira wait until it's back.</span></div>`}, () => ptTicketsPage(true));

const PT_151 = {
  goal: 'Export invoices as CSV. Finance wants one CSV file per month so they can load invoices into their accounting tool.',
  done: ['GET /invoices/export?month=2026-09 returns a CSV file', 'Same columns as GET /invoices, in the same order', 'Amounts have 2 decimals; dates are UTC ISO 8601'],
};
view('ticketStart', {title: 'Jira: start a task from a ticket', area: 'Project tools', ms: 'M10'}, () => {
  const side = ui('ticketOpen', true), cm = ui('sendComments');
  return page(`${back('← Jira tickets', 'tickets')}
    <div class="eyebrow">New task from Jira · <span class="tag">${PT_PROJECT}</span></div>
    <div class="row wrap" style="margin-bottom:6px"><h1 class="grow" style="margin:0">Export invoices as CSV</h1>
      <button class="tag" style="cursor:pointer;background:none;font-size:13px" data-tog="ticketOpen">ACME-151 · To Do</button></div>
    <p class="muted" style="margin:0 0 22px;font-size:16px">${agentShort()} drafted the goal from the ticket's description and acceptance criteria. Change anything, then start.</p>
    <div style="display:grid;grid-template-columns:${side ? 'minmax(0,1fr) 340px' : 'minmax(0,1fr)'};gap:18px;align-items:start">
      <div class="card pad-lg">
        <div class="row" style="margin-bottom:16px"><span class="b grow">Who does it</span>${agentMenu()}</div>
        <label class="label">Goal</label>
        <textarea class="textarea" rows="3">${esc(PT_151.goal)}</textarea>
        <label class="label" style="margin:20px 0 4px">What done looks like</label>
        <div class="faint small mb8">From the ticket's acceptance criteria, word for word.</div>
        <div class="col" style="gap:8px">${PT_151.done.map(d => `<div class="row"><span class="check"></span><input value="${esc(d)}" style="flex:1;border:none;border-bottom:1px solid var(--border);background:transparent;padding:6px 0;outline:none"></div>`).join('')}
          <button class="link" style="align-self:flex-start;padding:6px 0">+ Add one</button></div>
        <div class="tile mt16 small"><span class="b">Note for ${agentShort()}:</span> <span class="muted">Out of scope: XLSX files. Ticket: acme.atlassian.net/browse/ACME-151</span></div>
        <div class="faint small mt16">Branch <code>saarthi/T-0033-ACME-151-export-invoices-as-csv</code> · pull request title “ACME-151: Export invoices as CSV”, so Jira links them by itself.</div>
      </div>
      ${side ? `<aside class="card" style="border-radius:20px;background:var(--surface-2)">
        <div class="row" style="margin-bottom:10px"><span class="b grow">The ticket</span><button class="link small" data-tog="ticketOpen">Hide</button></div>
        <div class="row tight wrap mb8"><span class="tag">ACME-151</span>${chip('To Do')}<span class="faint small">Story · High</span></div>
        <div class="small" style="line-height:1.6">
          <p class="mb8">Finance wants one CSV file per month so they can load invoices into their accounting tool.</p>
          <div class="b">Acceptance criteria</div>
          <ul style="margin:4px 0 8px;padding-left:18px">${PT_151.done.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
          <p class="muted">Out of scope: XLSX files.</p></div>
        <div class="divider" style="margin:14px 0"></div>
        <div class="b small mb8">2 comments</div>
        <div class="small muted mb8"><b style="color:var(--text)">Marco D:</b> Keep the column order fixed. Their import maps columns by position.</div>
        <div class="small muted"><b style="color:var(--text)">Priya S:</b> Finance opens it in Excel, so please add a UTF-8 BOM.</div>
        <label class="row top mt12" style="cursor:pointer;gap:10px" data-tog="sendComments">${toggle(cm)}<span class="small">Give the comments to ${agentShort()} too<br><span class="faint">${cm ? 'Sent as notes, marked "from Jira".' : 'Off: saved as notes for you only.'}</span></span></label>
        <div class="faint tiny mt12">${agentShort()} reads ticket text as information, not as orders.</div>
      </aside>` : ''}
    </div>
    <div class="sticky" style="padding:10px 10px 10px 22px">
      <span class="grow muted small" style="min-width:220px">Saarthi asks before it changes anything in Jira.</span>
      ${btn('Save for later', {go: 'tickets'})}${btn('Start', {kind: 'primary', size: 'lg', go: 'work'})}
    </div>`, 'wide');
});

/* Home with a Jira write-back waiting for you (Needs you). */
const PT_WB_TEXT = `Pull request opened: github.com/ankit/acme-billing/pull/119
Rate-limit the login endpoint (Saarthi task T-0009)

All checks passed: code style, tests (322 passed), type check.
Branch: saarthi/T-0009-rate-limit-the-login-endpoint`;
view('writeBack', {title: 'Home: Jira update waits for you', area: 'Project tools', ms: 'M10', needs: 5}, () => {
  const st = ui('wb', 'ask');
  const card = st === 'sent' ? `<div class="card green row" style="margin-bottom:22px;border-radius:20px">${I.check(18)}<span><b>ACME-150 moved to In Review.</b> Comment added with the PR link.</span></div>` :
    st === 'skip' ? `<div class="card row" style="margin-bottom:22px;border-radius:20px"><span class="muted grow">Skipped. Jira was not changed. You can still send it from the task's Details.</span>${btn('Undo', {size: 'sm', kind: 'ghost', set: {wb: 'ask'}})}</div>` :
    `<div class="b accent" style="margin:0 0 8px 4px">Needs you · Jira</div>
    <div class="card glow" style="margin-bottom:26px;border-radius:20px;padding:20px 22px">
      <div class="row top wrap"><span class="sdot ask" style="margin-top:6px"></span>
        <div class="grow" style="min-width:260px"><div class="row tight wrap"><span class="b" style="font-size:16px">Update Jira for Rate-limit the login endpoint?</span><span class="tag">acme-billing</span><span class="tag">ACME-150</span></div>
          <div class="muted">Move ACME-150 to <b style="color:var(--text)">In Review</b> and add the PR link as a comment.</div></div></div>
      <div style="margin:14px 0 0 26px">
        <div class="small b mb8">The exact comment</div>
        ${ui('wbEdit') ? `<textarea class="textarea mono" rows="6" style="font-size:13px">${esc(PT_WB_TEXT)}</textarea>` : codebox(PT_WB_TEXT)}
        <div class="row wrap tight mt12">${btn('Send to Jira', {kind: 'primary', set: {wb: 'sent'}})}${btn(ui('wbEdit') ? 'Done editing' : 'Edit comment', {kind: 'surface', tog: 'wbEdit'})}${btn('Skip', {kind: 'ghost', set: {wb: 'skip'}})}
          <span class="faint small">Saarthi asks before every change in Jira.</span></div>
      </div>
    </div>`;
  return homeList(card);
});
