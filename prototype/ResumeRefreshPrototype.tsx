import {
  startTransition,
  useEffect,
  useMemo,
  useState
} from "react";

type Stage = "landing" | "source" | "permissions" | "review" | "builder" | "export";
type SourceMethod = "import" | "manual" | null;
type RewriteStyle = "concise" | "balanced" | "achievement";

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

type PersistedState = {
  stage: Stage;
  sourceMethod: SourceMethod;
  targetRole: string;
  linkedinUrl: string;
  linkedinText: string;
  resumeText: string;
  rewriteStyle: RewriteStyle;
};

const storageKey = "resume_refresh_v2_state";

const defaultPersistedState: PersistedState = {
  stage: "landing",
  sourceMethod: null,
  targetRole: "",
  linkedinUrl: "",
  linkedinText: "",
  resumeText: "",
  rewriteStyle: "balanced"
};

const featureCards = [
  ["Build", "Answer guided prompts without getting lost in a big form."],
  ["Refresh", "Import existing material and clean it up section by section."],
  ["Tailor", "Rewrite bullets around impact, ownership, and clarity."],
  ["Export", "Download DOCX or PDF when the draft feels ready."]
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
    a: "Yes. Everything stays editable, including bullets, summaries, and imported sections."
  },
  {
    q: "What if imported content is messy?",
    a: "You review it first, then fix or skip anything that is incomplete before it reaches the builder."
  }
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function readPersistedState(): PersistedState {
  if (typeof window === "undefined") {
    return defaultPersistedState;
  }
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) || "{}");
    return { ...defaultPersistedState, ...parsed };
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

function Landing({
  onStart
}: {
  onStart: () => void;
}) {
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
  profile,
  linkedinText,
  resumeText,
  onLinkedinTextChange,
  onResumeTextChange,
  onContinue
}: {
  profile: SessionProfile | null;
  linkedinText: string;
  resumeText: string;
  onLinkedinTextChange: (value: string) => void;
  onResumeTextChange: (value: string) => void;
  onContinue: () => void;
}) {
  const sections = [
    {
      title: "Header",
      status: profile?.name ? "Imported" : "Needs input",
      content: [profile?.name, profile?.email].filter(Boolean).join(" · ") || "Add your name and contact details."
    },
    {
      title: "LinkedIn text",
      status: linkedinText ? "Ready" : "Missing",
      content: linkedinText || "Paste About, Experience, or Skills."
    },
    {
      title: "Resume text",
      status: resumeText ? "Ready" : "Missing",
      content: resumeText || "Paste your current resume or upload it in the builder."
    }
  ];

  return (
    <div className="space-y-5">
      <Panel className="p-8">
        <SectionEyebrow>Import review</SectionEyebrow>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-neutral-950">
          Confirm what came in.
        </h2>
        <p className="mt-4 text-sm leading-7 text-neutral-600">
          Imported content is only a starting point. Edit anything before it reaches your final resume.
        </p>
      </Panel>

      <div className="grid gap-4">
        {sections.map((section) => (
          <Panel key={section.title} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-neutral-950">{section.title}</p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{section.content}</p>
              </div>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                {section.status}
              </span>
            </div>
            {section.title === "LinkedIn text" && (
              <textarea
                value={linkedinText}
                onChange={(event) => onLinkedinTextChange(event.target.value)}
                placeholder="Paste LinkedIn headline, about, experience, or skills"
                className="mt-4 min-h-[120px] w-full rounded-[20px] border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none"
              />
            )}
            {section.title === "Resume text" && (
              <textarea
                value={resumeText}
                onChange={(event) => onResumeTextChange(event.target.value)}
                placeholder="Paste your current resume"
                className="mt-4 min-h-[140px] w-full rounded-[20px] border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none"
              />
            )}
          </Panel>
        ))}
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
  resumeText,
  rewriteStyle,
  onTargetRoleChange,
  onLinkedinUrlChange,
  onLinkedinTextChange,
  onResumeTextChange,
  onRewriteStyleChange,
  onResumeUpload,
  resumeFileName,
  onAnalyze,
  onRewrite,
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
  resumeText: string;
  rewriteStyle: RewriteStyle;
  onTargetRoleChange: (value: string) => void;
  onLinkedinUrlChange: (value: string) => void;
  onLinkedinTextChange: (value: string) => void;
  onResumeTextChange: (value: string) => void;
  onRewriteStyleChange: (value: RewriteStyle) => void;
  onResumeUpload: (file: File | null) => void;
  resumeFileName: string;
  onAnalyze: () => void;
  onRewrite: () => void;
  analysis: AnalysisResult | null;
  rewrite: RewriteResult | null;
  isAnalyzing: boolean;
  isRewriting: boolean;
  canRewrite: boolean;
  onContinue: () => void;
}) {
  const previewText = rewrite?.rewrittenResume || analysis?.rewrittenResume || resumeText || "Your preview will appear here once you generate a draft.";
  const missingKeywords = analysis?.extracted?.missingKeywords || [];

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
                Focus on impact, ownership, and clarity. Edit anything manually.
              </p>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Fit score: {analysis ? 82 : 64}
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
            LinkedIn text
            <textarea
              value={linkedinText}
              onChange={(event) => onLinkedinTextChange(event.target.value)}
              placeholder="Paste About, Experience, or Skills"
              className="min-h-[140px] rounded-[18px] border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-neutral-900">
            Resume text
            <textarea
              value={resumeText}
              onChange={(event) => onResumeTextChange(event.target.value)}
              placeholder="Paste your current resume"
              className="min-h-[180px] rounded-[18px] border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none"
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

          <div className="flex flex-wrap gap-3">
            <button
              onClick={onAnalyze}
              disabled={isAnalyzing || !(targetRole.trim() && (resumeText.trim() || resumeFileName))}
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
      </div>

      <Panel className="sticky top-8 h-fit p-6">
        <SectionEyebrow>Live preview</SectionEyebrow>
        <div className="mt-4 rounded-[24px] border border-neutral-200 bg-neutral-50 p-6">
          <p className="text-xl font-semibold text-neutral-950">{targetRole || "Resume draft"}</p>
          <p className="mt-1 text-sm text-neutral-600">
            {(analysis?.extracted?.sections || []).length
              ? `${analysis?.extracted?.sections?.length} sections detected`
              : "Generate a draft to see a structured preview"}
          </p>

          {missingKeywords.length > 0 && (
            <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Missing keywords: {missingKeywords.join(", ")}
            </div>
          )}

          <pre className="mt-6 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700">
            {previewText}
          </pre>
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
  const [resumeText, setResumeText] = useState(persisted.resumeText);
  const [rewriteStyle, setRewriteStyle] = useState<RewriteStyle>(persisted.rewriteStyle);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeFileName, setResumeFileName] = useState("");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [rewrite, setRewrite] = useState<RewriteResult | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const deferredDraft = useMemo(
    () => rewrite?.rewrittenResume || analysis?.rewrittenResume || resumeText,
    [rewrite, analysis, resumeText]
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);

  useEffect(() => {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        stage,
        sourceMethod,
        targetRole,
        linkedinUrl,
        linkedinText,
        resumeText,
        rewriteStyle
      } satisfies PersistedState)
    );
  }, [stage, sourceMethod, targetRole, linkedinUrl, linkedinText, resumeText, rewriteStyle]);

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
        if (session.profile?.name && !resumeText.trim()) {
          setResumeText([session.profile.name, session.profile.email].filter(Boolean).join("\n"));
        }
      })
      .catch((requestError) => {
        setError(requestError.message || "Unable to load app state.");
      });
  }, []);

  async function runAnalyze() {
    setError("");
    setStatus("Generating draft...");
    setIsAnalyzing(true);
    try {
      const payload: Record<string, string> = {
        targetRole,
        linkedinUrl,
        linkedinText,
        resumeText,
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
      if (!resumeText.trim() && result.extractedResumeText) {
        setResumeText(result.extractedResumeText);
      }
      startTransition(() => setStage("builder"));
      setStatus("Draft ready.");
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
      const payload: Record<string, string> = {
        targetRole,
        linkedinUrl,
        linkedinText,
        resumeText: analysis?.extractedResumeText || resumeText,
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

  async function handleDownload(format: "pdf" | "docx") {
    setError("");
    setStatus(`Preparing ${format.toUpperCase()}...`);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          format,
          text: deferredDraft,
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
      setStage("review");
      return;
    }
    window.location.href = "/api/auth/linkedin?return_to=/v2.html";
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(179,120,67,0.12),transparent_28%),linear-gradient(180deg,#fcfaf6_0%,#f4efe8_100%)] px-5 py-8 text-neutral-950 sm:px-8">
      <div className="mx-auto max-w-7xl">
        {stage === "landing" ? (
          <Landing onStart={() => setStage("source")} />
        ) : (
          <>
            <WorkflowHeader stage={stage} onBackToLanding={() => setStage("landing")} />

            {(status || error) && (
              <div className={cn(
                "mb-5 rounded-[20px] border px-4 py-3 text-sm",
                error ? "border-amber-200 bg-amber-50 text-amber-800" : "border-neutral-200 bg-white text-neutral-700"
              )}>
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
                profile={profile}
                linkedinText={linkedinText}
                resumeText={resumeText}
                onLinkedinTextChange={setLinkedinText}
                onResumeTextChange={setResumeText}
                onContinue={() => setStage("builder")}
              />
            )}

            {stage === "builder" && (
              <Builder
                targetRole={targetRole}
                linkedinUrl={linkedinUrl}
                linkedinText={linkedinText}
                resumeText={resumeText}
                rewriteStyle={rewriteStyle}
                onTargetRoleChange={setTargetRole}
                onLinkedinUrlChange={setLinkedinUrl}
                onLinkedinTextChange={setLinkedinText}
                onResumeTextChange={setResumeText}
                onRewriteStyleChange={setRewriteStyle}
                onResumeUpload={(file) => {
                  setResumeFile(file);
                  setResumeFileName(file?.name || "");
                }}
                resumeFileName={resumeFileName}
                onAnalyze={runAnalyze}
                onRewrite={runRewrite}
                analysis={analysis}
                rewrite={rewrite}
                isAnalyzing={isAnalyzing}
                isRewriting={isRewriting}
                canRewrite={Boolean(config?.openAiRewriteEnabled && (analysis || resumeText.trim()))}
                onContinue={() => setStage("export")}
              />
            )}

            {stage === "export" && (
              <ExportStep
                onDownload={handleDownload}
                onBack={() => setStage("builder")}
                hasDraft={Boolean(deferredDraft.trim())}
                resumeText={deferredDraft}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
