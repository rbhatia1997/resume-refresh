const form = document.querySelector("#analyze-form");
const statusEl = document.querySelector("#status");
const suggestionsEl = document.querySelector("#suggestions");
const snapshotEl = document.querySelector("#snapshot");
const draftEl = document.querySelector("#draft");
const aiRewriteEl = document.querySelector("#ai-rewrite");
const aiNotesEl = document.querySelector("#ai-notes");
const loginLinkEl = document.querySelector("#linkedin-login");
const logoutButtonEl = document.querySelector("#linkedin-logout");
const authStateEl = document.querySelector("#auth-state");
const profileCardEl = document.querySelector("#linkedin-profile-card");
const profileEl = document.querySelector("#linkedin-profile");
const rewriteButtonEl = document.querySelector("#rewrite-button");
const downloadDraftDocxEl = document.querySelector("#download-draft-docx");
const downloadDraftPdfEl = document.querySelector("#download-draft-pdf");
const downloadRewriteDocxEl = document.querySelector("#download-rewrite-docx");
const downloadRewritePdfEl = document.querySelector("#download-rewrite-pdf");
const chatFeedEl = document.querySelector("#chat-feed");
const chatFormEl = document.querySelector("#chat-form");
const chatInputEl = document.querySelector("#chat-input");
const chatPromptLabelEl = document.querySelector("#chat-prompt-label");
const chatShortcutsEl = document.querySelector("#chat-shortcuts");
const chatSkipEl = document.querySelector("#chat-skip");
const guideTitleEl = document.querySelector("#guide-title");
const guideCopyEl = document.querySelector("#guide-copy");
const checklistEl = document.querySelector("#source-checklist");
const stepPanes = [...document.querySelectorAll(".step-pane")];
const stepChips = [...document.querySelectorAll(".step-chip")];
const goStepButtons = [...document.querySelectorAll("[data-go-step], [data-next-step]")];

const fieldEls = {
  targetRole: document.querySelector("#target-role"),
  linkedinUrl: document.querySelector("#linkedin-url"),
  linkedinText: document.querySelector("#linkedin-text"),
  resumeText: document.querySelector("#resume-text"),
  rewriteStyle: document.querySelector("#rewrite-style"),
  resumeFile: document.querySelector("#resume-file")
};

let appConfig = {
  linkedInAuthEnabled: false,
  requiresAppSecret: false,
  openAiRewriteEnabled: false
};

let sessionProfile = null;
let analysisResult = null;
let currentStep = 1;
let activeChatField = "targetRole";
let analysisInFlight = false;
let rewriteInFlight = false;

function readLinkedInStatusFromUrl() {
  const url = new URL(window.location.href);
  const status = url.searchParams.get("linkedin");
  if (!status) {
    return null;
  }
  url.searchParams.delete("linkedin");
  window.history.replaceState({}, "", url);
  return status;
}

function setStatus(message, error = false) {
  statusEl.textContent = message;
  statusEl.dataset.error = error ? "true" : "false";
}

function addChatMessage({ role = "assistant", title = "", body = "", actions = [] }) {
  const card = document.createElement("article");
  card.className = `chat-bubble ${role}`;

  if (title) {
    const heading = document.createElement("p");
    heading.className = "chat-title";
    heading.textContent = title;
    card.appendChild(heading);
  }

  const copy = document.createElement("p");
  copy.className = "chat-body";
  copy.textContent = body;
  card.appendChild(copy);

  if (actions.length) {
    const row = document.createElement("div");
    row.className = "chat-actions";
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action.secondary ? "button-secondary" : "button-link";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      row.appendChild(button);
    }
    card.appendChild(row);
  }

  chatFeedEl.appendChild(card);
  chatFeedEl.scrollTop = chatFeedEl.scrollHeight;
}

function seedChat() {
  chatFeedEl.replaceChildren();
  addChatMessage({
    title: "Start here",
    body: "Connect LinkedIn if you want me to prefill your name and email. Then answer the prompts here or use the form below."
  });
}

function buildShortcutButton({ label, onClick, secondary = true }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = secondary ? "button-secondary chat-shortcut" : "button-link chat-shortcut";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function focusChatField(fieldName) {
  activeChatField = fieldName;
  const labels = {
    targetRole: "Target role",
    linkedinUrl: "LinkedIn URL",
    linkedinText: "LinkedIn text",
    resumeText: "Resume text"
  };
  const placeholders = {
    targetRole: "Example: Senior Product Manager",
    linkedinUrl: "Paste your public LinkedIn URL",
    linkedinText: "Paste About, Experience, Skills",
    resumeText: "Paste your current resume"
  };
  chatPromptLabelEl.textContent = labels[fieldName] || "Chat input";
  chatInputEl.placeholder = placeholders[fieldName] || "Type here";
  chatInputEl.focus();
}

function renderShortcuts() {
  chatShortcutsEl.replaceChildren();
  const shortcuts = [
    { label: "Target role", onClick: () => { setStep(2); focusChatField("targetRole"); } },
    { label: "LinkedIn URL", onClick: () => { setStep(2); focusChatField("linkedinUrl"); } },
    { label: "LinkedIn text", onClick: () => { setStep(2); focusChatField("linkedinText"); } },
    { label: "Resume text", onClick: () => { setStep(2); focusChatField("resumeText"); } }
  ];

  if (fieldEls.resumeText.value.trim() || fieldEls.resumeFile.files[0]) {
    shortcuts.push({
      label: "Analyze now",
      secondary: false,
      onClick: () => form.requestSubmit()
    });
  }

  for (const shortcut of shortcuts) {
    chatShortcutsEl.appendChild(buildShortcutButton(shortcut));
  }
}

function updateGuide(step) {
  const guideByStep = {
    1: {
      title: sessionProfile ? "LinkedIn is connected. Continue to sources." : "Connect LinkedIn or skip to manual entry.",
      copy: sessionProfile
        ? "Your name and email can be prefilled from LinkedIn. Add your resume next."
        : "Connecting LinkedIn prefills basic identity only. You can still do everything manually."
    },
    2: {
      title: "Add source material, then run analysis.",
      copy: "Fastest path: paste your resume or upload a PDF. Add LinkedIn text if you want stronger keyword matching."
    },
    3: {
      title: "Review the draft and close the biggest gaps.",
      copy: "Check the snapshot first. If the draft looks usable, download it or move to AI rewrite."
    },
    4: {
      title: "Review the AI rewrite and export the final version.",
      copy: "Use the AI version when you want a cleaner tone, then export DOCX or PDF."
    }
  };
  const guide = guideByStep[step] || guideByStep[1];
  guideTitleEl.textContent = guide.title;
  guideCopyEl.textContent = guide.copy;
}

function getChecklistItems() {
  const hasResumeSource = Boolean(fieldEls.resumeText.value.trim() || fieldEls.resumeFile.files[0]);
  return [
    {
      label: sessionProfile ? "LinkedIn connected" : "LinkedIn optional",
      done: Boolean(sessionProfile)
    },
    {
      label: "Resume source",
      done: hasResumeSource
    },
    {
      label: "LinkedIn text",
      done: Boolean(fieldEls.linkedinText.value.trim())
    },
    {
      label: "Target role",
      done: Boolean(fieldEls.targetRole.value.trim())
    }
  ];
}

function renderChecklist() {
  checklistEl.replaceChildren();
  for (const item of getChecklistItems()) {
    const row = document.createElement("div");
    row.className = `check-item ${item.done ? "is-done" : ""}`;
    row.textContent = `${item.done ? "Done" : "Need"}  ${item.label}`;
    checklistEl.appendChild(row);
  }
  renderShortcuts();
}

function setStep(step) {
  currentStep = step;
  for (const pane of stepPanes) {
    pane.classList.toggle("hidden", Number(pane.dataset.step) !== step);
  }
  for (const chip of stepChips) {
    chip.classList.toggle("is-active", Number(chip.dataset.goStep) === step);
  }

  const stepMessages = {
    1: "Connect LinkedIn first, or skip if you want to paste everything manually.",
    2: "Paste LinkedIn text, paste your resume, or upload a resume PDF. Then run analysis.",
    3: "Review the snapshot, fix gaps, and download the generated draft if it looks good.",
    4: "Run AI rewrite when you want a more polished version, then export it."
  };
  updateGuide(step);
  renderChecklist();
  setStatus(stepMessages[step] || "");
}

for (const button of goStepButtons) {
  button.addEventListener("click", () => {
    const target = Number(button.dataset.goStep || button.dataset.nextStep);
    if (target) {
      setStep(target);
    }
  });
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      resolve(value.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getFormPayload() {
  return {
    targetRole: fieldEls.targetRole.value.trim(),
    linkedinUrl: fieldEls.linkedinUrl.value.trim(),
    linkedinText: fieldEls.linkedinText.value.trim(),
    resumeText: fieldEls.resumeText.value.trim(),
    style: fieldEls.rewriteStyle.value
  };
}

function hasResumeSource() {
  return Boolean(fieldEls.resumeText.value.trim() || fieldEls.resumeFile.files[0]);
}

function isReadyForAnalysis() {
  return Boolean(fieldEls.targetRole.value.trim() && hasResumeSource());
}

function resetAnalysisOutputs() {
  analysisResult = null;
  renderSnapshot(null);
  suggestionsEl.textContent = "";
  draftEl.textContent = "Run analysis to generate a draft.";
  aiRewriteEl.textContent = "Run AI rewrite to see the polished version.";
  aiNotesEl.textContent = "";
}

function renderSuggestions(suggestions) {
  suggestionsEl.replaceChildren();
  if (!suggestions.length) {
    suggestionsEl.textContent = "No obvious issues detected.";
    return;
  }

  for (const suggestion of suggestions) {
    const article = document.createElement("article");
    article.className = "suggestion";
    const priority = document.createElement("p");
    priority.className = "priority";
    priority.textContent = suggestion.priority;
    const title = document.createElement("h3");
    title.textContent = suggestion.title;
    const detail = document.createElement("p");
    detail.textContent = suggestion.detail;
    article.append(priority, title, detail);
    suggestionsEl.appendChild(article);
  }
}

function renderSnapshot(result) {
  snapshotEl.replaceChildren();

  const items = [
    ["Target role", result?.meta?.targetRole || fieldEls.targetRole.value.trim() || "Not set"],
    ["LinkedIn connected", sessionProfile ? "Yes" : "No"],
    ["Detected sections", result?.extracted?.sections?.join(", ") || "None yet"],
    ["Bullet count", String(result?.extracted?.bullets ?? 0)],
    ["Missing keywords", result?.extracted?.missingKeywords?.join(", ") || "None detected"],
    ["LinkedIn URL", fieldEls.linkedinUrl.value.trim() || "Not provided"],
    ["Source coverage", summarizeCoverage(result)]
  ];

  for (const [label, value] of items) {
    const row = document.createElement("div");
    row.className = "snapshot-row";
    const term = document.createElement("p");
    term.className = "snapshot-label";
    term.textContent = label;
    const detail = document.createElement("p");
    detail.className = "snapshot-value";
    detail.textContent = value;
    row.append(term, detail);
    snapshotEl.appendChild(row);
  }
}

function summarizeCoverage(result) {
  const parts = [];
  if (sessionProfile) {
    parts.push("LinkedIn identity");
  }
  if (fieldEls.linkedinText.value.trim()) {
    parts.push("LinkedIn text");
  }
  if (fieldEls.resumeText.value.trim()) {
    parts.push("Resume text");
  }
  if (fieldEls.resumeFile.files[0]) {
    parts.push("Resume file");
  }
  if (!parts.length && result?.extractedResumeText) {
    parts.push("Extracted resume text");
  }
  return parts.join(" + ") || "Waiting for source material";
}

function renderNotes(items) {
  aiNotesEl.replaceChildren();
  if (!items.length) {
    aiNotesEl.textContent = "No extra notes.";
    return;
  }

  for (const item of items) {
    const row = document.createElement("p");
    row.textContent = item;
    aiNotesEl.appendChild(row);
  }
}

function maybeAutofillFromProfile(profile) {
  if (!profile) {
    return;
  }

  if (!fieldEls.targetRole.value.trim() && profile.headline) {
    fieldEls.targetRole.value = profile.headline;
  }

  if (!fieldEls.resumeText.value.trim()) {
    const header = [profile.name, profile.email].filter(Boolean).join("\n");
    if (header) {
      fieldEls.resumeText.value = `${header}\n\n`;
    }
  }

  if (!fieldEls.linkedinText.value.trim()) {
    fieldEls.linkedinText.value = [profile.name ? `Name: ${profile.name}` : "", profile.email ? `Email: ${profile.email}` : ""]
      .filter(Boolean)
      .join("\n");
  }

  if (!fieldEls.linkedinUrl.value.trim()) {
    fieldEls.linkedinUrl.placeholder = "LinkedIn does not expose your public profile URL here, so paste it if you want it included.";
  }

  renderChecklist();
}

function saveChatInput(value) {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  resetAnalysisOutputs();

  if (activeChatField === "linkedinUrl" || /^https?:\/\/(www\.)?linkedin\.com\//i.test(normalized)) {
    fieldEls.linkedinUrl.value = normalized;
    addChatMessage({ role: "user", body: normalized });
    addChatMessage({
      title: "Saved LinkedIn URL",
      body: "Good. Add resume text or upload a file next so I can analyze it."
    });
    focusChatField(fieldEls.resumeText.value.trim() ? "linkedinText" : "resumeText");
    setStep(2);
    renderSnapshot(analysisResult);
    renderChecklist();
    maybeAutoAnalyze();
    return true;
  }

  if (activeChatField === "targetRole") {
    fieldEls.targetRole.value = normalized;
    addChatMessage({ role: "user", body: normalized });
    addChatMessage({
      title: "Saved target role",
      body: "Next, paste your resume text or upload a resume file."
    });
    focusChatField("resumeText");
    setStep(2);
    renderSnapshot(analysisResult);
    renderChecklist();
    maybeAutoAnalyze();
    return true;
  }

  if (activeChatField === "linkedinText") {
    fieldEls.linkedinText.value = normalized;
    addChatMessage({ role: "user", body: normalized.slice(0, 240) + (normalized.length > 240 ? "..." : "") });
    addChatMessage({
      title: "Saved LinkedIn text",
      body: fieldEls.resumeText.value.trim() || fieldEls.resumeFile.files[0]
        ? "You have enough to run analysis now."
        : "Now paste your resume text or upload a resume file."
    });
    if (!fieldEls.resumeText.value.trim() && !fieldEls.resumeFile.files[0]) {
      focusChatField("resumeText");
    }
    renderSnapshot(analysisResult);
    renderChecklist();
    maybeAutoAnalyze();
    return true;
  }

  fieldEls.resumeText.value = normalized;
  addChatMessage({ role: "user", body: normalized.slice(0, 240) + (normalized.length > 240 ? "..." : "") });
  addChatMessage({
    title: "Saved resume text",
    body: fieldEls.targetRole.value.trim()
      ? "You can run analysis now, or add LinkedIn text for stronger matching."
      : "Add a target role next so I can tailor the analysis."
  });
  if (!fieldEls.targetRole.value.trim()) {
    focusChatField("targetRole");
  }
  renderSnapshot(analysisResult);
  renderChecklist();
  maybeAutoAnalyze();
  return true;
}

function renderProfile(profile) {
  if (appConfig.requiresAppSecret) {
    authStateEl.textContent = "APP_SECRET missing.";
    loginLinkEl.classList.add("hidden");
    logoutButtonEl.classList.add("hidden");
    profileCardEl.classList.add("hidden");
    return;
  }

  if (!appConfig.linkedInAuthEnabled) {
    authStateEl.textContent = "LinkedIn unavailable.";
    loginLinkEl.classList.add("hidden");
    logoutButtonEl.classList.add("hidden");
    profileCardEl.classList.add("hidden");
    return;
  }

  if (!profile) {
    authStateEl.textContent = "Not connected.";
    loginLinkEl.classList.remove("hidden");
    logoutButtonEl.classList.add("hidden");
    profileCardEl.classList.add("hidden");
    return;
  }

  authStateEl.textContent = `${profile.name || profile.email || "LinkedIn account"} connected`;
  loginLinkEl.classList.add("hidden");
  logoutButtonEl.classList.remove("hidden");
  profileEl.replaceChildren();
  const row = document.createElement("div");
  row.className = "profile-row";
  if (profile.picture) {
    const image = document.createElement("img");
    image.className = "avatar";
    image.src = profile.picture;
    image.alt = "";
    row.appendChild(image);
  }
  const copy = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = profile.name || "LinkedIn account";
  const email = document.createElement("p");
  email.textContent = profile.email || "Email not shared";
  copy.append(name, email);
  row.appendChild(copy);
  profileEl.appendChild(row);
  profileCardEl.classList.remove("hidden");
  renderChecklist();
}

function updateRewriteButton() {
  if (!appConfig.openAiRewriteEnabled) {
    rewriteButtonEl.disabled = true;
    rewriteButtonEl.textContent = "AI Rewrite Unavailable";
    return;
  }
  rewriteButtonEl.disabled = false;
  rewriteButtonEl.textContent = "AI Rewrite";
}

async function loadSession() {
  const [configResponse, sessionResponse] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/session")
  ]);
  appConfig = await configResponse.json();
  const session = await sessionResponse.json();
  sessionProfile = session.profile || null;
  renderProfile(sessionProfile);
  maybeAutofillFromProfile(sessionProfile);
  renderSnapshot(analysisResult);
  updateRewriteButton();
  updateGuide(currentStep);
  renderChecklist();
}

logoutButtonEl.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  sessionProfile = null;
  await loadSession();
  addChatMessage({
    title: "LinkedIn disconnected",
    body: "You can still paste LinkedIn text or upload a resume manually."
  });
  setStatus("LinkedIn disconnected.");
});

async function enrichPayloadWithFile(payload) {
  const resumeFile = fieldEls.resumeFile.files[0];
  if (!resumeFile) {
    return payload;
  }
  payload.resumeFileName = resumeFile.name;
  payload.resumeFileBase64 = await fileToBase64(resumeFile);
  return payload;
}

async function exportText(format, text) {
  if (!text.trim()) {
    setStatus("Nothing to export yet.", true);
    return;
  }

  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      format,
      text,
      fileName: fieldEls.targetRole.value || "resume-refresh"
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Export failed");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const fileName = match?.[1] || `resume-refresh.${format}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function runAnalysis(payload) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Analysis failed");
  }
  analysisResult = result;
  renderSuggestions(result.suggestions);
  renderSnapshot(result);
  draftEl.textContent = result.rewrittenResume || "No draft returned.";
  return result;
}

async function executeAnalysis({ auto = false } = {}) {
  if (analysisInFlight) {
    return;
  }
  if (!isReadyForAnalysis()) {
    if (!auto) {
      setStatus("Add a target role and resume text or file first.", true);
    }
    return;
  }

  analysisInFlight = true;
  setStatus(auto ? "Analyzing from chat..." : "Analyzing...");

  try {
    const payload = await enrichPayloadWithFile(getFormPayload());
    const result = await runAnalysis(payload);
    if (!fieldEls.resumeText.value.trim() && result.extractedResumeText) {
      fieldEls.resumeText.value = result.extractedResumeText;
    }
    addChatMessage({
      title: auto ? "Analysis ran automatically" : "Analysis complete",
      body: "I found the biggest gaps and drafted a cleaner resume. Review the snapshot and suggestions next.",
      actions: [
        { label: "Open review", onClick: () => setStep(3) },
        { label: "AI rewrite", onClick: () => rewriteButtonEl.click(), secondary: true }
      ]
    });
    setStep(3);
    renderChecklist();
    setStatus("Review ready.");
  } catch (error) {
    setStatus(error.message || "Something went wrong.", true);
  } finally {
    analysisInFlight = false;
  }
}

function maybeAutoAnalyze() {
  if (!isReadyForAnalysis()) {
    return;
  }
  if (analysisResult) {
    return;
  }
  executeAnalysis({ auto: true });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await executeAnalysis();
});

chatFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = chatInputEl.value;
  if (!saveChatInput(value)) {
    setStatus("Add a response first.", true);
    return;
  }
  chatInputEl.value = "";
  setStatus("Saved.");
});

chatSkipEl.addEventListener("click", () => {
  const nextField = {
    targetRole: "resumeText",
    resumeText: "linkedinText",
    linkedinText: "linkedinUrl",
    linkedinUrl: "targetRole"
  };
  addChatMessage({
    title: "Skipped",
    body: "That field is optional for now. You can come back to it later."
  });
  focusChatField(nextField[activeChatField] || "targetRole");
  setStep(activeChatField === "targetRole" ? 2 : currentStep);
  setStatus("Skipped.");
});

rewriteButtonEl.addEventListener("click", async () => {
  if (rewriteInFlight) {
    return;
  }
  if (!appConfig.openAiRewriteEnabled) {
    setStatus("OpenAI rewrite is not configured.", true);
    return;
  }

  rewriteInFlight = true;
  setStatus("Rewriting...");
  try {
    const payload = await enrichPayloadWithFile(getFormPayload());
    if (!analysisResult) {
      const analyzed = await runAnalysis(payload);
      if (!payload.resumeText && analyzed.extractedResumeText) {
        payload.resumeText = analyzed.extractedResumeText;
      }
    } else if (!payload.resumeText && analysisResult.extractedResumeText) {
      payload.resumeText = analysisResult.extractedResumeText;
    }

    const response = await fetch("/api/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Rewrite failed");
    }

    aiRewriteEl.textContent = result.rewrittenResume || "No rewrite returned.";
    renderNotes([result.summary, ...result.bulletImprovements, ...result.notes].filter(Boolean));
    addChatMessage({
      title: "Rewrite ready",
      body: "The AI version is ready. Review it, then export DOCX or PDF.",
      actions: [
        { label: "Open rewrite", onClick: () => setStep(4) }
      ]
    });
    setStep(4);
    setStatus("AI rewrite ready.");
  } catch (error) {
    setStatus(error.message || "Rewrite failed.", true);
  } finally {
    rewriteInFlight = false;
  }
});

downloadDraftDocxEl.addEventListener("click", async () => {
  try {
    await exportText("docx", draftEl.textContent || "");
    setStatus("DOCX downloaded.");
  } catch (error) {
    setStatus(error.message || "DOCX export failed.", true);
  }
});

downloadDraftPdfEl.addEventListener("click", async () => {
  try {
    await exportText("pdf", draftEl.textContent || "");
    setStatus("PDF downloaded.");
  } catch (error) {
    setStatus(error.message || "PDF export failed.", true);
  }
});

downloadRewriteDocxEl.addEventListener("click", async () => {
  try {
    await exportText("docx", aiRewriteEl.textContent || "");
    setStatus("DOCX downloaded.");
  } catch (error) {
    setStatus(error.message || "DOCX export failed.", true);
  }
});

downloadRewritePdfEl.addEventListener("click", async () => {
  try {
    await exportText("pdf", aiRewriteEl.textContent || "");
    setStatus("PDF downloaded.");
  } catch (error) {
    setStatus(error.message || "PDF export failed.", true);
  }
});

for (const chip of stepChips) {
  chip.addEventListener("click", () => {
    setStep(Number(chip.dataset.goStep));
  });
}

for (const element of [fieldEls.targetRole, fieldEls.linkedinUrl, fieldEls.linkedinText, fieldEls.resumeText, fieldEls.resumeFile]) {
  element.addEventListener("input", () => {
    resetAnalysisOutputs();
    renderChecklist();
  });
  element.addEventListener("change", () => {
    resetAnalysisOutputs();
    renderChecklist();
    maybeAutoAnalyze();
  });
}

seedChat();
renderShortcuts();
focusChatField("targetRole");
const linkedInStatus = readLinkedInStatusFromUrl();
if (linkedInStatus === "connected") {
  addChatMessage({
    title: "LinkedIn connected",
    body: "I pulled your basic LinkedIn identity and prefilled what I can. LinkedIn does not expose your public profile URL here, so paste it manually if you want it included."
  });
  focusChatField(fieldEls.resumeText.value.trim() ? "linkedinUrl" : "resumeText");
  setStatus("LinkedIn connected.");
} else if (linkedInStatus === "failed" || linkedInStatus === "invalid" || linkedInStatus === "denied") {
  addChatMessage({
    title: "LinkedIn sign-in did not complete",
    body: "You can still continue by pasting your LinkedIn text and resume manually."
  });
  setStatus("LinkedIn sign-in did not complete.", true);
}

renderSnapshot(null);
loadSession().catch((error) => {
  setStatus(error.message || "Unable to load app state.", true);
});
setStep(1);
