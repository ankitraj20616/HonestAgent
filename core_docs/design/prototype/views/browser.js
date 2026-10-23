/* Browser testing (M11) and live preview (M12). Spec: section 11 of the Simple UI design.
   One engine on every OS: Chromium (system Chrome → Edge → Chromium → one-time browser kit). */

/* ---------- helpers for this file ---------- */
function bwin(url, body, o = {}) {
  return `<div class="bwin ${o.mini ? 'mini' : ''}"${o.style ? ` style="${o.style}"` : ''}><div class="bwin-bar"><span class="bwin-dots"><i></i><i></i><i></i></span><span class="bwin-url">${esc(url)}</span>${o.badge || ''}</div><div class="bwin-body"${o.h ? ` style="min-height:${o.h}px"` : ''}>${body}</div></div>`;
}
/* Small fake pages of the acme-billing app, used as screenshots. */
const BR_PAGES = {
  forgot: `<div class="b" style="font-size:1.15em;margin-bottom:6px">Forgot your password?</div><div class="mock-in">test-admin@acme.dev</div><div style="margin-top:6px"><span class="mock-btn">Send reset link</span></div>`,
  sent: `<div class="b" style="font-size:1.15em;margin-bottom:6px">Check your email</div><div class="muted">If an account exists, we sent a link. It works for 30 minutes.</div>`,
  mail: `<div class="faint">Test mailbox · 1 new</div><div class="b" style="margin:4px 0">Reset your Acme password</div><div class="accent">127.0.0.1:41012/reset?token=•••</div>`,
  newpw: `<div class="b" style="font-size:1.15em;margin-bottom:6px">Choose a new password</div><div class="mock-in">••••••••••••</div><div style="margin-top:6px"><span class="mock-btn">Save password</span></div>`,
  reused: `<div class="b" style="font-size:1.15em;margin-bottom:6px">This link has expired</div><div class="muted">Ask for a new one. (status 410)</div>`,
  dash: `<div class="b" style="font-size:1.15em;margin-bottom:6px">Welcome back, Test Admin</div><div class="muted">Invoices · Customers · Settings</div>`,
  invoices: `<div class="row" style="margin-bottom:6px"><span class="b grow" style="font-size:1.15em">Invoices</span><span class="mock-in" style="height:22px">1 Oct – 31 Oct</span><span class="mock-btn" style="height:22px">Download CSV</span></div>
    <div class="mock-row faint"><span>Number</span><span>Customer</span><span>Total</span><span>Status</span></div>
    <div class="mock-row"><span>INV-1042</span><span>Kiran Traders</span><span>₹18,400</span><span class="green">Paid</span></div>
    <div class="mock-row"><span>INV-1043</span><span>Nova Labs</span><span>₹6,250</span><span class="accent">Due</span></div>`,
  login: `<div class="b" style="font-size:1.15em;margin-bottom:6px">Log in to Acme Billing</div><div class="mock-in">Email</div><div class="mock-in" style="margin-top:6px">Password</div><div style="margin-top:6px"><span class="mock-btn">Log in</span></div>`,
};
const BR_RESET_STEPS = [
  ['/forgot-password', 'forgot', 'Opened the "Forgot password" page (logged out)', '1.2 s'],
  ['/forgot-password', 'sent', 'Asked for a link for test-admin@acme.dev → "Check your email" shows', '0.8 s'],
  ['127.0.0.1:8025 · test mailbox', 'mail', 'The email arrived in the test mailbox with a single-use link', '2.4 s'],
  ['/reset?token=•••', 'newpw', 'Opened the link and set a new password', '1.6 s'],
  ['/login', 'dash', 'Logged in with the new password → dashboard', '1.1 s'],
  ['/reset?token=•••', 'reused', 'Opened the same link again → "This link has expired" (410)', '0.9 s'],
];
const BR_CSV_STEPS = [
  ['/login', 'login', 'Logged in with the saved login test-admin', 'done'],
  ['/invoices', 'invoices', 'Opened Invoices and picked 1 Oct – 31 Oct', 'done'],
  ['/invoices', 'invoices', 'Clicked "Download CSV" → invoices-2026-10.csv (212 rows)', 'done'],
  ['/invoices', 'invoices', 'Checking the columns: number, date, customer, total, VAT, status', 'now'],
  ['/invoices', 'invoices', 'Download with no range → this month only', 'wait'],
];

/* ---------- Settings → Browser testing ---------- */
view('settingsBrowser', {title: 'Settings: Browser testing', area: 'Browser testing', ms: 'M11'}, () => {
  const none = ui('noBrowser'), kit = ui('kit', 'idle');
  const browserRow = none && kit !== 'done'
    ? stRow('Browser', kit === 'busy' ? 'Downloading Chromium headless shell… 64%. You can keep working.' : 'No Chrome, Edge or Chromium found on this computer. Saarthi can download a small Chromium just for tests, once. It is not part of the installer.',
        kit === 'busy' ? '<span class="spin"></span>' : btn('Download browser kit', {kind: 'primary', size: 'sm', set: {kit: 'busy'}}), {top: true})
    : stRow('Browser', kit === 'done' ? 'Chromium headless shell, downloaded to the Saarthi data folder. Used only for tests.' : 'Found on this computer. Saarthi uses one engine, Chromium, on Linux, macOS and Windows. It looks for Chrome, then Edge, then Chromium.',
        stChip(kit === 'done' ? 'Chromium 131 · browser kit' : 'Google Chrome 131 · found', 'green'), {top: true});
  return stFrame('settingsBrowser', `
    ${stSection('Browser', browserRow + stRow('Where it looks', 'Linux, macOS and Windows: Chrome → Edge → Chromium. Windows always has Edge, so nothing is downloaded there.', `<button class="link small" data-tog="noBrowser">${none ? 'Prototype: show browser found' : 'Prototype: show no browser found'}</button>`),
      'One engine everywhere, so a Live test behaves the same on every computer.')}
    ${stSection('This project · acme-billing', `
      ${stRow('Test the app in a browser', 'Off for backend-only projects.', stChip('On', 'green'))}
      ${stRow('Start the app with', 'Saarthi runs this in the task\'s own copy, on the task\'s own port.', '<code class="tag" style="font-size:13px">uv run uvicorn app.main:app --port {port}</code>')}
      ${stRow('App address', 'Where the Live test opens the app.', '<code class="tag" style="font-size:13px">http://127.0.0.1:{port}</code>')}
      ${stRow('Sites the browser may open', 'Anything else needs your OK first.', '<span class="tag">127.0.0.1</span><span class="tag">localhost</span><span class="tag">staging.acme.dev</span>')}
      ${stRow('Live test after every build', 'The agent opens the app and walks through "What done looks like", with screenshots and a short video.', '<span class="chip neutral">Auto</span>')}
      ${stRow('Must pass before review', 'No: the Live test shows in the verdict but never blocks.', '<span class="chip neutral">No</span>')}
    `, `These come from <code>[browser]</code> in <code>.saarthi/project.toml</code>. ${btn('Edit project.toml', {size: 'xs', act: 'toast', arg: 'Opened .saarthi/project.toml in your editor. Saarthi reloads it when you save.'})}`)}
    <div class="row" style="margin:0 0 10px"><h2 class="grow" style="margin:0;font-size:18px">Saved logins <span class="faint small" style="font-weight:500">· test accounts only</span></h2>${btn('Save a login', {kind: 'primary', size: 'sm', go: 'loginSave'})}</div>
    <div class="card flush list" style="margin-bottom:8px">
      <div class="item"><span class="okmark">${I.check()}</span><div class="grow"><div class="b">test-admin</div><div class="muted small">127.0.0.1 (local app with test data) · saved 2 days ago · last worked today 10:58</div></div>${btn('Log in again', {size: 'xs', go: 'loginSave'})}${btn('Remove', {size: 'xs', kind: 'ghost', act: 'toast', arg: 'Removed. The session file is deleted.'})}</div>
      <div class="item"><span class="badmark">!</span><div class="grow"><div class="b">test-viewer</div><div class="muted small">staging.acme.dev · expired yesterday</div></div>${btn('Log in again', {size: 'xs', go: 'loginSave'})}</div>
    </div>
    <div class="faint small" style="margin:0 4px 28px">Saarthi saves the browser session, never the password. It stays on this computer (data folder, only you can read it), never in the repo, never sent to the agent as text. Never use real customer or production accounts.</div>
  `);
});

/* ---------- Save a login (dialog over Browser testing) ---------- */
overlay('loginSave', () => {
  const st = ui('ls', 'ready');
  return dialog(`
    <div class="eyebrow">Browser testing · acme-billing</div>
    <h2 style="margin:0 0 6px">Save a login</h2>
    <p class="muted" style="margin:0 0 16px">Log in once by hand. Agents reuse this session in Live tests, so they never see a password.</p>
    ${st === 'saved' ? `<div class="card green row"><span class="okmark">${I.check()}</span><div class="grow"><div class="b">Saved as test-admin</div><div class="small">Session for 127.0.0.1 · agents can use it from the next Live test.</div></div></div>
      <div class="row mt16" style="justify-content:flex-end">${btn('Done', {kind: 'primary', go: 'settingsBrowser'})}</div>` : `
    <div class="grid" style="gap:12px">
      <div><label class="label">Name</label><input class="input" value="test-admin"></div>
      <div><label class="label">Site</label><select class="input"><option>http://127.0.0.1:{port} (this task's app)</option><option>https://staging.acme.dev</option></select></div>
      <div class="card accent small" style="padding:12px 14px"><b>Use a test account.</b> Never a real customer or production account: an agent with this login can click anything the account can.</div>
    </div>
    ${st === 'waiting' ? `<div class="card row mt16" style="padding:14px 16px"><span class="spin"></span><div class="grow"><div class="b">A Chrome window is open</div><div class="muted small">Log in there as the test user. Come back here when you see the dashboard.</div></div></div>
      ${bwin('127.0.0.1:41012/login', BR_PAGES.login, {style: 'margin-top:12px'})}` : ''}
    <div class="row mt16" style="justify-content:flex-end">${btn('Cancel', {go: 'settingsBrowser'})}${st === 'waiting' ? btn("I'm logged in · save it", {kind: 'primary', set: {ls: 'saved'}}) : btn('Open browser to log in', {kind: 'primary', set: {ls: 'waiting'}})}</div>`}
  `, {mid: true});
});
view('loginSave', {title: 'Browser testing: save a login', area: 'Browser testing', ms: 'M11', base: 'settingsBrowser', overlay: 'loginSave'}, () => '');

/* ---------- Task: agent testing it live ---------- */
view('liveTest', {title: 'Task: agent testing it live in the browser', area: 'Browser testing', ms: 'M11 M12'}, () => {
  const t = TM.csv;
  const steps = BR_CSV_STEPS.map(([url, pg, text, s]) => `<div class="row top" style="padding:10px 0;border-top:1px solid var(--border)">
      <span style="width:20px" class="${s === 'done' ? 'green' : s === 'now' ? 'blue' : 'faint'}">${s === 'done' ? '✓' : s === 'now' ? '<span class="spin"></span>' : '○'}</span>
      <div class="grow"><div class="${s === 'wait' ? 'faint' : ''}">${text}</div><div class="tiny faint mono">${url}</div></div>
      ${s === 'wait' ? '' : `<div style="width:190px" class="none">${bwin(url, BR_PAGES[pg], {mini: true})}</div>`}</div>`).join('');
  return tmTask({...t, agent: 'Claude'}, {
    status: ['blue', 'Working', {spin: true}], statusText: `All checks passed. Claude is testing it live in Chrome · step 4 of 5 ${tmTicket(t.ticket, 'In Progress')}`, noTicket: true, noGoal: true,
    top: `<section class="card mt24" style="border-radius:22px">
      <div class="row wrap"><div class="grow"><div class="display b" style="font-size:20px">Live test</div><div class="muted small">Claude opens the app at <code>127.0.0.1:41012</code> in its own copy, logged in as <b>test-admin</b>, and walks through "What done looks like".</div></div>${btn('Watch it live', {kind: 'primary', size: 'sm', go: 'livePreview'})}</div>
      <div class="mt12">${steps}</div>
      <div class="faint small mt12">Optional check: it shows in the verdict, it never blocks. Screenshots, a short video and the trace are kept as proof.</div>
    </section>`,
    feed: [['11:20', '<span class="green">✓</span> Code style, tests and type check passed'], ['11:20', 'Started the app: <code>uv run uvicorn app.main:app --port 41012</code> · ready in 2.1 s'], ['11:21', 'Opened Chrome (headless) with the saved login <b>test-admin</b>'], tmNow('Checking the downloaded CSV…')],
    baseFeed: false,
  });
});

/* ---------- Check and ship → See it work ---------- */
view('evidence', {title: 'Check and ship: see it work (screenshots, video, trace)', area: 'Browser testing', ms: 'M11'}, () => {
  const sel = ui('step', 0);
  return page(`${back('← Check and ship', 'check')}
    <div class="eyebrow">See it work · Add password reset API</div>
    <h1>Live test passed</h1>
    <div class="row wrap tight" style="margin-bottom:22px">${chip('6 of 6 steps', 'green')}<span class="muted">41 s · Chrome 131 (headless) · logged out flow, test mailbox · 11:06</span></div>
    <div class="grid" style="grid-template-columns:minmax(0,1.4fr) minmax(260px,1fr);gap:18px;align-items:start">
      <div>
        <div style="position:relative">${bwin(BR_RESET_STEPS[sel][0], BR_PAGES[BR_RESET_STEPS[sel][1]], {h: 260, badge: '<span class="tag">step ' + (sel + 1) + ' of 6</span>'})}
          ${ui('play') ? '' : '<button class="playbtn" style="border:none;background:none;cursor:pointer" data-set=\'{"play":true}\' aria-label="Play video"><span>▶</span></button>'}</div>
        <div class="row wrap mt12">${btn(ui('play') ? 'Playing · 0:12 of 0:41' : 'Play the video · 0:41', {size: 'sm', tog: 'play'})}${btn('Open trace', {size: 'sm', act: 'toast', arg: 'Opens the Playwright trace viewer: every click, network call and console line.'})}${btn('Download all · 4.2 MB', {size: 'sm', kind: 'ghost', act: 'toast', arg: 'Saved evidence-T-0012.zip'})}</div>
        <div class="card mt16"><div class="b mb8">Project E2E tests</div><div class="row"><span class="green">✓</span><span class="grow">12 passed</span><code class="muted tiny">npx playwright test</code></div><div class="faint small mt8">Their screenshots and traces are kept the same way.</div></div>
      </div>
      <div class="card flush list">${BR_RESET_STEPS.map(([url, , text, time], i) => `<div class="item click" style="${i === sel ? 'background:var(--accent-soft)' : ''}" data-set='{"step":${i},"play":false}'><span class="green">✓</span><div class="grow"><div class="small">${text}</div><div class="tiny faint mono">${url}</div></div><span class="tiny faint">${time}</span></div>`).join('')}</div>
    </div>
    ${emptyNote('Proof is kept with the task and removed with its copy of the repo (after 7 days). Screenshots of login pages are kept, but never sent to an agent as text.')}
  `, 'wide');
});

/* ---------- Needs you: a saved login stopped working ---------- */
view('loginExpired', {title: 'Task: saved login expired', area: 'Browser testing', ms: 'M11'}, () => {
  const t = TM.csv;
  return tmTask({...t, agent: 'Claude'}, {
    status: ['accent', 'Needs you', {dot: true}], statusText: `Live test paused ${tmTicket(t.ticket, 'In Progress')}`, noTicket: true, noGoal: true,
    top: `<section class="askbox">
      <div class="b accent mb8">Live test paused · the saved login stopped working</div>
      <div class="q">Your saved login <b>test-admin</b> expired.</div>
      <div class="muted mt8">Claude opened 127.0.0.1:41012 and was sent to the login page. Log in again once, and the Live test goes on from where it stopped.</div>
      <div class="row wrap mt16">${btn('Log in again', {kind: 'primary', size: 'lg', go: 'loginSave'})}${btn('Skip the live test this time', {size: 'lg', kind: 'surface', go: 'check'})}</div>
      <div class="faint small mt12">All other checks already passed. Skipping leaves the verdict on the other checks.</div>
    </section>`,
    feed: [['11:20', '<span class="green">✓</span> Code style, tests and type check passed'], ['11:21', 'Started the app on port 41012'], ['11:21', '<span class="accent">!</span> Login test-admin was refused: sent to /login']],
    baseFeed: false,
  });
});

/* ---------- M12: live preview ---------- */
view('livePreview', {title: 'Task → Live browser and preview window (M12)', area: 'Browser testing', ms: 'M12'}, () => {
  const os = ui('os', 'linux'), drive = ui('drive', false), canDrive = os !== 'mac';
  return tmTask({...TM.csv, agent: 'Claude'}, {
    tab: 'livePreview', noTicket: true, statusText: 'Live test · step 4 of 5', activityGo: 'liveTest',
    body: `<div class="row wrap" style="margin-bottom:14px"><span class="grow muted small">Watch Claude click through the app, or open the running app yourself. Both use this task's copy on port 41012.</span>
        <span class="faint small">Prototype: pick a system</span>${seg([['linux', 'Linux', {set: {os: 'linux', drive: false}}], ['mac', 'macOS', {set: {os: 'mac', drive: false}}], ['win', 'Windows', {set: {os: 'win', drive: false}}]], os)}</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">
        <div><div class="row tight mb8"><span class="b grow">Claude's browser · live</span>${chip('live', 'blue', {dot: true})}</div>
          ${bwin('127.0.0.1:41012/invoices', BR_PAGES.invoices + '<span class="cursor" style="right:22px;top:16px"></span>', {h: 220})}
          <div class="faint small mt8">A live picture of Claude's own Chrome. Works on every system. You watch; Claude clicks.</div></div>
        <div><div class="row tight mb8"><span class="b grow">Preview window · you</span>${btn('Open in its own window', {size: 'xs', act: 'toast', arg: 'Opened a Saarthi preview window on 127.0.0.1:41012. It cannot reach Saarthi itself.'})}</div>
          ${bwin('127.0.0.1:41012/invoices', BR_PAGES.invoices, {h: 220})}
          <div class="faint small mt8">The running app inside Saarthi, so you can click around yourself. It has no access to Saarthi's own commands.</div></div>
      </div>
      <div class="card mt16 row top wrap">
        <div class="grow" style="min-width:260px"><div class="b">Let Claude use the preview window</div>
          <div class="muted small">${canDrive ? `Works on ${os === 'linux' ? 'Linux (WebKit driver)' : 'Windows (Edge WebView2)'}. Claude clicks in the window you see, instead of its own browser.` : 'Not on macOS: its web view has no driver. Claude keeps using its own Chrome, which you still watch live on the left.'}</div></div>
        ${canDrive ? `<span data-tog="drive">${toggle(drive)}</span>` : '<span class="chip neutral">Not on macOS</span>'}
      </div>
      ${emptyNote('Saarthi checks this per system when it starts (M12 spike decides). Linux and Windows: yes. macOS: watch only.')}`,
  });
});
