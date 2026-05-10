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
const exportStatusEl   = document.querySelector('#export-status');
const startOverBtn     = document.querySelector('#start-over');

// Tabs
const tabButtons   = document.querySelectorAll('.tab');
const tabUploadEl  = document.querySelector('#tab-upload');
const tabPasteEl   = document.querySelector('#tab-paste');

const COACH_VISIBLE_LIMIT = 3;

// ── App state ─────────────────────────────────────────────────────
const state = {
  view:           'intake',  // 'intake' | 'editor' | 'final'
  analysisResult: null,
  sections:       [],        // array of {id, label, currentText, proposedText, critique, status}
  sectionIndex:   0,
  approved:       {},        // {sectionId: editedText}
  skippedSuggestions: {},
  expandedCoachSections: {},
  editingSuggestionId: null,
  candidateName:  '',
  lastPayload:    null,
  currentTab:     'upload',
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
  hobbies:        'HOBBIES',
  interests:      'INTERESTS',
  languages:      'LANGUAGES',
  publications:   'PUBLICATIONS',
  research:       'RESEARCH',
  coursework:     'COURSEWORK',
  licenses:       'LICENSES',
  community:      'COMMUNITY INVOLVEMENT',
  extracurriculars: 'EXTRACURRICULARS',
  military:       'MILITARY SERVICE',
  development:    'PROFESSIONAL DEVELOPMENT',
  portfolio:      'PORTFOLIO',
};

// ── Init ──────────────────────────────────────────────────────────
async function init() {
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
    clearFormError();
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
  if (!isSupportedResumeFile(name)) {
    showFileStatus('Only PDF, TXT, MD, JPG, PNG, or WEBP files are supported.', true);
    return;
  }
  if (file.size > 4.5 * 1024 * 1024) {
    showFileStatus('File is too large. Keep it under 4.5 MB.', true);
    return;
  }
  const ALLOWED_MIMES = ['application/pdf', 'text/plain', 'text/markdown', 'text/x-markdown', 'image/jpeg', 'image/png', 'image/webp', ''];
  if (file.type && !ALLOWED_MIMES.includes(file.type)) {
    showFileStatus('Only PDF, TXT, MD, JPG, PNG, or WEBP files are supported.', true);
    return;
  }
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    resumeFileEl.files = dt.files;
  } catch (_) { /* DataTransfer not in some browsers */ }
  showFileStatus(`${file.name}  ·  ${(file.size / 1024).toFixed(0)} KB`);
}

function isSupportedResumeFile(name = '') {
  return ['.pdf', '.txt', '.md', '.jpg', '.jpeg', '.png', '.webp'].some((ext) => name.endsWith(ext));
}

function inferMimeFromFileName(name = '') {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return '';
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
      payload.resumeFileType   = file.type || inferMimeFromFileName(file.name);
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

  const workspace = el('div', 'section-workspace');
  const editorCol = el('div', 'section-editor-column');
  const coachCol  = el('div', 'section-coach-column');

  if (section.id === 'experience') {
    const preview = renderExperiencePreview(section.parsedFields?.entries || []);
    if (preview) editorPanelEl.appendChild(preview);
  }

  // Editable content starts from the parsed original. Suggested rewrites stay optional.
  const proposed = el('div', 'proposed-block');
  const propLbl  = el('p', 'field-label', section.currentText ? 'Edit this section' : 'Add this section');
  const textarea = document.createElement('textarea');
  textarea.id        = 'section-textarea';
  textarea.className = 'editor-textarea';
  textarea.value     = section.currentText || section.proposedText || '';
  const lineCount = (textarea.value.match(/\n/g) || []).length + 1;
  textarea.rows = Math.max(6, Math.min(lineCount + 2, 22));
  proposed.appendChild(propLbl);
  proposed.appendChild(textarea);
  editorCol.appendChild(proposed);

  renderCoachPanel(coachCol, section, textarea);

  workspace.append(editorCol, coachCol);
  editorPanelEl.appendChild(workspace);
}

function formatExperiencePreviewRole(entry = {}) {
  const companyLocation = [entry.company || '', entry.location || ''].filter(Boolean).join(', ');
  return [
    entry.title || '',
    companyLocation
  ].filter(Boolean).join(' - ') || 'Experience';
}

function renderExperiencePreview(entries = []) {
  const usableEntries = entries.filter((entry) => entry && (entry.title || entry.company || entry.dateRange || entry.bullets?.length));
  if (!usableEntries.length) return null;

  const preview = el('div', 'experience-preview');
  for (const entry of usableEntries) {
    const item = el('div', 'experience-preview-entry');
    const heading = el('div', 'experience-preview-heading');
    heading.append(
      el('span', 'experience-preview-role', formatExperiencePreviewRole(entry)),
      el('span', 'experience-preview-date', entry.dateRange || '')
    );
    item.appendChild(heading);

    const bullets = (entry.bullets || []).filter(Boolean);
    if (bullets.length) {
      const list = el('ul', 'experience-preview-bullets');
      for (const bullet of bullets) {
        list.appendChild(el('li', '', bullet));
      }
      item.appendChild(list);
    }

    preview.appendChild(item);
  }

  return preview;
}

function renderCoachPanel(container, section, textarea) {
  const label = el('p', 'field-label', 'Section coach');
  container.appendChild(label);

  const skipped = state.skippedSuggestions[section.id] || {};
  const suggestions = (section.suggestions || []).filter((item) => !skipped[item.id]);

  if (!suggestions.length) {
    if (section.status === 'needs-work' || section.status === 'missing') {
      const review = el('div', `suggestion-card severity-${section.status === 'missing' ? 'high' : 'medium'}`);
      review.append(
        el('p', 'suggestion-card-title', section.status === 'missing' ? `Add ${section.label}` : 'Review this section'),
        el('p', 'suggestion-card-detail', section.critique || section.parseWarning || 'This section needs a closer review before export.')
      );
      container.appendChild(review);
      return;
    }

    const empty = el('div', 'suggestion-card suggestion-card-ok');
    empty.append(
      el('p', 'suggestion-card-title', 'No major issues detected'),
      el('p', 'suggestion-card-detail', 'You can keep editing manually or continue to the next section.')
    );
    container.appendChild(empty);
    return;
  }

  if (suggestions.length > COACH_VISIBLE_LIMIT) {
    container.appendChild(renderCoachSummary(section, textarea, suggestions.length));
  }

  const isExpanded = Boolean(state.expandedCoachSections[section.id]);
  const visibleSuggestions = isExpanded
    ? suggestions
    : suggestions.slice(0, COACH_VISIBLE_LIMIT);

  for (const suggestion of visibleSuggestions) {
    container.appendChild(renderSuggestionCard(section, suggestion, textarea));
  }
}

function renderCoachSummary(section, textarea, totalCount) {
  const isExpanded = Boolean(state.expandedCoachSections[section.id]);
  const visibleCount = isExpanded ? totalCount : Math.min(totalCount, COACH_VISIBLE_LIMIT);
  const hiddenCount = Math.max(0, totalCount - COACH_VISIBLE_LIMIT);
  const summary = el('div', 'coach-summary');
  summary.appendChild(el('p', 'coach-summary-text', `Showing ${visibleCount} of ${totalCount} suggestions`));

  const toggle = el('button', 'btn-ghost coach-summary-toggle', isExpanded ? 'Show fewer' : `Show ${hiddenCount} more`);
  toggle.type = 'button';
  toggle.addEventListener('click', () => {
    persistSectionEdit(section, textarea);
    state.expandedCoachSections[section.id] = !isExpanded;
    renderSectionPanel(section);
  });
  summary.appendChild(toggle);
  return summary;
}

function renderSuggestionCard(section, suggestion, textarea) {
  const card = el('div', `suggestion-card severity-${suggestion.severity || 'medium'}`);
  card.appendChild(el('p', 'suggestion-card-title', suggestion.title || 'Suggestion'));
  if (suggestion.detail) {
    card.appendChild(el('p', 'suggestion-card-detail', suggestion.detail));
  }
  if (suggestion.type === 'skills-list' && suggestion.suggestedText) {
    const chips = el('div', 'skill-chip-list');
    for (const skill of suggestion.suggestedText.split(/\n|\|/).map(s => s.trim()).filter(Boolean)) {
      chips.appendChild(el('span', 'skill-chip', skill));
    }
    card.appendChild(chips);
  } else if (suggestion.originalText && suggestion.suggestedText) {
    const diff = el('div', 'suggestion-diff');
    diff.append(
      el('p', 'suggestion-before', `Before: ${suggestion.originalText}`),
      el('p', 'suggestion-after', `After: ${suggestion.suggestedText}`)
    );
    card.appendChild(diff);
  } else if (suggestion.suggestedText) {
    card.appendChild(el('p', 'suggestion-after', suggestion.suggestedText));
  }
  if (suggestion.rationale) {
    card.appendChild(el('p', 'suggestion-card-rationale', suggestion.rationale));
  }

  if (state.editingSuggestionId === suggestion.id && suggestion.suggestedText) {
    const edit = document.createElement('textarea');
    edit.className = 'suggestion-edit';
    edit.value = suggestion.suggestedText;
    edit.rows = Math.max(3, Math.min((suggestion.suggestedText.match(/\n/g) || []).length + 2, 8));
    card.appendChild(edit);
  }

  const actions = el('div', 'suggestion-actions');
  if (suggestion.applyMode && suggestion.applyMode !== 'informational') {
    const apply = el('button', 'btn-secondary suggestion-apply', 'Apply');
    apply.type = 'button';
    apply.addEventListener('click', () => {
      const editValue = card.querySelector('.suggestion-edit')?.value;
      applySuggestionToTextarea(textarea, suggestion, editValue);
      resolveSuggestion(section, textarea, suggestion.id);
    });
    actions.appendChild(apply);
  }
  if (suggestion.suggestedText) {
    const editBtn = el('button', 'btn-secondary suggestion-edit-btn', 'Edit');
    editBtn.type = 'button';
    editBtn.addEventListener('click', () => {
      persistSectionEdit(section, textarea);
      state.editingSuggestionId = state.editingSuggestionId === suggestion.id ? null : suggestion.id;
      renderSectionPanel(section);
    });
    actions.appendChild(editBtn);
  }
  const skip = el('button', 'btn-ghost suggestion-skip', 'Mark addressed');
  skip.type = 'button';
  skip.addEventListener('click', () => {
    resolveSuggestion(section, textarea, suggestion.id);
  });
  actions.appendChild(skip);
  card.appendChild(actions);
  return card;
}

function persistSectionEdit(section, textarea) {
  if (!section || !textarea) return;
  section.currentText = textarea.value;
  if (textarea.value.trim()) {
    state.approved[section.id] = textarea.value.trim();
  }
}

function resolveSuggestion(section, textarea, suggestionId) {
  persistSectionEdit(section, textarea);
  markSuggestionResolved(section.id, suggestionId);
  state.editingSuggestionId = null;
  renderSectionPanel(section);
}

function markSuggestionResolved(sectionId, suggestionId) {
  if (!sectionId || !suggestionId) return;
  state.skippedSuggestions[sectionId] = {
    ...(state.skippedSuggestions[sectionId] || {}),
    [suggestionId]: true
  };
}

function applySuggestionToTextarea(textarea, suggestion, overrideText) {
  const suggestedText = (overrideText ?? suggestion.suggestedText ?? '').trim();
  if (!suggestedText && suggestion.applyMode !== 'insert-field') return;

  if (suggestion.applyMode === 'replace-section') {
    textarea.value = suggestedText;
  } else if (suggestion.applyMode === 'replace-line') {
    const original = suggestion.originalText || '';
    const replacement = suggestedText;
    if (original && textarea.value.includes(original)) {
      textarea.value = textarea.value.replace(original, replacement);
    } else if (original && textarea.value.includes(`- ${original}`)) {
      textarea.value = textarea.value.replace(`- ${original}`, `- ${replacement}`);
    }
  } else if (suggestion.applyMode === 'insert-field') {
    const label = {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      linkedin: 'LinkedIn',
      github: 'GitHub',
      portfolio: 'Portfolio'
    }[suggestion.field] || 'Field';
    const insertion = suggestedText || `${label}: `;
    const prefix = textarea.value.trim() ? `${textarea.value.trim()}\n` : '';
    textarea.value = `${prefix}${insertion}`;
  }

  state.editingSuggestionId = null;
  textarea.focus();
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

  for (const section of state.sections) {
    const id = section.id;
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
  setView('final');
}

function renderFinalNotes() {
  finalNotesEl.replaceChildren();
  const severityRank = { high: 0, medium: 1, low: 2 };
  const unresolved = [];

  for (const section of state.sections) {
    const skipped = state.skippedSuggestions[section.id] || {};
    for (const suggestion of section.suggestions || []) {
      if (skipped[suggestion.id]) continue;
      if (!['high', 'medium'].includes(suggestion.severity || 'medium')) continue;
      unresolved.push({ section, suggestion });
    }

    if (section.parseWarning) {
      unresolved.push({
        section,
        suggestion: {
          id: `${section.id}-parse-warning`,
          severity: 'medium',
          title: 'Review parsing',
          detail: section.parseWarning
        }
      });
    }

    if (section.status === 'needs-work' && section.critique && !(section.suggestions || []).length) {
      unresolved.push({
        section,
        suggestion: {
          id: `${section.id}-critique`,
          severity: 'medium',
          title: 'Review this section',
          detail: section.critique
        }
      });
    }
  }

  unresolved.sort((a, b) => (severityRank[a.suggestion.severity] ?? 1) - (severityRank[b.suggestion.severity] ?? 1));
  const visible = unresolved.slice(0, 4);

  if (!visible.length) {
    finalNotesEl.appendChild(el('p', 'note-empty', 'No major issues detected.'));
    return;
  }
  for (const { section, suggestion } of visible) {
    const item   = el('div', 'note-item');
    const pri    = el('p', `note-priority ${suggestion.severity || 'medium'}`, section.label ?? 'Review');
    const title  = el('p', 'note-title', suggestion.title ?? '');
    const detail = el('p', 'note-detail', suggestion.detail ?? '');
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
  state.skippedSuggestions = {};
  state.expandedCoachSections = {};
  state.editingSuggestionId = null;
  state.candidateName  = '';
  state.lastPayload    = null;
  analyzeBtnEl.disabled = false;
  analyzeLabelEl.textContent = 'Analyze my resume';
  clearFormError();
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
    const result = await res.json().catch(() => ({}));
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
    state.skippedSuggestions = {};
    state.expandedCoachSections = {};
    state.editingSuggestionId = null;

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

// ── Export ────────────────────────────────────────────────────────
async function exportText(format, text) {
  if (!text?.trim()) return;
  const button = format === 'pdf' ? downloadPdfEl : downloadDocxEl;
  const originalLabel = button.textContent;
  button.disabled = true;
  exportStatusEl.textContent = `Preparing ${format.toUpperCase()}...`;
  exportStatusEl.classList.remove('export-status-error');
  button.textContent = 'Preparing...';

  try {
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
    exportStatusEl.textContent = `${format.toUpperCase()} ready. Check your downloads.`;
  } catch (err) {
    exportStatusEl.textContent = err.message || 'Export failed. Please try again.';
    exportStatusEl.classList.add('export-status-error');
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

// Use innerText so user edits to the contenteditable pre are captured
downloadDocxEl.addEventListener('click',   () => exportText('docx', finalDraftEl.innerText));
downloadPdfEl.addEventListener('click',    () => exportText('pdf',  finalDraftEl.innerText));

// Strip HTML formatting on paste into editable pres (keeps plain text only)
for (const pre of [finalDraftEl]) {
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
