/* The saarthi CLI: the same story as the app, typed in a terminal (M1, M2, M10).
   Helpers here start with "cli" so they never clash with other view files. */

const cliP = (cmd, dir = '~/OFFICE/acme-billing') => `<span class="d">${dir}</span> <span class="b">main</span> <span class="p">$</span> ${esc(cmd)}\n`;
const cliO = (text, cls = '') => (cls ? `<span class="${cls}">${esc(text)}</span>` : esc(text)) + '\n';
const cliGap = '\n';

const CLI_SESSIONS = [
  {id: 'projects', label: '1 · Projects', what: 'Check the background service, add a repo, and see every project you added. All of them open in the one app window.', html: () =>
    cliP('saarthi daemon status') +
    cliO('Service     running · pid 41822 · 127.0.0.1:7878 · up 3h 12m', 'g') +
    cliO('Version     1.0.0 · API 1') +
    cliO('Database    ~/.local/share/saarthi/saarthi.db') +
    cliO('Agents      claude 2.1.12 (logged in) · codex 0.46.0 (not logged in) · gemini 0.9.0 (logged in)') + cliGap +
    cliP('saarthi project add ~/OFFICE/acme-billing') +
    cliO('Added project "acme-billing"', 'g') +
    cliO('  repo      ~/OFFICE/acme-billing · branch main (from git)') +
    cliO('  checks    uv run ruff check . · uv run pytest -q · uv run pyright') +
    cliO('  created   .saarthi/project.toml (Saarthi never commits it)', 'd') + cliGap +
    cliP('saarthi project list') +
    cliO('NAME            OPEN TASKS   RUNNING   NEEDS YOU   REPO', 'd') +
    cliO('acme-billing             6         2           2   ~/OFFICE/acme-billing') +
    cliO('saarthi                  3         0           2   ~/OFFICE/saarthi') +
    cliO('clinic-portal            2         1           0   ~/OFFICE/clinic-portal')},
  {id: 'tasks', label: '2 · Tasks', what: 'Make a task, list tasks across every repo, and see a move that the stage rules refuse, with the reason and the fix.', html: () =>
    cliP('saarthi task new "Add password reset API"') +
    cliO('Created T-0012  Add password reset API  [To do · Inbox]  project acme-billing', 'g') +
    cliO('Goal drafted by Claude · 5 things in "what done looks like" · edit: saarthi goal edit T-0012', 'd') + cliGap +
    cliP('saarthi task list --all-projects') +
    cliO('ID      PROJECT        STATUS      TITLE', 'd') +
    cliO('T-0012  acme-billing   To do       Add password reset API') +
    cliO('T-0031  saarthi        Needs you   Upgrade Alembic to 1.14') +
    cliO('T-0009  acme-billing   Needs you   Rate-limit the login endpoint') +
    cliO('T-0018  acme-billing   Working     Invoice PDF export with line-item totals') +
    cliO('T-0044  clinic-portal  Working     Appointment reminders by SMS') +
    cliO('… 6 more · add --status needs-you to filter', 'd') + cliGap +
    cliP('saarthi task move T-0012 done') +
    cliO("Can't move T-0012 to Done: it hasn't been reviewed yet.", 'r') +
    cliO('Allowed from To do: Working (start it), Parked.') +
    cliO('Fix: saarthi run T-0012, then approve it in Check and ship.', 'p') +
    cliO('exit 1', 'd')},
  {id: 'run', label: '3 · Run and answer', what: 'Start Claude on a task and watch it work. When it has a question, the task moves to Needs you and you answer from the terminal.', html: () =>
    cliP('saarthi run T-0012 --agent claude') +
    cliO('Copy      saarthi/T-0012-add-password-reset-api (its own copy of the repo)', 'd') +
    cliO('Run       claude · build · started 10:41 · T-0012 → Working', 'b') +
    cliO('10:41  Read app/auth/routes.py, app/auth/security.py, app/mail.py') +
    cliO('10:44  Changed app/auth/reset.py  +42') +
    cliO('10:47  ✓ Ran the login tests · 4 passed', 'g') +
    cliO('10:52  ? Claude has a question                               T-0012 → Needs you', 'p') +
    cliO('       Should I store reset tokens in a new database table, or in Redis?') +
    cliO('       1. New table (Claude suggests this)   2. Use Redis') +
    cliO('       Answer: saarthi answer T-0012 "<your answer>"', 'd') + cliGap +
    cliP('saarthi answer T-0012 "New table"') +
    cliO('Sent to Claude. T-0012 → Working', 'g') +
    cliO('10:58  Added the table password_reset_tokens and wrote 7 tests') +
    cliO('11:04  ✓ All 3 checks passed · Looks good · review: saarthi check T-0012', 'g')},
  {id: 'docs', label: '4 · Docs', what: "See the agent's plan and the project files it reads, and print one of them.", html: () =>
    cliP('saarthi docs list T-0012') +
    cliO('#  KIND     TITLE                               FILE                                   SIZE', 'd') +
    cliO('1  plan     Plan · Add password reset API       plan-01JC5Q.md                         6 KB') +
    cliO('2  changed  Reset API notes                     core_docs/plans/T-0012-reset-api.md    2 KB') +
    cliO('3  pinned   acme-billing · rules for agents     CLAUDE.md                              3 KB') +
    cliO('4  pinned   Lessons learned                     core_docs/memory/lessons.md            2 KB') + cliGap +
    cliP('saarthi docs show plan') +
    cliO('# Plan · Add password reset API', 'p') +
    cliO('## Steps', 'b') +
    cliO('1. Add a password_reset_tokens table (Alembic migration 0042).') +
    cliO('2. Add app/auth/reset.py: make, hash, store and check tokens.') +
    cliO('3. Replace /forgot-password with POST /password-reset and /password-reset/confirm.') +
    cliO('4. Send the link with app/mail.send_mail.') +
    cliO('5. Tests: happy path, expired, reused, unknown email, weak password, email text.') +
    cliO('## Open question', 'b') +
    cliO('- Store tokens in a new table, or in Redis? (Asking the owner.)')},
  {id: 'tickets', label: '5 · Jira tickets', what: 'List your Jira tickets and start a task from one. The goal comes from the ticket. Saarthi asks before it changes Jira.', html: () =>
    cliP('saarthi tickets list --mine') +
    cliO('Mine · ACME · synced just now · 6 tickets', 'd') +
    cliO('KEY       TYPE   PRIORITY  STATUS       TASK    TITLE', 'd') +
    cliO('ACME-142  Story  High      In Review    T-0012  Add password reset API') +
    cliO('ACME-151  Story  High      To Do        -       Export invoices as CSV') +
    cliO('ACME-153  Bug    Highest   To Do        -       Tax rounding error') +
    cliO('ACME-147  Story  Medium    In Progress  T-0018  Invoice PDF footer') +
    cliO('ACME-150  Bug    Medium    In Review    T-0009  Rate limit login') +
    cliO('ACME-155  Story  Medium    To Do        -       Show VAT number on invoices') + cliGap +
    cliP('saarthi tickets start ACME-151') +
    cliO('Created T-0033  Export invoices as CSV  (ticket ACME-151)', 'g') +
    cliO('Goal      from the ticket · 3 things in "what done looks like"') +
    cliO('Comments  2 Jira comments saved as notes · not sent to the agent') +
    cliO('Branch    saarthi/T-0033-ACME-151-export-invoices-as-csv') +
    cliO('Next      saarthi run T-0033   (Jira is changed only after you say OK)', 'p')},
  {id: 'gemini', label: '6 · Gemini', what: 'Any task can use any agent. Here Gemini CLI works on the clinic-portal repo; the commands are the same.', html: () =>
    cliP('saarthi run T-0044 --agent gemini', '~/OFFICE/clinic-portal') +
    cliO('Copy      saarthi/T-0044-appointment-reminders-by-sms', 'd') +
    cliO('Run       gemini · build · started 14:02 · T-0044 → Working', 'b') +
    cliO('14:02  Read src/appointments/service.ts, src/notify/sms.ts') +
    cliO('14:05  Changed src/notify/reminders.ts  +58') +
    cliO('14:06  Changed src/appointments/service.ts  +12 −3') +
    cliO('14:08  Ran npm test · 1 failed: reminder sent for a cancelled visit', 'r') +
    cliO('14:09  Gemini is fixing it…') +
    cliO('14:11  ✓ npm test · 86 passed', 'g') +
    cliO('14:12  ✓ All 3 checks passed · Take a look: 1 goal not sure · saarthi check T-0044', 'g') + cliGap +
    cliP('saarthi task show T-0044 --json | jq .agent', '~/OFFICE/clinic-portal') +
    cliO('"gemini"')},
];

const CLI_HANDY = [
  ['See what needs you', 'saarthi task list --status needs-you'],
  ['Open a task in the app', 'saarthi open T-0012'],
  ['Review and ship', 'saarthi check T-0012 · saarthi ship T-0012'],
  ['Check your setup', 'saarthi doctor'],
];

view('cli', {title: 'The saarthi CLI', area: 'CLI', ms: 'M1 M2 M10'}, () => {
  const cur = CLI_SESSIONS.find(s => s.id === ui('cliTab')) || CLI_SESSIONS[0];
  return page(`${back('← Home', 'home')}
    <div class="eyebrow">Terminal</div>
    ${head({back: false, title: 'The saarthi CLI', sub: 'Everything in the app also works from the terminal. The app and the CLI talk to the same background service, so they always show the same tasks.'})}
    <div style="overflow-x:auto;margin-bottom:14px">${seg(CLI_SESSIONS.map(s => [s.id, s.label, {set: {cliTab: s.id}}]), cur.id)}</div>
    <p class="muted" style="margin:0 0 12px 4px">${cur.what}</p>
    ${term(cur.html())}
    <h2 style="font-size:18px">Handy commands</h2>
    <div class="card flush list">${CLI_HANDY.map(([what, cmd]) => `<div class="item" style="padding:12px 18px"><span class="grow">${what}</span><code class="muted">${cmd}</code></div>`).join('')}</div>
    ${emptyNote('Every command takes <code>--json</code>, so scripts can use it. <code>saarthi --help</code> lists them all.')}`, 'wide');
});
