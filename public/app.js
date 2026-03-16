const form = document.querySelector("#analyze-form");
const statusEl = document.querySelector("#status");
const resultsEl = document.querySelector("#results");
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

let appConfig = {
  linkedInAuthEnabled: false,
  requiresAppSecret: false,
  openAiRewriteEnabled: false
};

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
    targetRole: document.querySelector("#target-role").value.trim(),
    linkedinUrl: document.querySelector("#linkedin-url").value.trim(),
    linkedinText: document.querySelector("#linkedin-text").value.trim(),
    resumeText: document.querySelector("#resume-text").value.trim(),
    style: document.querySelector("#rewrite-style").value
  };
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
  renderProfile(session.profile);
  updateRewriteButton();
}

logoutButtonEl.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  await loadSession();
  setStatus("LinkedIn disconnected.");
});

async function enrichPayloadWithFile(payload) {
  const resumeFile = document.querySelector("#resume-file").files[0];
  if (!resumeFile) {
    return payload;
  }
  payload.resumeFileName = resumeFile.name;
  payload.resumeFileBase64 = await fileToBase64(resumeFile);
  return payload;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Analyzing...");
  resultsEl.classList.add("hidden");

  try {
    const payload = await enrichPayloadWithFile(getFormPayload());
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Analysis failed");
    }

    renderSuggestions(result.suggestions);
    snapshotEl.textContent = JSON.stringify(
      {
        targetRole: result.meta.targetRole,
        bullets: result.extracted.bullets,
        sections: result.extracted.sections,
        missingKeywords: result.extracted.missingKeywords
      },
      null,
      2
    );
    draftEl.textContent = result.rewrittenResume;
    resultsEl.classList.remove("hidden");
    setStatus("Analysis ready.");
  } catch (error) {
    setStatus(error.message || "Something went wrong.", true);
  }
});

rewriteButtonEl.addEventListener("click", async () => {
  if (!appConfig.openAiRewriteEnabled) {
    setStatus("OpenAI rewrite is not configured.", true);
    return;
  }

  setStatus("Rewriting...");
  try {
    const payload = await enrichPayloadWithFile(getFormPayload());
    if (!payload.resumeText && !payload.resumeFileBase64 && !payload.linkedinText) {
      throw new Error("Add resume or LinkedIn text first.");
    }

    if (!payload.resumeText && payload.resumeFileBase64) {
      const analyzeResponse = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const analyzeResult = await analyzeResponse.json();
      if (!analyzeResponse.ok) {
        throw new Error(analyzeResult.error || "Could not prepare rewrite input.");
      }
      payload.resumeText = analyzeResult.extractedResumeText || "";
      draftEl.textContent = analyzeResult.rewrittenResume;
      renderSuggestions(analyzeResult.suggestions);
      snapshotEl.textContent = JSON.stringify(
        {
          targetRole: analyzeResult.meta.targetRole,
          bullets: analyzeResult.extracted.bullets,
          sections: analyzeResult.extracted.sections,
          missingKeywords: analyzeResult.extracted.missingKeywords
        },
        null,
        2
      );
      resultsEl.classList.remove("hidden");
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
    resultsEl.classList.remove("hidden");
    setStatus("AI rewrite ready.");
  } catch (error) {
    setStatus(error.message || "Rewrite failed.", true);
  }
});

const linkedInStatus = readLinkedInStatusFromUrl();
if (linkedInStatus === "connected") {
  setStatus("LinkedIn connected.");
} else if (linkedInStatus === "failed" || linkedInStatus === "invalid" || linkedInStatus === "denied") {
  setStatus("LinkedIn sign-in did not complete.", true);
}

loadSession().catch((error) => {
  setStatus(error.message || "Unable to load app state.", true);
});
