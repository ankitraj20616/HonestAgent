/* Design notes: product rules, old word → new word, where every old feature lives, screens per milestone.
   The milestone map is built from the registered views, so it never goes out of date. */

const LABELS = [
  ['Command Deck', 'Home'], ['Capture / Quick capture', 'New task (Ctrl Alt N)'], ['Brief', 'Goal'], ['Acceptance criteria', 'What done looks like'],
  ['Run agent', 'Start'], ['Needs You', 'Needs you · "Claude has a question"'], ['Stages (8)', '4 statuses: To do, Working, Needs you, Done'],
  ['Task Room / Stream', 'Task page / Activity'], ['Code tab, Code Peek', 'Files (IDE view)'], ['Timeline, Checkpoint, Rewind', 'History, Undo point, Restore'],
  ['Worktree / Workspace', 'Its own copy of the repo'], ['Verify / Proof Card / Checks', 'Tests and checks'], ['Trust score + formula', 'Looks good / Take a look / Has problems'],
  ['Gate passed / closed', '(hidden) "All checks passed"'], ['Change Story / Chapters', 'What changed / groups'], ['Second opinion', 'Ask Codex to review'],
  ['Fix with agent', 'Let Claude fix it'], ['Override', 'Review anyway (with a reason)'], ['Approve + Ship', 'Approve and create pull request'],
  ['Remember / Memory updates', 'Lessons learned'], ['Memory', 'Lessons and notes'], ['Context Pack', 'What Claude reads'], ['Playbook', 'Saved instructions'],
  ['Research Desk', 'Just research'], ['Race mode', 'Side by side'], ['Permission profile', 'What agents may do: Read only / Safe / Full access'],
  ['Daemon', 'Background service (shown only when broken)'], ['Bead / Wheel', '(removed; logo only)'],
];
const MOVED = [
  ['Wheel, beads, agents dock', 'Gone from Home. Running agents are "Working" rows.', 'home'],
  ['8-column board', 'Project menu → Board view (4 columns, "Show detailed stages").', 'board'],
  ['Research desk', 'New task → More options → Just research.', 'research'],
  ['Start-run dialog', 'New task → agent picker + More options. Defaults need no choice.', 'newTask'],
  ['Code tab, Code Peek, tiny edit', 'Files: tree, tabs, changes vs main, why it changed, tiny edits.', 'files'],
  ['Browse a whole repo', 'Project menu → Project files (main branch, read-only).', 'projectFiles'],
  ['Terminal, Docs, Timeline tabs', 'Task page → More ▾.', 'terminal'],
  ['Worktree, branch, cost per run, Context Pack', 'More ▾ → Details → What Claude reads.', 'details'],
  ['Checkpoints and Rewind', 'More ▾ → History → Restore.', 'history'],
  ['Update from main, sync conflict', 'Details → Update from main; a conflict is a Needs-you card.', 'conflict'],
  ['Trust score, check commands, logs', 'Check and ship → How we decided / Show output.', 'check'],
  ['Second opinion', 'Optional card on Check and ship.', 'check'],
  ['Diff comments', 'Check and ship → open a group → Comment on a line.', 'comment'],
  ['Ship dialog', 'Default text; optional Edit pull request text.', 'editPr'],
  ['Memory and memory updates', 'Lessons and notes; Lessons learned card on Done.', 'notes'],
  ['Playbooks', 'Saved instructions.', 'playbooks'],
  ['Race mode', 'New task → More options → Side by side.', 'race'],
  ['Safety alerts', 'Needs-you card on the task page.', 'safetyAsk'],
  ['Permission profile, budget, sandbox', 'Settings → Safety and cost.', 'safety'],
  ['Jira tickets and write-back', 'Project menu → Jira tickets; write-back is a Needs-you row and a card on Done.', 'tickets'],
  ['Daemon status, versions', 'Settings → Health / About; full screen only when broken.', 'settingsHealth'],
  ['Several repos', 'All open in one window: project tabs and All projects on Home.', 'home'],
  ['Evidence (was Later)', 'M11: Live test after each build, "See it work" on Check and ship.', 'evidence'],
  ['Live preview (new)', 'M12: watch the agent\'s browser, open the app in a preview window.', 'livePreview'],
];

view('designNotes', {title: 'Design notes: words, what moved, screens per milestone', area: 'Notes', ms: ''}, () => {
  const ms = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'];
  const byMs = ms.map(m => [m, ORDER.filter(id => (VIEWS[id].ms || '').split(' ').includes(m))]);
  return page(`${back('← Home')}
    <h1>Design notes</h1>
    <p class="lead" style="margin:0 0 24px">The simple design keeps every feature but shows only the next step. Spec: <code>core_docs/design/2026-10-23-simple-ui-design.md</code>.</p>
    <div class="grid cols3 mb16">
      ${[['Many repos, one window', 'Project tabs and All projects on Home. Each task still gets its own branch and copy.', 'home'],
        ['IDE + ADE', 'Files shows the folder tree, code, and changes vs main, for exploring and reviewing.', 'files'],
        ['One app, every OS', 'Linux, macOS and Windows from one codebase. Installer under 40 MB.', 'settingsAbout'],
        ['Main flow: 5 steps', 'Describe → Start → answer → let Claude fix → approve and create the PR.', 'homeEmpty']].map(([t, d, to]) => `<div class="card click" style="cursor:pointer" ${VIEWS[to] ? `data-go="${to}"` : ""}><div class="display b" style="font-size:17px;margin-bottom:4px">${t}</div><div class="muted small">${d}</div></div>`).join('')}
    </div>
    <div class="grid cols" style="align-items:start">
      <div class="card flush"><div class="b" style="padding:16px 20px;font-size:17px;border-bottom:1px solid var(--border)">Old word → new word</div>
        ${LABELS.map(([o, n]) => `<div style="display:grid;grid-template-columns:1fr 1.3fr;gap:12px;padding:9px 20px;border-bottom:1px solid var(--border)"><span class="faint">${esc(o)}</span><span>${esc(n)}</span></div>`).join('')}</div>
      <div class="card flush"><div class="b" style="padding:16px 20px;font-size:17px;border-bottom:1px solid var(--border)">Hidden or moved, nothing removed</div>
        ${MOVED.map(([w, where, to]) => `<div style="padding:10px 20px;border-bottom:1px solid var(--border);cursor:pointer" ${VIEWS[to] ? `data-go="${to}"` : ""}><div class="b">${esc(w)}</div><div class="muted small">${esc(where)}</div></div>`).join('')}</div>
    </div>
    <h2>Screens per milestone</h2>
    <div class="card flush">${byMs.map(([m, ids]) => `<div class="row top" style="padding:12px 20px;border-bottom:1px solid var(--border)"><span class="b none" style="width:48px">${m}</span>
      <div class="row wrap tight grow">${ids.length ? ids.map(id => `<button class="btn xs" data-go="${id}">${esc(VIEWS[id].title)}</button>`).join('') : '<span class="faint small">CLI only, see the CLI screen</span>'}</div></div>`).join('')}</div>
  `, 'wide');
});
