import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from "react";

type Stage = "landing" | "source" | "permissions" | "review" | "builder" | "export";
type SourceMethod = "import" | "manual" | null;
type RewriteStyle = "concise" | "balanced" | "achievement";
type SectionId = "header" | "summary" | "experience" | "skills" | "education";

type SessionProfile = {
  name?: string;
  email?: string;
  picture?: string;
};

type AppConfig = {
  linkedInAuthEnabled: boolean;
  requiresAppSecret: boolean;
  openAiRewriteEnabled: boolean;
};

type Suggestion = {
  priority: string;
  title: string;
  detail: string;
};

type AnalysisResult = {
  meta?: { targetRole?: string };
  extracted?: {
    sections?: string[];
    bullets?: number;
    missingKeywords?: string[];
  };
  suggestions?: Suggestion[];
  rewrittenResume?: string;
  extractedResumeText?: string;
};

type RewriteResult = {
  summary?: string;
  rewrittenResume?: string;
  bulletImprovements?: string[];
  notes?: string[];
};

type ResumeSection = {
  id: SectionId;
  title: string;
  prompt: string;
  helper: string;
  placeholder: string;
  required: boolean;
  content: string;
};

type PersistedState = {
  stage: Stage;
  sourceMethod: SourceMethod;
  targetRole: string;
  linkedinUrl: string;
  linkedinText: string;
  rewriteStyle: RewriteStyle;
  activeSection: SectionId;
  sections: ResumeSection[];
};

const storageKey = "resume_refresh_v2_state";

const sectionBlueprints: Array<Omit<ResumeSection, "content">> = [
  {
    id: "header",
    title: "Header",
    prompt: "Confirm your name, contact details, and location.",
    helper: "Keep this clean and factual. No paragraphs here.",
    placeholder: "Maya Patel\nSan Francisco, CA\nmaya@email.com · linkedin.com/in/maya",
    required: true
  },
  {
    id: "summary",
    title: "Summary",
    prompt: "Write a short profile that makes your direction clear.",
    helper: "Focus on strengths, scope, and direction. Avoid vague adjectives.",
    placeholder: "Product manager with experience in growth, onboarding, and experimentation.",
    required: true
  },
  {
    id: "experience",
    title: "Experience",
    prompt: "Capture the strongest experience bullets.",
    helper: "Lead with ownership, then show outcomes, scope, or complexity.",
    placeholder: "Product Manager, Atlas\n- Owned onboarding roadmap...\n- Partnered with design and engineering...",
    required: true
  },
  {
    id: "skills",
    title: "Skills",
    prompt: "List the skills or tools that support your target role.",
    helper: "Keep this tight and relevant. Think hiring manager scanability.",
    placeholder: "Product strategy\nExperimentation\nSQL\nStakeholder management",
    required: false
  },
  {
    id: "education",
    title: "Education",
    prompt: "Add education only if it helps this resume.",
    helper: "School, degree, year. Keep it concise.",
    placeholder: "University of California, Berkeley\nB.A. Economics",
    required: false
  }
];

const defaultPersistedState: PersistedState = {
  stage: "landing",
  sourceMethod: null,
  targetRole: "",
  linkedinUrl: "",
  linkedinText: "",
  rewriteStyle: "balanced",
  activeSection: "summary",
  sections: sectionBlueprints.map((item) => ({ ...item, content: "" }))
};

const featureCards = [
  ["Build", "Answer guided prompts instead of wrestling with a large form."],
  ["Refresh", "Import what you already have, then fix each section clearly."],
  ["Tailor", "Rewrite bullets toward impact, ownership, and clarity."],
  ["Export", "Leave with a cleaner PDF or DOCX when it feels ready."]
];

const beforeAfter = [
  {
    before: "Led onboarding roadmap for new users.",
    after: "Owned the onboarding roadmap, driving activation improvements through experiments and cross-functional delivery."
  },
  {
    before: "Worked with design and engineering to improve signup.",
    after: "Partnered with design and engineering to simplify signup flows and improve conversion across the first-session experience."
  }
];

const faqs = [
  {
    q: "What does LinkedIn import actually use?",
    a: "Only the data you approve. Resume Refresh never posts to LinkedIn or edits your account."
  },
  {
    q: "Can I edit generated resume content manually?",
    a: "Yes. Every section remains editable after import, draft generation, and AI polish."
  },
  {
    q: "What if imported content is messy?",
    a: "You review it section by section, fix missing parts, and decide what stays before it becomes your draft."
  }
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDefaultSections(seed?: Partial<Record<SectionId, string>>) {
  return sectionBlueprints.map((item) => ({
    ...item,
    content: seed?.[item.id]?.trim() || ""
  }));
}

function normalizeText(value: string) {
  return value.replace(/\r/g, "").trim();
}

const headingAliases: Record<SectionId, string[]> = {
  header: [],
  summary: ["SUMMARY", "PROFESSIONAL SUMMARY", "PROFILE", "ABOUT"],
  experience: ["EXPERIENCE", "WORK EXPERIENCE", "EMPLOYMENT", "EXPERIENCE HIGHLIGHTS"],
  skills: ["SKILLS", "CORE SKILLS", "TECHNICAL SKILLS", "CORE COMPETENCIES"],
  education: ["EDUCATION"]
};

function parseStructuredSections(text: string) {
  const lines = normalizeText(text).split("\n");
  const sections: Record<SectionId, string[]> = {
    header: [],
    summary: [],
    experience: [],
    skills: [],
    education: []
  };
  let current: SectionId = "header";

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      if (current !== "header" && sections[current][sections[current].length - 1] !== "") {
        sections[current].push("");
      }
      continue;
    }

    const nextSection = (Object.keys(headingAliases) as SectionId[]).find((sectionId) =>
      headingAliases[sectionId].includes(trimmed.toUpperCase())
    );
    if (nextSection) {
      current = nextSection;
      continue;
    }

    sections[current].push(trimmed);
  }

  return sections;
}

function extractSectionBlock(text: string, headings: string[]) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return "";
  }

  for (const heading of headings) {
    const pattern = new RegExp(
      `(?:^|\\n)${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=\\n(?:SUMMARY|PROFESSIONAL SUMMARY|PROFILE|ABOUT|EXPERIENCE|WORK EXPERIENCE|SKILLS|CORE SKILLS|EDUCATION)\\s*\\n|$)`,
      "i"
    );
    const match = normalized.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return "";
}

function extractHeaderBlock(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return "";
  }
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const collected: string[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (["SUMMARY", "PROFESSIONAL SUMMARY", "PROFILE", "ABOUT", "EXPERIENCE", "WORK EXPERIENCE", "SKILLS", "CORE SKILLS", "EDUCATION"].includes(upper)) {
      break;
    }
    collected.push(line);
    if (collected.length >= 3) {
      break;
    }
  }

  return collected.join("\n");
}

function deriveSections(profile: SessionProfile | null, linkedinText: string, resumeText: string) {
  const normalizedLinkedIn = normalizeText(linkedinText);
  const normalizedResume = normalizeText(resumeText);
  const parsedResume = parseStructuredSections(normalizedResume);

  const headerFromProfile = [profile?.name, profile?.email].filter(Boolean).join("\n");
  const parsedHeader = parsedResume.header.filter(Boolean).slice(0, 3).join("\n");
  const header = headerFromProfile || parsedHeader || extractHeaderBlock(normalizedResume);
  const summary = parsedResume.summary.filter(Boolean).join("\n") || normalizedLinkedIn.split(/\n{2,}/)[0] || "";
  const experience = parsedResume.experience.join("\n") || normalizedLinkedIn || "";
  const skills = parsedResume.skills.filter(Boolean).join("\n");
  const education = parsedResume.education.filter(Boolean).join("\n");

  return buildDefaultSections({
    header,
    summary,
    experience,
    skills,
    education
  });
}

function serializeSections(sections: ResumeSection[]) {
  const sectionMap = Object.fromEntries(sections.map((section) => [section.id, normalizeText(section.content)])) as Record<SectionId, string>;
  const blocks = [
    sectionMap.header,
    sectionMap.summary ? `SUMMARY\n${sectionMap.summary}` : "",
    sectionMap.experience ? `EXPERIENCE\n${sectionMap.experience}` : "",
    sectionMap.skills ? `SKILLS\n${sectionMap.skills}` : "",
    sectionMap.education ? `EDUCATION\n${sectionMap.education}` : ""
  ].filter(Boolean);
  return blocks.join("\n\n").trim();
}

function getSectionStatus(section: ResumeSection) {
  const value = normalizeText(section.content);
  if (!value) {
    return section.required ? "Missing" : "Optional";
  }
  if (value.length < 36) {
    return "Needs detail";
  }
  return "Ready";
}

function countSectionStatuses(sections: ResumeSection[]) {
  return sections.reduce(
    (summary, section) => {
      const status = getSectionStatus(section);
      if (status === "Ready") {
        summary.ready += 1;
      } else if (status === "Needs detail") {
        summary.needsDetail += 1;
      } else if (status === "Missing") {
        summary.missing += 1;
      } else {
        summary.optional += 1;
      }
      return summary;
    },
    { ready: 0, needsDetail: 0, missing: 0, optional: 0 }
  );
}

function findNextSection(sections: ResumeSection[], activeSection: SectionId) {
  const statuses = sections.map((section) => ({
    id: section.id,
    status: getSectionStatus(section)
  }));
  const preferred =
    statuses.find((section) => section.status === "Missing") ||
    statuses.find((section) => section.status === "Needs detail");

  if (preferred && preferred.id !== activeSection) {
    return preferred.id;
  }

  const currentIndex = sections.findIndex((section) => section.id === activeSection);
  const fallback = sections[(currentIndex + 1) % sections.length];
  return fallback?.id || activeSection;
}

function sectionToneTips(sectionId: SectionId) {
  return {
    header: "Keep this factual, scan-friendly, and compact.",
    summary: "Aim for 2-3 lines. Explain direction and strengths without sounding inflated.",
    experience: "Prefer action + outcome. Show scope, ownership, or results when possible.",
    skills: "List only what helps the target role. Cut generic filler.",
    education: "Only include details that still help your story."
  }[sectionId];
}

function readPersistedState(): PersistedState {
  if (typeof window === "undefined") {
    return defaultPersistedState;
  }
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) || "{}");
    return {
      ...defaultPersistedState,
      ...parsed,
      sections: Array.isArray(parsed.sections)
        ? buildDefaultSections(Object.fromEntries(parsed.sections.map((item: ResumeSection) => [item.id, item.content])))
        : defaultPersistedState.sections
    };
  } catch {
    return defaultPersistedState;
  }
}

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload as T;
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
      {children}
    </p>
  );
}

function Panel({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-neutral-200 bg-white/90 shadow-[0_12px_40px_rgba(21,21,21,0.06)] backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}

function ResumePreview({
  sections,
  missingKeywords
}: {
  sections: ResumeSection[];
  missingKeywords: string[];
}) {
  const sectionMap = Object.fromEntries(sections.map((section) => [section.id, normalizeText(section.content)])) as Record<SectionId, string>;
  const headerLines = sectionMap.header.split("\n").filter(Boolean);

  return (
    <div className="mt-4 rounded-[24px] border border-neutral-200 bg-neutral-50 p-6">
      {sectionMap.header ? (
        <div>
          <div className="whitespace-pre-wrap break-words text-xl font-semibold leading-8 text-neutral-950">
            {headerLines[0]}
          </div>
          {headerLines.slice(1).length > 0 && (
            <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-500">
              {headerLines.slice(1).join("  |  ")}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Your live preview will appear here as sections fill in.</p>
      )}

      {missingKeywords.length > 0 && (
        <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Missing keywords: {missingKeywords.join(", ")}
        </div>
      )}

      {([
        ["summary", "Summary"],
        ["experience", "Experience"],
        ["skills", "Skills"],
        ["education", "Education"]
      ] as const).map(([id, label]) =>
        sectionMap[id] ? (
          <section key={id} className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">{label}</p>
            <div className="mt-2 space-y-2 text-sm leading-6 text-neutral-700">
              {sectionMap[id].split("\n").filter(Boolean).map((line) =>
                /^[-*•]/.test(line) ? (
                  <div key={`${id}-${line}`} className="flex gap-2">
                    <span className="mt-[2px] text-neutral-400">•</span>
                    <span>{line.replace(/^[-*•]\s*/, "")}</span>
                  </div>
                ) : (
                  <p key={`${id}-${line}`} className="whitespace-pre-wrap break-words">{line}</p>
                )
              )}
            </div>
          </section>
        ) : null
      )}
    </div>
  );
}

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel className="overflow-hidden p-8 sm:p-10">
          <SectionEyebrow>Resume Refresh</SectionEyebrow>
          <h1 className="mt-4 max-w-[12ch] text-4xl font-semibold tracking-[-0.04em] text-neutral-950 sm:text-6xl">
            Turn your experience into a stronger resume.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-600 sm:text-lg">
            Import what you already have, fix what is weak, and leave with a cleaner, sharper resume.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={onStart}
              className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              Refresh my resume
            </button>
            <button className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50">
              View sample
            </button>
          </div>
        </Panel>

        <Panel className="p-6 sm:p-8">
          <SectionEyebrow>Why it works</SectionEyebrow>
          <div className="mt-5 space-y-4">
            {featureCards.map(([title, copy]) => (
              <div key={title} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-semibold text-neutral-900">{title}</p>
                <p className="mt-1 text-sm leading-6 text-neutral-600">{copy}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Panel className="p-6 sm:p-8">
          <SectionEyebrow>Import trust</SectionEyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-neutral-950">
            Import is a shortcut, not a black box.
          </h2>
          <div className="mt-5 space-y-3 text-sm leading-6 text-neutral-600">
            <p>You always see what will be imported before it is used.</p>
            <p>You review imported content before it becomes part of the resume draft.</p>
            <p>You can edit, skip, or replace anything manually.</p>
          </div>
        </Panel>

        <Panel className="overflow-hidden p-0">
          <div className="border-b border-neutral-200 px-6 py-5">
            <SectionEyebrow>Example improvements</SectionEyebrow>
            <h3 className="mt-3 text-lg font-semibold text-neutral-950">
              Better bullets, clearer outcomes
            </h3>
          </div>
          <div className="grid divide-y divide-neutral-200">
            {beforeAfter.map((item) => (
              <div key={item.before} className="grid gap-4 p-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Before</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-500">{item.before}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">After</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-900">{item.after}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {["A faster first draft", "Feels guided, not overwhelming", "Keeps you in control"].map((item) => (
          <Panel key={item} className="p-6">
            <p className="text-lg font-medium text-neutral-900">{item}</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">Placeholder for testimonial or proof point.</p>
          </Panel>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <Panel className="p-6 sm:p-8">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <div className="mt-5 divide-y divide-neutral-200">
            {faqs.map((item) => (
              <div key={item.q} className="py-4 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold text-neutral-900">{item.q}</p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{item.a}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="flex flex-col justify-between p-8">
          <div>
            <SectionEyebrow>Ready to start</SectionEyebrow>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-neutral-950">
              Bring in what you have. Leave with something stronger.
            </h2>
          </div>
          <button
            onClick={onStart}
            className="mt-8 rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Start Resume Refresh
          </button>
        </Panel>
      </section>
    </div>
  );
}

function WorkflowHeader({
  stage,
  onBackToLanding
}: {
  stage: Stage;
  onBackToLanding: () => void;
}) {
  const stages: Array<[Stage, string]> = [
    ["source", "Start"],
    ["permissions", "Import"],
    ["review", "Review"],
    ["builder", "Build"],
    ["export", "Export"]
  ];
  const currentIndex = Math.max(0, stages.findIndex(([key]) => key === stage));

  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <button
        onClick={onBackToLanding}
        className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        Resume Refresh
      </button>
      <div className="hidden items-center gap-3 sm:flex">
        {stages.map(([key, label], index) => (
          <div key={key} className="flex items-center gap-3">
            <div className={cn("h-2.5 w-2.5 rounded-full", index <= currentIndex ? "bg-neutral-950" : "bg-neutral-200")} />
            <span className={cn("text-xs font-medium uppercase tracking-[0.14em]", index <= currentIndex ? "text-neutral-900" : "text-neutral-400")}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceChoice({
  onImport,
  onManual
}: {
  onImport: () => void;
  onManual: () => void;
}) {
  return (
    <Panel className="p-8 sm:p-10">
      <SectionEyebrow>How do you want to start?</SectionEyebrow>
      <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-neutral-950">
        Choose the fastest path for you.
      </h2>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <button
          onClick={onImport}
          className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-6 text-left transition hover:border-neutral-300 hover:bg-white"
        >
          <p className="text-base font-semibold text-neutral-950">Bring in what you already have</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Use LinkedIn and your current resume as a shortcut. You will review everything before it is used.
          </p>
        </button>
        <button
          onClick={onManual}
          className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-6 text-left transition hover:border-neutral-300 hover:bg-white"
        >
          <p className="text-base font-semibold text-neutral-950">Build it step by step</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Answer guided prompts and create a resume without importing anything.
          </p>
        </button>
      </div>
    </Panel>
  );
}

function ImportPermissions({
  onContinue,
  onManual,
  isLinkedInReady
}: {
  onContinue: () => void;
  onManual: () => void;
  isLinkedInReady: boolean;
}) {
  return (
    <Panel className="p-8 sm:p-10">
      <SectionEyebrow>Review what will be used</SectionEyebrow>
      <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-neutral-950">
        Import is visible and reversible.
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
        We only use the information you approve. Nothing is posted, changed, or shared.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Panel className="p-5">
          <p className="text-sm font-semibold text-neutral-900">Will import</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-600">
            <li>Basic profile identity</li>
            <li>Pasted or exported profile text</li>
            <li>Uploaded resume text</li>
          </ul>
        </Panel>
        <Panel className="p-5">
          <p className="text-sm font-semibold text-neutral-900">Will not do</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-600">
            <li>Post to LinkedIn</li>
            <li>Change your LinkedIn account</li>
            <li>Publish anything without review</li>
          </ul>
        </Panel>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          onClick={onContinue}
          disabled={!isLinkedInReady}
          className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Continue import
        </button>
        <button
          onClick={onManual}
          className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
        >
          Start manually instead
        </button>
      </div>
      {!isLinkedInReady && (
        <p className="mt-4 text-sm text-amber-700">
          LinkedIn auth is not currently configured, so import is unavailable in this environment.
        </p>
      )}
    </Panel>
  );
}

function ImportReview({
  sections,
  onSectionChange,
  onContinue
}: {
  sections: ResumeSection[];
  onSectionChange: (id: SectionId, value: string) => void;
  onContinue: () => void;
}) {
  const sectionSummary = countSectionStatuses(sections);

  return (
    <div className="space-y-5">
      <Panel className="p-8">
        <SectionEyebrow>Import review</SectionEyebrow>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-neutral-950">
          Confirm what came in.
        </h2>
        <p className="mt-4 text-sm leading-7 text-neutral-600">
          Imported content is only a starting point. Clean up each section now so the draft generator works with better material.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Ready</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-900">{sectionSummary.ready}</p>
          </div>
          <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Needs detail</p>
            <p className="mt-2 text-2xl font-semibold text-amber-900">{sectionSummary.needsDetail}</p>
          </div>
          <div className="rounded-[20px] border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Missing</p>
            <p className="mt-2 text-2xl font-semibold text-neutral-900">{sectionSummary.missing}</p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4">
        {sections.map((section) => {
          const status = getSectionStatus(section);
          return (
            <Panel key={section.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-neutral-950">{section.title}</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">{section.prompt}</p>
                </div>
                <span className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  status === "Ready"
                    ? "bg-emerald-50 text-emerald-700"
                    : status === "Needs detail"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-neutral-100 text-neutral-700"
                )}>
                  {status}
                </span>
              </div>

              <textarea
                value={section.content}
                onChange={(event) => onSectionChange(section.id, event.target.value)}
                placeholder={section.placeholder}
                className="mt-4 min-h-[140px] w-full rounded-[20px] border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none"
              />

              <p className="mt-3 text-xs leading-5 text-neutral-500">{section.helper}</p>
            </Panel>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onContinue}
          className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Continue to builder
        </button>
      </div>
    </div>
  );
}

function Builder({
  targetRole,
  linkedinUrl,
  linkedinText,
  rewriteStyle,
  sections,
  activeSection,
  onTargetRoleChange,
  onLinkedinUrlChange,
  onLinkedinTextChange,
  onRewriteStyleChange,
  onResumeUpload,
  resumeFileName,
  onSectionSelect,
  onSectionChange,
  onAnalyze,
  onRewrite,
  onApplyRewrite,
  analysis,
  rewrite,
  isAnalyzing,
  isRewriting,
  canRewrite,
  onContinue
}: {
  targetRole: string;
  linkedinUrl: string;
  linkedinText: string;
  rewriteStyle: RewriteStyle;
  sections: ResumeSection[];
  activeSection: SectionId;
  onTargetRoleChange: (value: string) => void;
  onLinkedinUrlChange: (value: string) => void;
  onLinkedinTextChange: (value: string) => void;
  onRewriteStyleChange: (value: RewriteStyle) => void;
  onResumeUpload: (file: File | null) => void;
  resumeFileName: string;
  onSectionSelect: (id: SectionId) => void;
  onSectionChange: (id: SectionId, value: string) => void;
  onAnalyze: () => void;
  onRewrite: () => void;
  onApplyRewrite: () => void;
  analysis: AnalysisResult | null;
  rewrite: RewriteResult | null;
  isAnalyzing: boolean;
  isRewriting: boolean;
  canRewrite: boolean;
  onContinue: () => void;
}) {
  const selectedSection = sections.find((section) => section.id === activeSection) || sections[0];
  const sectionSummary = countSectionStatuses(sections);
  const nextSectionId = findNextSection(sections, activeSection);
  const deferredPreviewSections = useDeferredValue(
    rewrite?.rewrittenResume
      ? deriveSections(null, "", rewrite.rewrittenResume)
      : sections
  );
  const missingKeywords = analysis?.extracted?.missingKeywords || [];
  const rewrittenSections = rewrite?.rewrittenResume
    ? deriveSections(null, "", rewrite.rewrittenResume)
    : [];
  const rewrittenSectionMap = Object.fromEntries(
    rewrittenSections.map((section) => [section.id, normalizeText(section.content)])
  ) as Partial<Record<SectionId, string>>;
  const currentSectionText = normalizeText(selectedSection.content);
  const rewrittenSectionText = rewrittenSectionMap[selectedSection.id] || "";
  const selectedSectionLineCount = currentSectionText ? currentSectionText.split("\n").filter(Boolean).length : 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-5">
        <Panel className="p-6">
          <SectionEyebrow>Builder</SectionEyebrow>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-neutral-950">
                Make each section stronger.
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Edit sections directly, generate a draft, then polish wording only if it helps.
              </p>
            </div>
            <div className="grid min-w-[210px] gap-2 rounded-[20px] border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
              <div className="flex items-center justify-between gap-3">
                <span>Sections ready</span>
                <span className="font-semibold text-neutral-900">{sectionSummary.ready}/{sections.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Need attention</span>
                <span className="font-semibold text-neutral-900">{sectionSummary.needsDetail + sectionSummary.missing}</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="grid gap-5 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-neutral-900">
              Target role
              <input
                value={targetRole}
                onChange={(event) => onTargetRoleChange(event.target.value)}
                placeholder="Senior Product Manager"
                className="rounded-[18px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-neutral-900">
              LinkedIn URL
              <input
                value={linkedinUrl}
                onChange={(event) => onLinkedinUrlChange(event.target.value)}
                placeholder="Paste your public profile URL"
                className="rounded-[18px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium text-neutral-900">
            LinkedIn support text
            <textarea
              value={linkedinText}
              onChange={(event) => onLinkedinTextChange(event.target.value)}
              placeholder="Paste About, Experience, or Skills"
              className="min-h-[120px] rounded-[18px] border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-neutral-900">
              Resume file
              <input
                type="file"
                accept=".pdf,.txt,.md"
                onChange={(event) => onResumeUpload(event.target.files?.[0] || null)}
                className="rounded-[18px] border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none file:mr-3 file:rounded-full file:border-0 file:bg-neutral-950 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              />
              <span className="text-xs text-neutral-500">{resumeFileName || "No file selected"}</span>
            </label>
            <div className="grid gap-2 text-sm font-medium text-neutral-900">
              <span>Rewrite style</span>
              <div className="flex rounded-full border border-neutral-200 bg-neutral-50 p-1">
                {([
                  ["concise", "Concise"],
                  ["balanced", "Balanced"],
                  ["achievement", "Achievement"]
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => onRewriteStyleChange(value)}
                    className={cn(
                      "rounded-full px-3 py-2 text-xs font-medium transition",
                      rewriteStyle === value ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.34fr_0.66fr]">
            <div className="space-y-2">
              <p className="text-sm font-medium text-neutral-900">Resume sections</p>
              {sections.map((section) => {
                const status = getSectionStatus(section);
                return (
                  <button
                    key={section.id}
                    onClick={() => onSectionSelect(section.id)}
                    className={cn(
                      "w-full rounded-[18px] border px-4 py-3 text-left transition",
                      activeSection === section.id
                        ? "border-neutral-900 bg-neutral-950 text-white"
                        : "border-neutral-200 bg-neutral-50 text-neutral-800 hover:bg-white"
                    )}
                  >
                    <p className="text-sm font-medium">{section.title}</p>
                    <p className={cn("mt-1 text-xs", activeSection === section.id ? "text-white/70" : "text-neutral-500")}>
                      {status}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{selectedSection.title}</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">{selectedSection.prompt}</p>
                </div>
                <div className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500">
                  {selectedSectionLineCount} line{selectedSectionLineCount === 1 ? "" : "s"}
                </div>
              </div>
              <textarea
                value={selectedSection.content}
                onChange={(event) => onSectionChange(selectedSection.id, event.target.value)}
                placeholder={selectedSection.placeholder}
                className="mt-4 min-h-[220px] w-full rounded-[20px] border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none"
              />
              <p className="mt-3 text-xs text-neutral-500">Changes are saved in this browser session while you work.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-[18px] border border-neutral-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Section guidance</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">{sectionToneTips(selectedSection.id)}</p>
                </div>
                <div className="rounded-[18px] border border-neutral-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Editing goal</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">{selectedSection.helper}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onAnalyze}
              disabled={isAnalyzing || !(targetRole.trim() && (serializeSections(sections) || resumeFileName))}
              className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {isAnalyzing ? "Generating..." : "Generate draft"}
            </button>
            <button
              onClick={onRewrite}
              disabled={!canRewrite || isRewriting}
              className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
            >
              {isRewriting ? "Polishing..." : "Polish with AI"}
            </button>
            <button
              onClick={onContinue}
              className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              Export
            </button>
            <button
              onClick={() => onSectionSelect(nextSectionId)}
              className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              Next section
            </button>
          </div>
        </Panel>

        {analysis && (
          <Panel className="p-6">
            <SectionEyebrow>Top fixes</SectionEyebrow>
            <div className="mt-4 space-y-4">
              {(analysis.suggestions || []).map((item) => (
                <div key={item.title} className="rounded-[20px] border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">{item.priority}</p>
                  <p className="mt-2 text-sm font-semibold text-neutral-900">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {rewrite && (
          <Panel className="p-6">
            <SectionEyebrow>AI polish</SectionEyebrow>
            <p className="mt-4 text-sm leading-6 text-neutral-600">
              Review the polished draft before applying it back into your editable sections.
            </p>
            <div className="mt-4 rounded-[20px] border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Summary</p>
              <p className="mt-2 text-sm leading-6 text-neutral-700">{rewrite.summary}</p>
              {rewrite.notes && rewrite.notes.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Notes</p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-neutral-600">
                    {rewrite.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {rewrittenSectionText && rewrittenSectionText !== currentSectionText && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-[20px] border border-neutral-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Before</p>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                    {currentSectionText || "Nothing written yet for this section."}
                  </div>
                </div>
                <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">After</p>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950">
                    {rewrittenSectionText}
                  </div>
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={onApplyRewrite}
                className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
              >
                Apply AI polish to sections
              </button>
            </div>
          </Panel>
        )}
      </div>

      <Panel className="sticky top-8 h-fit p-6">
        <SectionEyebrow>Live preview</SectionEyebrow>
        <p className="mt-3 text-sm text-neutral-500">
          {rewrite?.rewrittenResume
            ? "Previewing the AI-polished version. Apply it if you want these edits in the builder."
            : "Preview updates as you edit sections."}
        </p>
        <ResumePreview sections={deferredPreviewSections} missingKeywords={missingKeywords} />
        <div className="mt-5 rounded-[20px] border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">What to do next</p>
          <p className="mt-2 text-sm leading-6 text-neutral-700">
            {sectionSummary.missing > 0
              ? "Fill the missing required sections first so the generated draft has enough structure."
              : sectionSummary.needsDetail > 0
                ? "Tighten the sections marked as needing detail, then generate a new draft."
                : "Generate a draft, review the suggestions, and use AI polish only if the wording needs help."}
          </p>
        </div>
      </Panel>
    </div>
  );
}

function ExportStep({
  onDownload,
  onBack,
  hasDraft,
  resumeText
}: {
  onDownload: (format: "pdf" | "docx") => void;
  onBack: () => void;
  hasDraft: boolean;
  resumeText: string;
}) {
  return (
    <Panel className="p-8 sm:p-10">
      <SectionEyebrow>Export</SectionEyebrow>
      <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-neutral-950">
        Your refreshed resume is ready.
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
        Download it now, or go back and keep editing first.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          ["Clearer impact", "Bullets now emphasize ownership and outcomes."],
          ["Cleaner structure", "Sections are easier to scan and more balanced."],
          ["Ready to send", "Export a polished version or make final edits first."]
        ].map(([title, copy]) => (
          <Panel key={title} className="p-5">
            <p className="text-sm font-semibold text-neutral-900">{title}</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">{copy}</p>
          </Panel>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          onClick={() => onDownload("pdf")}
          disabled={!hasDraft}
          className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Download PDF
        </button>
        <button
          onClick={() => onDownload("docx")}
          disabled={!hasDraft}
          className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
        >
          Download DOCX
        </button>
        <button
          onClick={onBack}
          className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
        >
          Keep editing
        </button>
      </div>
      {!resumeText.trim() && (
        <p className="mt-4 text-sm text-amber-700">Generate a draft before exporting.</p>
      )}
    </Panel>
  );
}

export default function ResumeRefreshPrototype() {
  const persisted = useMemo(() => readPersistedState(), []);
  const [stage, setStage] = useState<Stage>(persisted.stage);
  const [sourceMethod, setSourceMethod] = useState<SourceMethod>(persisted.sourceMethod);
  const [targetRole, setTargetRole] = useState(persisted.targetRole);
  const [linkedinUrl, setLinkedinUrl] = useState(persisted.linkedinUrl);
  const [linkedinText, setLinkedinText] = useState(persisted.linkedinText);
  const [rewriteStyle, setRewriteStyle] = useState<RewriteStyle>(persisted.rewriteStyle);
  const [activeSection, setActiveSection] = useState<SectionId>(persisted.activeSection);
  const [sections, setSections] = useState<ResumeSection[]>(persisted.sections);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeFileName, setResumeFileName] = useState("");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [rewrite, setRewrite] = useState<RewriteResult | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const normalizedRewriteDraft = useMemo(
    () => (rewrite?.rewrittenResume ? serializeSections(deriveSections(profile, linkedinText, rewrite.rewrittenResume)) : ""),
    [linkedinText, profile, rewrite]
  );

  useEffect(() => {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        stage,
        sourceMethod,
        targetRole,
        linkedinUrl,
        linkedinText,
        rewriteStyle,
        activeSection,
        sections
      } satisfies PersistedState)
    );
  }, [stage, sourceMethod, targetRole, linkedinUrl, linkedinText, rewriteStyle, activeSection, sections]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const linkedInStatus = url.searchParams.get("linkedin");
    if (linkedInStatus) {
      url.searchParams.delete("linkedin");
      window.history.replaceState({}, "", url);
      if (linkedInStatus === "connected") {
        setStatus("LinkedIn connected.");
        startTransition(() => {
          setStage("review");
          setSourceMethod("import");
        });
      } else {
        setError("LinkedIn sign-in did not complete. You can continue manually.");
      }
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetchJson<AppConfig>("/api/config"),
      fetchJson<{ profile: SessionProfile | null }>("/api/session")
    ])
      .then(([nextConfig, session]) => {
        setConfig(nextConfig);
        setProfile(session.profile);
      })
      .catch((requestError) => {
        setError(requestError.message || "Unable to load app state.");
      });
  }, []);

  useEffect(() => {
    if (sourceMethod !== "import") {
      return;
    }
    const hasContent = sections.some((section) => normalizeText(section.content));
    if (hasContent) {
      return;
    }
    setSections(deriveSections(profile, linkedinText, ""));
  }, [sourceMethod, profile, linkedinText, sections]);

  function updateSection(id: SectionId, content: string) {
    setRewrite(null);
    setAnalysis(null);
    setSections((current) =>
      current.map((section) => (section.id === id ? { ...section, content } : section))
    );
  }

  async function runAnalyze() {
    setError("");
    setStatus("Generating draft...");
    setIsAnalyzing(true);
    setRewrite(null);

    try {
      const serializedResume = serializeSections(sections);
      const payload: Record<string, string> = {
        targetRole,
        linkedinUrl,
        linkedinText,
        resumeText: serializedResume,
        style: rewriteStyle
      };
      if (resumeFile) {
        payload.resumeFileName = resumeFile.name;
        payload.resumeFileBase64 = await fileToBase64(resumeFile);
      }
      const result = await fetchJson<AnalysisResult>("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      setAnalysis(result);
      const draftedText = result.rewrittenResume || result.extractedResumeText || serializedResume;
      if (draftedText) {
        setSections(deriveSections(profile, linkedinText, draftedText));
      }
      setStatus("Draft ready.");
      startTransition(() => setStage("builder"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Analyze failed");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function runRewrite() {
    setError("");
    setStatus("Polishing draft...");
    setIsRewriting(true);

    try {
      const serializedResume = serializeSections(sections);
      const payload: Record<string, string> = {
        targetRole,
        linkedinUrl,
        linkedinText,
        resumeText: serializedResume,
        style: rewriteStyle
      };
      if (resumeFile) {
        payload.resumeFileName = resumeFile.name;
        payload.resumeFileBase64 = await fileToBase64(resumeFile);
      }
      const result = await fetchJson<RewriteResult>("/api/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      setRewrite(result);
      setStatus("Polished draft ready.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Rewrite failed");
    } finally {
      setIsRewriting(false);
    }
  }

  function applyRewriteToSections() {
    if (!rewrite?.rewrittenResume) {
      return;
    }
    setSections(deriveSections(profile, linkedinText, rewrite.rewrittenResume));
    setRewrite(null);
    setStatus("AI polish applied back into editable sections.");
  }

  async function handleDownload(format: "pdf" | "docx") {
    setError("");
    setStatus(`Preparing ${format.toUpperCase()}...`);
    try {
      const finalText = normalizedRewriteDraft || serializeSections(sections);
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          format,
          text: finalText,
          fileName: targetRole || "resume-refresh"
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
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setStatus(`${format.toUpperCase()} downloaded.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Export failed");
    }
  }

  function beginImport() {
    setSourceMethod("import");
    setStage("permissions");
  }

  function beginManual() {
    setSourceMethod("manual");
    setStage("builder");
  }

  function continueImport() {
    if (profile) {
      setSections(deriveSections(profile, linkedinText, serializeSections(sections)));
      setStage("review");
      return;
    }
    window.location.href = "/api/auth/linkedin?return_to=/v2.html";
  }

  const currentDraft = normalizedRewriteDraft || serializeSections(sections);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(179,120,67,0.12),transparent_28%),linear-gradient(180deg,#fcfaf6_0%,#f4efe8_100%)] px-5 py-8 text-neutral-950 sm:px-8">
      <div className="mx-auto max-w-7xl">
        {stage === "landing" ? (
          <Landing onStart={() => setStage("source")} />
        ) : (
          <>
            <WorkflowHeader stage={stage} onBackToLanding={() => setStage("landing")} />

            {(status || error) && (
              <div
                className={cn(
                  "mb-5 rounded-[20px] border px-4 py-3 text-sm",
                  error ? "border-amber-200 bg-amber-50 text-amber-800" : "border-neutral-200 bg-white text-neutral-700"
                )}
              >
                {error || status}
              </div>
            )}

            {stage === "source" && <SourceChoice onImport={beginImport} onManual={beginManual} />}

            {stage === "permissions" && (
              <ImportPermissions
                onContinue={continueImport}
                onManual={beginManual}
                isLinkedInReady={Boolean(config?.linkedInAuthEnabled)}
              />
            )}

            {stage === "review" && (
              <ImportReview
                sections={sections}
                onSectionChange={updateSection}
                onContinue={() => setStage("builder")}
              />
            )}

            {stage === "builder" && (
              <Builder
                targetRole={targetRole}
                linkedinUrl={linkedinUrl}
                linkedinText={linkedinText}
                rewriteStyle={rewriteStyle}
                sections={sections}
                activeSection={activeSection}
                onTargetRoleChange={(value) => {
                  setAnalysis(null);
                  setRewrite(null);
                  setTargetRole(value);
                }}
                onLinkedinUrlChange={(value) => {
                  setAnalysis(null);
                  setRewrite(null);
                  setLinkedinUrl(value);
                }}
                onLinkedinTextChange={(value) => {
                  setAnalysis(null);
                  setRewrite(null);
                  setLinkedinText(value);
                }}
                onRewriteStyleChange={setRewriteStyle}
                onResumeUpload={(file) => {
                  setResumeFile(file);
                  setResumeFileName(file?.name || "");
                }}
                resumeFileName={resumeFileName}
                onSectionSelect={setActiveSection}
                onSectionChange={updateSection}
                onAnalyze={runAnalyze}
                onRewrite={runRewrite}
                onApplyRewrite={applyRewriteToSections}
                analysis={analysis}
                rewrite={rewrite}
                isAnalyzing={isAnalyzing}
                isRewriting={isRewriting}
                canRewrite={Boolean(config?.openAiRewriteEnabled && currentDraft.trim())}
                onContinue={() => setStage("export")}
              />
            )}

            {stage === "export" && (
              <ExportStep
                onDownload={handleDownload}
                onBack={() => setStage("builder")}
                hasDraft={Boolean(currentDraft.trim())}
                resumeText={currentDraft}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
