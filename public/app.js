// ── DOM refs ──────────────────────────────────────────────────────
// Intake
const intakeView    = document.querySelector('#view-intake');
const intakeForm    = document.querySelector('#intake-form');
const analyzeBtnEl  = document.querySelector('#analyze-btn');
const analyzeLabelEl= document.querySelector('#analyze-label');
const resumeFileEl  = document.querySelector('#resume-file');
const resumeTextEl  = document.querySelector('#resume-text');
const targetRoleEl  = document.querySelector('#target-role');
const linkedinTextEl= document.querySelector('#linkedin-text');
const fileStatusEl  = document.querySelector('#file-status');
const formErrorEl   = document.querySelector('#form-error');
const dropZoneEl    = document.querySelector('#drop-zone');

// Editor
const editorView      = document.querySelector('#view-editor');
const editorBackBtn   = document.querySelector('#editor-back-btn');
const stepCounterEl   = document.querySelector('#step-counter');
const editorProgressEl= document.querySelector('#editor-progress');
const editorLoadingEl = document.querySelector('#editor-loading');
const editorLoadingMsg= document.querySelector('#editor-loading-msg');
const editorPanelEl   = document.querySelector('#editor-panel');
const editorActionsEl = document.querySelector('#editor-actions');
const editorSkipBtn   = document.querySelector('#editor-skip');
const editorContinueBtn= document.querySelector('#editor-continue');

// Final
const finalView        = document.querySelector('#view-final');
const finalBackBtn     = document.querySelector('#final-back-btn');
const finalDraftEl     = document.querySelector('#final-draft');
const finalNotesEl     = document.querySelector('#final-notes');
const downloadDocxEl   = document.querySelector('#download-docx');
const downloadPdfEl    = document.querySelector('#download-pdf');
const aiHintEl         = document.querySelector('#ai-hint');
const aiIdleEl         = document.querySelector('#ai-idle');
const aiActionsEl      = document.querySelector('#ai-actions');
const aiResultEl       = document.querySelector('#ai-result');
const aiResultLabelEl  = document.querySelector('#ai-result-label');
const aiRewriteEl      = document.querySelector('#ai-rewrite');
const aiNotesEl        = document.querySelector('#ai-notes');
const dlRewriteDocxEl  = document.querySelector('#download-rewrite-docx');
const dlRewritePdfEl   = document.querySelector('#download-rewrite-pdf');
// #try-another-action removed — action buttons are now always visible
const startOverBtn     = document.querySelector('#start-over');

// Tabs
const tabButtons   = document.querySelectorAll('.tab');
const tabUploadEl  = document.querySelector('#tab-upload');
const tabPasteEl   = document.querySelector('#tab-paste');

// ── App state ─────────────────────────────────────────────────────
const state = {
  view:           'intake',  // 'intake' | 'editor' | 'final'
  appConfig:      { openAiRewriteEnabled: false },
  analysisResult: null,
  sections:       [],        // array of {id, label, currentText, proposedText, critique, status}
  sectionIndex:   0,
  approved:       {},        // {sectionId: editedText}
  candidateName:  '',
  lastPayload:    null,
  currentTab:     'upload',
  rewriteInFlight: false,
};

// ── Section header labels for final resume assembly ───────────────
const SECTION_HEADERS = {
  heading:        null,         // no header — contact info goes at top
  summary:        'SUMMARY',
  experience:     'EXPERIENCE',
  skills:         'SKILLS',
  education:      'EDUCATION',
  projects:       'PROJECTS',
  certifications: 'CERTIFICATIONS',
  awards:         'AWARDS',
  volunteer:      'VOLUNTEER',
};

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('/api/config');
    state.appConfig = await res.json();
  } catch (_) { /* safe default: openAiRewriteEnabled: false */ }

  updateRewriteUI();

  // Clean LinkedIn OAuth query param
  const url = new URL(window.location.href);
  if (url.searchParams.has('linkedin')) {
    url.searchParams.delete('linkedin');
    window.history.replaceState({}, '', url);
  }
}

// ── Tab switching ─────────────────────────────────────────────────
for (const tab of tabButtons) {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    state.currentTab = target;
    for (const t of tabButtons) {
      t.classList.toggle('active', t.dataset.tab === target);
      t.setAttribute('aria-selected', String(t.dataset.tab === target));
    }
    tabUploadEl.classList.toggle('hidden', target !== 'upload');
    tabPasteEl.classList.toggle('hidden',  target !== 'paste');
  });
}

// ── Drag & drop ───────────────────────────────────────────────────
dropZoneEl.addEventListener('dragover', e => { e.preventDefault(); dropZoneEl.classList.add('drag-over'); });
dropZoneEl.addEventListener('dragleave', () => dropZoneEl.classList.remove('drag-over'));
dropZoneEl.addEventListener('drop', e => {
  e.preventDefault();
  dropZoneEl.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) applyFile(file);
});

resumeFileEl.addEventListener('change', () => {
  if (resumeFileEl.files?.[0]) applyFile(resumeFileEl.files[0]);
});

function applyFile(file) {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.pdf') && !name.endsWith('.txt') && !name.endsWith('.md')) {
    showFileStatus('Only PDF, TXT, or MD files are supported.', true);
    return;
  }
  if (file.size > 4.5 * 1024 * 1024) {
    showFileStatus('File is too large. Keep it under 4.5 MB.', true);
    return;
  }
  const ALLOWED_MIMES = ['application/pdf', 'text/plain', 'text/markdown', 'text/x-markdown', ''];
  if (file.type && !ALLOWED_MIMES.includes(file.type)) {
    showFileStatus('Only PDF, TXT, or MD files are supported.', true);
    return;
  }
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    resumeFileEl.files = dt.files;
  } catch (_) { /* DataTransfer not in some browsers */ }
  showFileStatus(`${file.name}  ·  ${(file.size / 1024).toFixed(0)} KB`);
}

function showFileStatus(msg, isError = false) {
  fileStatusEl.textContent = msg;
  fileStatusEl.classList.remove('hidden', 'error');
  if (isError) fileStatusEl.classList.add('error');
}

// ── Validation ────────────────────────────────────────────────────
function validate() {
  const hasFile  = state.currentTab === 'upload' && resumeFileEl.files?.[0];
  const hasPaste = state.currentTab === 'paste'  && resumeTextEl.value.trim();

  if (!hasFile && !hasPaste) {
    showFormError(state.currentTab === 'upload'
      ? 'Please upload a resume file (PDF, TXT, or MD).'
      : 'Please paste your resume text.');
    return false;
  }
  if (!targetRoleEl.value.trim()) {
    showFormError("Tell us what you're targeting — it helps us tailor the feedback.");
    return false;
  }
  return true;
}

function showFormError(msg) {
  formErrorEl.textContent = msg;
  formErrorEl.classList.remove('hidden');
}

function clearFormError() {
  formErrorEl.classList.add('hidden');
}

// ── File → base64 ─────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Build payload for /api/analyze ───────────────────────────────
async function buildPayload() {
  const payload = {
    targetRole:   targetRoleEl.value.trim(),
    linkedinText: linkedinTextEl.value.trim()
  };
  if (state.currentTab === 'upload') {
    const file = resumeFileEl.files?.[0];
    if (file) {
      payload.resumeFileName   = file.name;
      payload.resumeFileBase64 = await fileToBase64(file);
    }
  } else {
    payload.resumeText = resumeTextEl.value.trim();
  }
  return payload;
}

// ── View transitions ──────────────────────────────────────────────
function setView(view) {
  state.view = view;
  intakeView.classList.toggle('hidden', view !== 'intake');
  editorView.classList.toggle('hidden', view !== 'editor');
  finalView.classList.toggle('hidden',  view !== 'final');
  window.scrollTo({ top: 0 });
}

function showEditorLoading(msg = 'Analyzing your resume...') {
  setView('editor');
  editorLoadingEl.classList.remove('hidden');
  editorPanelEl.classList.add('hidden');
  editorActionsEl.classList.add('hidden');
  editorLoadingMsg.textContent = msg;
  stepCounterEl.textContent = '';
  editorProgressEl.style.width = '0%';
}

function showEditorSection() {
  editorLoadingEl.classList.add('hidden');
  editorPanelEl.classList.remove('hidden');
  editorActionsEl.classList.remove('hidden');

  const total   = state.sections.length;
  const current = state.sectionIndex + 1;
  const section = state.sections[state.sectionIndex];

  stepCounterEl.textContent = `${current} / ${total}`;
  editorProgressEl.style.width = `${(current / total) * 100}%`;

  // Update continue button label for last section
  editorContinueBtn.textContent = current === total ? 'Finish →' : 'Continue →';

  renderSectionPanel(section);
}

// ── Section panel renderer ────────────────────────────────────────
function renderSectionPanel(section) {
  editorPanelEl.replaceChildren();

  // Header row: section name + status badge
  const header = el('div', 'section-panel-header');
  const title  = el('h2',  'section-panel-title', section.label);
  const badge  = el('span', `status-badge ${section.status}`);
  badge.textContent = {
    ok:          'Looks good',
    'needs-work':'Needs work',
    missing:     'Not found',
  }[section.status] ?? section.status;
  header.append(title, badge);
  editorPanelEl.appendChild(header);

  // Parsing confidence warning (low-confidence parse signal)
  if (section.parseWarning) {
    const warn = el('div', 'parse-warning');
    const warnIcon = el('span', 'parse-warning-icon', '⚠');
    const warnText = el('p', 'parse-warning-text', section.parseWarning);
    warn.append(warnIcon, warnText);
    editorPanelEl.appendChild(warn);
  }

  // Current content (read-only) — only show if there's content
  if (section.currentText) {
    const block = el('div', 'current-block');
    const lbl   = el('p',   'field-label', 'What we found');
    const pre   = el('pre', 'current-text', section.currentText);
    block.append(lbl, pre);
    editorPanelEl.appendChild(block);
  }

  // Critique bar — what seems off
  if (section.critique) {
    const bar      = el('div', `critique-bar ${section.status}`);
    const iconChar = section.status === 'ok' ? '✓' : section.status === 'missing' ? '+' : '!';
    const icon     = el('span', `critique-icon ${section.status}`, iconChar);
    const text     = el('p',   'critique-text', section.critique);
    bar.append(icon, text);
    editorPanelEl.appendChild(bar);
  }

  // Proposed / editable content — the suggested rewrite
  const proposed = el('div', 'proposed-block');
  let propLblText = section.currentText
    ? 'Suggested rewrite — edit freely'
    : 'Suggested content — edit to fit your background';
  // For summary: when proposed === current (existing summary preserved), be explicit
  if (section.id === 'summary' && section.summarySource && section.summarySource !== 'none'
      && section.currentText && section.currentText.trim() === section.proposedText?.trim()) {
    propLblText = 'Your existing summary — edit to refine it';
  }
  const propLbl  = el('p', 'field-label', propLblText);
  const textarea = document.createElement('textarea');
  textarea.id        = 'section-textarea';
  textarea.className = 'editor-textarea';
  textarea.value     = section.proposedText;
  const lineCount = (section.proposedText.match(/\n/g) || []).length + 1;
  textarea.rows = Math.max(6, Math.min(lineCount + 2, 22));
  proposed.append(propLbl, textarea);
  editorPanelEl.appendChild(proposed);

  // Change log — per-bullet explanations (experience section)
  if (section.changeLog?.length) {
    const changeWrap = el('div', 'change-log');
    const changeLbl  = el('p',  'field-label', `Why we changed ${section.changeLog.length} bullet${section.changeLog.length > 1 ? 's' : ''}`);
    changeWrap.appendChild(changeLbl);

    for (const change of section.changeLog.slice(0, 6)) {
      const item = el('div', 'change-item');

      const origRow  = el('div', 'change-row change-original');
      const origBadge= el('span', 'change-badge before', 'Before');
      const origText = el('span', 'change-text', change.original);
      origRow.append(origBadge, origText);

      const revRow   = el('div', 'change-row change-revised');
      const revBadge = el('span', 'change-badge after', 'After');
      const revText  = el('span', 'change-text', change.revised);
      revRow.append(revBadge, revText);

      const reason   = el('p', 'change-reason', `Why: ${change.reason}`);

      item.append(origRow, revRow, reason);
      changeWrap.appendChild(item);
    }

    editorPanelEl.appendChild(changeWrap);
  }
}

// ── Section navigation ────────────────────────────────────────────
function getCurrentTextareaValue() {
  return document.querySelector('#section-textarea')?.value?.trim() ?? '';
}

function advanceSection(skipCurrent = false) {
  if (!skipCurrent) {
    const val = getCurrentTextareaValue();
    const id  = state.sections[state.sectionIndex]?.id;
    if (id && val) {
      state.approved[id] = val;
    }
  }

  state.sectionIndex++;

  if (state.sectionIndex >= state.sections.length) {
    buildFinalView();
    return;
  }

  showEditorSection();
}

function goBackSection() {
  if (state.sectionIndex === 0) {
    // Back to intake
    setView('intake');
    analyzeLabelEl.textContent = 'Analyze my resume';
    analyzeBtnEl.disabled = false;
  } else {
    state.sectionIndex--;
    showEditorSection();
  }
}

editorContinueBtn.addEventListener('click', () => advanceSection(false));
editorSkipBtn.addEventListener('click',     () => advanceSection(true));
editorBackBtn.addEventListener('click',     () => goBackSection());

// ── Final view assembly ───────────────────────────────────────────
function assembleFinalResume() {
  const parts  = [];
  const sOrder = state.sections.map(s => s.id);

  for (const id of sOrder) {
    const text = state.approved[id];
    if (!text?.trim()) continue;

    const header = SECTION_HEADERS[id];
    if (header) {
      parts.push(header);
    }
    parts.push(text.trim());
    parts.push('');
  }

  return parts.join('\n').trim();
}

function buildFinalView() {
  const draft = assembleFinalResume();
  finalDraftEl.textContent = draft;

  renderFinalNotes();
  updateRewriteUI();
  setView('final');
}

function renderFinalNotes() {
  finalNotesEl.replaceChildren();
  const suggestions = state.analysisResult?.suggestions ?? [];
  if (!suggestions.length) {
    finalNotesEl.innerHTML = '<p style="font-size:0.8125rem;color:var(--muted)">No major issues detected.</p>';
    return;
  }
  for (const s of suggestions.slice(0, 8)) {
    const item   = el('div', 'note-item');
    const pri    = el('p', `note-priority ${(s.priority ?? 'medium').toLowerCase()}`, s.priority ?? 'Note');
    const title  = el('p', 'note-title', s.title ?? '');
    const detail = el('p', 'note-detail', s.detail ?? '');
    item.append(pri, title, detail);
    finalNotesEl.appendChild(item);
  }
}

// ── Final view navigation ─────────────────────────────────────────
finalBackBtn.addEventListener('click', () => {
  // Go back to last section in editor
  state.sectionIndex = state.sections.length - 1;
  setView('editor');
  showEditorSection();
});

startOverBtn.addEventListener('click', () => {
  // Reset all state and go to intake
  state.analysisResult = null;
  state.sections       = [];
  state.sectionIndex   = 0;
  state.approved       = {};
  state.candidateName  = '';
  state.lastPayload    = null;
  aiResultEl.classList.add('hidden');
  setView('intake');
});

// ── Main analysis flow ────────────────────────────────────────────
intakeForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (analyzeBtnEl.disabled) return;
  clearFormError();

  if (!validate()) return;

  analyzeBtnEl.disabled = true;
  analyzeLabelEl.textContent = 'Analyzing...';

  showEditorLoading('Analyzing your resume...');

  try {
    const payload = await buildPayload();
    state.lastPayload = payload;

    const res    = await fetch('/api/analyze', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? 'Analysis failed. Please try again.');

    state.analysisResult = result;
    state.candidateName  = result.candidateName ?? '';

    // Populate sections from sectionEditorData
    const rawSections = result.sectionEditorData;
    if (Array.isArray(rawSections) && rawSections.length > 0) {
      state.sections = rawSections;
    } else {
      // Fallback: synthesize from rewrittenResume if editor data is missing
      state.sections = synthesizeFallbackSections(result);
    }

    state.sectionIndex = 0;
    state.approved     = {};

    showEditorSection();
  } catch (err) {
    setView('intake');
    analyzeBtnEl.disabled = false;
    analyzeLabelEl.textContent = 'Analyze my resume';
    showFormError(err.message ?? 'Something went wrong. Please try again.');
  }
});

/** Emergency fallback: build a single-section flow from the full rewrite */
function synthesizeFallbackSections(result) {
  return [{
    id:           'heading',
    label:        'Your Resume',
    currentText:  '',
    proposedText: result.rewrittenResume ?? '',
    critique:     'Review and edit the draft below.',
    status:       'ok',
  }];
}

const AI_ACTION_LABELS = {
  'tighten':           'Tighten wording',
  'ats':               'Improve ATS match',
  'tailor':            'Tailor to target role',
  'shorten':           'Shorten to one page',
  'strengthen-bullets':'Strengthen bullets',
};

// ── Rewrite UI state ──────────────────────────────────────────────
function updateRewriteUI() {
  const enabled = state.appConfig.openAiRewriteEnabled;
  for (const btn of document.querySelectorAll('.ai-action-btn')) {
    btn.disabled = !enabled;
  }
  aiHintEl.textContent = enabled
    ? ''
    : 'Refinement requires a configured AI provider. Add your OPENAI_API_KEY to .env to enable.';
}

// ── AI Action handler ─────────────────────────────────────────────
async function triggerAiAction(action) {
  if (state.rewriteInFlight || !state.appConfig.openAiRewriteEnabled) return;

  state.rewriteInFlight = true;

  for (const btn of document.querySelectorAll('.ai-action-btn')) {
    btn.disabled = true;
    if (btn.dataset.action === action) {
      btn.querySelector('.ai-action-label').textContent = 'Working…';
    }
  }
  aiHintEl.textContent = '';

  try {
    const payload = { ...(state.lastPayload ?? {}) };
    if (!payload.resumeText && state.analysisResult?.extractedResumeText) {
      payload.resumeText = state.analysisResult.extractedResumeText;
    }
    // Use innerText so edits to the contenteditable pre are captured
    const assembled = finalDraftEl.innerText?.trim();
    if (assembled) payload.resumeText = assembled;
    payload.action = action;

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 120_000);
    let res;
    try {
      res = await fetch('/api/rewrite', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  controller.signal
      });
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') throw new Error('AI action timed out. Please try again.');
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }
    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? 'Action failed. Please try again.');

    aiResultLabelEl.textContent = `${AI_ACTION_LABELS[action] ?? 'AI-revised'} version`;
    // Set content on contenteditable pre via textContent (safe — no HTML)
    aiRewriteEl.textContent = result.rewrittenResume ?? 'No result returned.';
    renderAiNotes(result.summary, result.bulletImprovements ?? [], result.notes ?? []);

    aiResultEl.classList.remove('hidden');
    // Keep action buttons visible — just show the "Run another pass:" label
    document.querySelector('#ai-next-label').classList.remove('hidden');
    aiHintEl.textContent = '';

    aiResultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    aiHintEl.textContent = err.message ?? 'Action failed. Please try again.';
  } finally {
    state.rewriteInFlight = false;
    for (const btn of document.querySelectorAll('.ai-action-btn')) {
      const a = btn.dataset.action;
      if (AI_ACTION_LABELS[a]) {
        btn.querySelector('.ai-action-label').textContent = AI_ACTION_LABELS[a];
      }
      btn.disabled = !state.appConfig.openAiRewriteEnabled;
    }
  }
}

// Delegate click on all action buttons
document.querySelector('#ai-actions').addEventListener('click', e => {
  const btn = e.target.closest('.ai-action-btn');
  if (btn && !btn.disabled) triggerAiAction(btn.dataset.action);
});

// ── AI notes — grouped rendering (Issue 6) ────────────────────────
function renderAiNotes(summary = '', bulletImprovements = [], notes = []) {
  aiNotesEl.replaceChildren();
  if (!summary && !bulletImprovements.length && !notes.length) return;

  // Group 1: What this pass did (summary)
  if (summary) {
    const group = makeNoteGroup('✦', 'What this pass did');
    const item  = el('div', 'ai-note-item summary-item', summary);
    group.appendChild(item);
    aiNotesEl.appendChild(group);
  }

  // Group 2: Bullet improvements
  const improvements = bulletImprovements.filter(Boolean);
  if (improvements.length) {
    const group = makeNoteGroup('↻', 'Bullet changes');
    for (const imp of improvements.slice(0, 8)) {
      const item = el('div', 'ai-note-item', imp);
      group.appendChild(item);
    }
    aiNotesEl.appendChild(group);
  }

  // Group 3: Suggestions / caveats
  const caveats = notes.filter(Boolean);
  if (caveats.length) {
    const group = makeNoteGroup('→', 'Review before sending');
    for (const note of caveats) {
      const item = el('div', 'ai-note-item muted', note);
      group.appendChild(item);
    }
    aiNotesEl.appendChild(group);
  }
}

function makeNoteGroup(icon, title) {
  const group  = el('div', 'ai-note-group');
  const header = el('div', 'ai-note-group-header');
  const ico    = el('span', 'ai-note-group-icon', icon);
  const lbl    = el('span', 'ai-note-group-title', title);
  header.append(ico, lbl);
  group.appendChild(header);
  return group;
}

// ── Export ────────────────────────────────────────────────────────
async function exportText(format, text) {
  if (!text?.trim()) return;
  const res = await fetch('/api/export', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({
      format,
      text,
      candidateName: state.candidateName   // used server-side for filename
    })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Export failed');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const match    = disposition.match(/filename="([^"]+)"/);
  const fileName = match?.[1] ?? `resume.${format}`;
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Use innerText so user edits to the contenteditable pre are captured
downloadDocxEl.addEventListener('click',   () => exportText('docx', finalDraftEl.innerText).catch(console.error));
downloadPdfEl.addEventListener('click',    () => exportText('pdf',  finalDraftEl.innerText).catch(console.error));
dlRewriteDocxEl.addEventListener('click', () => exportText('docx', aiRewriteEl.innerText).catch(console.error));
dlRewritePdfEl.addEventListener('click',  () => exportText('pdf',  aiRewriteEl.innerText).catch(console.error));

// Strip HTML formatting on paste into editable pres (keeps plain text only)
for (const pre of [finalDraftEl, aiRewriteEl]) {
  pre.addEventListener('paste', e => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    sel.deleteFromDocument();
    const range = sel.getRangeAt(0);
    range.insertNode(document.createTextNode(text));
    sel.collapseToEnd();
  });
}

// ── DOM utility ───────────────────────────────────────────────────
function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className)   node.className   = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

// ── Boot ──────────────────────────────────────────────────────────
init();
