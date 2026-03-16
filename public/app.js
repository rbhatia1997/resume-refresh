const form = document.querySelector("#analyze-form");
const statusEl = document.querySelector("#status");
const resultsEl = document.querySelector("#results");
const suggestionsEl = document.querySelector("#suggestions");
const snapshotEl = document.querySelector("#snapshot");
const draftEl = document.querySelector("#draft");
const extractedTextEl = document.querySelector("#extracted-text");
const loginLinkEl = document.querySelector("#linkedin-login");
const logoutButtonEl = document.querySelector("#linkedin-logout");
const authStateEl = document.querySelector("#auth-state");
const profileCardEl = document.querySelector("#linkedin-profile-card");
const profileEl = document.querySelector("#linkedin-profile");

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

function renderSuggestions(suggestions) {
  suggestionsEl.replaceChildren();
  if (!suggestions.length) {
    suggestionsEl.textContent = "No obvious issues detected. Review the draft and tailor it to specific jobs.";
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

function renderProfile(profile, { linkedInAuthEnabled, requiresAppSecret }) {
  if (requiresAppSecret) {
    authStateEl.textContent = "Deployment is missing APP_SECRET, so LinkedIn auth is disabled until that is configured.";
    loginLinkEl.classList.add("hidden");
    logoutButtonEl.classList.add("hidden");
    profileCardEl.classList.add("hidden");
    return;
  }

  if (!linkedInAuthEnabled) {
    authStateEl.textContent = "LinkedIn auth is not configured on this deployment.";
    loginLinkEl.classList.add("hidden");
    logoutButtonEl.classList.add("hidden");
    profileCardEl.classList.add("hidden");
    return;
  }

  if (!profile) {
    authStateEl.textContent = "Not connected. Sign in to attach basic LinkedIn identity.";
    loginLinkEl.classList.remove("hidden");
    logoutButtonEl.classList.add("hidden");
    profileCardEl.classList.add("hidden");
    return;
  }

  authStateEl.textContent = `Connected as ${profile.name || profile.email || "LinkedIn user"}.`;
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
  name.textContent = profile.name || "LinkedIn user";
  const email = document.createElement("p");
  email.textContent = profile.email || "Email not shared";
  copy.append(name, email);
  row.appendChild(copy);
  profileEl.appendChild(row);
  profileCardEl.classList.remove("hidden");
}

async function loadSession() {
  const [configResponse, sessionResponse] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/session")
  ]);
  const config = await configResponse.json();
  const session = await sessionResponse.json();
  renderProfile(session.profile, config);
}

logoutButtonEl.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  await loadSession();
  setStatus("LinkedIn connection removed.");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Analyzing your resume...");
  resultsEl.classList.add("hidden");

  try {
    const resumeFile = document.querySelector("#resume-file").files[0];
    const payload = {
      targetRole: document.querySelector("#target-role").value,
      linkedinUrl: document.querySelector("#linkedin-url").value,
      linkedinText: document.querySelector("#linkedin-text").value,
      resumeText: document.querySelector("#resume-text").value
    };

    if (resumeFile) {
      payload.resumeFileName = resumeFile.name;
      payload.resumeFileBase64 = await fileToBase64(resumeFile);
    }

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
        meta: result.meta,
        extracted: result.extracted,
        linkedInProfile: result.linkedInProfile
      },
      null,
      2
    );
    draftEl.textContent = result.rewrittenResume;
    extractedTextEl.textContent = result.extractedResumeText || "No resume text supplied.";
    resultsEl.classList.remove("hidden");
    setStatus("Analysis complete.");
  } catch (error) {
    setStatus(error.message || "Something went wrong.", true);
  }
});

const linkedInStatus = readLinkedInStatusFromUrl();
if (linkedInStatus === "connected") {
  setStatus("LinkedIn connected.");
} else if (linkedInStatus === "failed" || linkedInStatus === "invalid" || linkedInStatus === "denied") {
  setStatus("LinkedIn sign-in did not complete.", true);
}

loadSession().catch((error) => {
  setStatus(error.message || "Unable to load LinkedIn session.", true);
});
