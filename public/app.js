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
  suggestionsEl.innerHTML = "";
  if (!suggestions.length) {
    suggestionsEl.textContent = "No obvious issues detected. Review the draft and tailor it to specific jobs.";
    return;
  }

  for (const suggestion of suggestions) {
    const article = document.createElement("article");
    article.className = "suggestion";
    article.innerHTML = `
      <p class="priority">${suggestion.priority}</p>
      <h3>${suggestion.title}</h3>
      <p>${suggestion.detail}</p>
    `;
    suggestionsEl.appendChild(article);
  }
}

function renderProfile(profile, linkedInAuthEnabled) {
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
  profileEl.innerHTML = `
    <div class="profile-row">
      ${profile.picture ? `<img class="avatar" src="${profile.picture}" alt="" />` : ""}
      <div>
        <h3>${profile.name || "LinkedIn user"}</h3>
        <p>${profile.email || "Email not shared"}</p>
      </div>
    </div>
  `;
  profileCardEl.classList.remove("hidden");
}

async function loadSession() {
  const [configResponse, sessionResponse] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/session")
  ]);
  const config = await configResponse.json();
  const session = await sessionResponse.json();
  renderProfile(session.profile, config.linkedInAuthEnabled);
}

logoutButtonEl.addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST" });
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
