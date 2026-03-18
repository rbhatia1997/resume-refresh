import * as React from "react";
import {
  useLayoutEffect,
  useRef,
  startTransition,
  useEffect,
  useMemo,
  useState
} from "react";
import { alignSkillsToRoleList, parseImportedSections, trimWeakSkillsList } from "../src/import-parser.js";

/*
 * UX refactor summary:
 * - Turned the pre-draft state into a guided onboarding card with one clear primary action.
 * - Reduced visible inputs to the minimum required first, with optional context tucked behind a disclosure.
 * - Converted the left rail from a warning-heavy checklist into a calmer progress navigator with locked/ready states.
 *
 * Why the hierarchy is better:
 * - First-time users now see the next action immediately instead of parsing a full editor upfront.
 * - Required and optional inputs are separated visually, so optional context no longer competes with the main CTA.
 * - AI timing is explained before it appears, which makes the later section-by-section flow feel earned rather than random.
 */

type Stage = "landing" | "source" | "permissions" | "review" | "builder" | "export";
type SourceMethod = "import" | "manual" | null;
type RewriteStyle = "concise" | "balanced" | "achievement";
type SectionId =
  | "header"
  | "summary"
  | "experience"
  | "skills"
  | "education"
  | "projects"
  | "certifications"
  | "community"
  | "interests";
type EvidenceLevel = "grounded" | "structured" | "inferred";
type SectionActionKind = "ai" | "local";
type SectionActionId =
  | "tighten_header"
  | "align_summary_to_role"
  | "rewrite_summary"
  | "align_experience_to_role"
  | "strengthen_bullets"
  | "add_metrics"
  | "trim_skills"
  | "align_skills_to_role"
  | "tighten_education"
  | "clarify_degree"
  | "tighten_optional_section";

type AppConfig = {
  openAiRewriteEnabled: boolean;
};

type Suggestion = {
  priority: string;
  title: string;
  detail: string;
};

type AtsSafetyItem = {
  status: "looks-safe" | "needs-attention" | "info";
  title: string;
  detail: string;
};

type AnalysisResult = {
  meta?: { targetRole?: string };
  extracted?: {
    sections?: string[];
    bullets?: number;
    missingKeywords?: string[];
    bulletQualityScore?: number;
    weakBulletCount?: number;
  };
  atsSafety?: AtsSafetyItem[];
  suggestions?: Suggestion[];
  rewrittenResume?: string;
  extractedResumeText?: string;
  finalReadiness?: AtsSafetyItem[];
};

type RewriteResult = {
  summary?: string;
  rewrittenResume?: string;
  bulletImprovements?: string[];
  trustEntries?: RewriteTrustEntry[];
  notes?: string[];
  sectionId?: SectionId;
  actionId?: SectionActionId;
};

type SectionAction = {
  id: SectionActionId;
  kind: SectionActionKind;
  label: string;
  detail: string;
};

type RewriteTrustEntry = {
  original: string;
  rewrite: string;
  whatChanged: string;
  whyStronger: string;
  evidenceLevel: EvidenceLevel;
  confidenceNote?: string;
};

type ResumeSection = {
  id: SectionId;
  title: string;
  prompt: string;
  helper: string;
  placeholder: string;
  required: boolean;
  content: string;
  confidence?: "high" | "medium" | "low";
  sourceHint?: string;
};

type PersistedState = {
  stage: Stage;
  sourceMethod: SourceMethod;
  sampleMode: boolean;
  targetRole: string;
  linkedinUrl: string;
  linkedinText: string;
  rewriteStyle: RewriteStyle;
  activeSection: SectionId;
  reviewSection: SectionId;
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
  },
  {
    id: "projects",
    title: "Projects",
    prompt: "Add projects only if they strengthen your case for this role.",
    helper: "Name, scope, tools, and result. Keep it short and concrete.",
    placeholder: "Growth Dashboard Project\n- Built a KPI dashboard in SQL and Tableau used by PM and GTM teams.",
    required: false
  },
  {
    id: "certifications",
    title: "Certifications",
    prompt: "List certifications or licenses that add real signal.",
    helper: "Only keep current or relevant credentials.",
    placeholder: "Pragmatic Certified Product Manager",
    required: false
  },
  {
    id: "community",
    title: "Community",
    prompt: "Use community, leadership, or volunteering if it adds useful signal.",
    helper: "Keep this factual and impact-focused, not autobiographical.",
    placeholder: "Mentor, Product School\n- Mentor early-career PMs on experimentation and portfolio projects.",
    required: false
  },
  {
    id: "interests",
    title: "Interests",
    prompt: "Add interests only if they make the resume more human without distracting.",
    helper: "Short list only. Skip this if it adds no value.",
    placeholder: "Distance running\nCeramics",
    required: false
  }
];

const defaultPersistedState: PersistedState = {
  stage: "landing",
  sourceMethod: null,
  sampleMode: false,
  targetRole: "",
  linkedinUrl: "",
  linkedinText: "",
  rewriteStyle: "balanced",
  activeSection: "summary",
  reviewSection: "header",
  sections: sectionBlueprints.map((item) => ({ ...item, content: "" }))
};

const beforeAfter = [
  {
    before: "Worked on onboarding improvements across signup and activation.",
    after: "Led onboarding experiments across signup and activation, lifting new-user completion 18%."
  },
  {
    before: "Helped with weekly sales reporting for leadership.",
    after: "Built weekly pipeline reporting for leadership reviews, cutting forecast prep by 6 hours."
  }
];

const landingProofItems = [
  ["Import existing material", "Start from a resume or LinkedIn profile instead of a blank page."],
  ["Strengthen weak bullets", "Turn vague responsibilities into sharper proof of ownership and results."],
  ["Export a cleaner draft", "Leave with wording that is easier to scan and ready to send."]
];

const sampleResumeSeed = {
  targetRole: "Senior Product Manager",
  linkedinText: "Product leader with experience in growth, experimentation, onboarding, monetization, SQL, and stakeholder management across B2B SaaS.",
  sections: buildDefaultSections({
    header: "Maya Patel\nSan Francisco, CA\nmaya@resumerefresh.app · linkedin.com/in/mayapatel",
    summary: "Product leader focused on growth, onboarding, and monetization strategy across B2B SaaS products, with a track record of lifting activation and improving operating cadence.",
    experience: "Senior Product Manager, Northstar\n- Owned onboarding experiments across web and lifecycle email, lifting new-account activation 18% within two quarters.\n- Led pricing and packaging tests with finance and sales, increasing expansion revenue 11% for mid-market accounts.\n- Built weekly KPI reporting for leadership, cutting forecast prep by 6 hours and speeding roadmap decisions.\nGrowth Product Manager, Atlas\n- Reworked trial-to-paid messaging with lifecycle and product teams, improving trial conversion 9%.\n- Standardized experiment readouts across product squads, reducing analysis turnaround from 3 days to 1.",
    skills: "Product Strategy\nExperimentation\nSQL\nStakeholder Management\nLifecycle Growth\nPricing & Packaging",
    education: "University of California, Berkeley\nB.A. Economics, 2017"
  })
};

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
  education: ["EDUCATION"],
  projects: ["PROJECTS", "SELECTED PROJECTS"],
  certifications: ["CERTIFICATIONS", "LICENSES"],
  community: ["COMMUNITY", "LEADERSHIP", "VOLUNTEERING", "VOLUNTEER"],
  interests: ["INTERESTS"]
};

function deriveSections(linkedinText: string, resumeText: string, linkedinUrl = "") {
  const parsed = parseImportedSections({
    linkedinUrl,
    linkedinText,
    resumeText
  });

  return buildDefaultSections(
    Object.fromEntries(
      (Object.keys(headingAliases) as SectionId[]).map((sectionId) => [
        sectionId,
        parsed.sections[sectionId]?.content || ""
      ])
    ) as Partial<Record<SectionId, string>>
  ).map((section) => ({
    ...section,
    confidence: parsed.sections[section.id]?.confidence,
    sourceHint: parsed.sections[section.id]?.sourceHint
  }));
}

function serializeSections(sections: ResumeSection[]) {
  const sectionMap = Object.fromEntries(sections.map((section) => [section.id, normalizeText(section.content)])) as Record<SectionId, string>;
  const blocks = [
    sectionMap.header,
    sectionMap.summary ? `SUMMARY\n${sectionMap.summary}` : "",
    sectionMap.experience ? `EXPERIENCE\n${sectionMap.experience}` : "",
    sectionMap.skills ? `SKILLS\n${sectionMap.skills}` : "",
    sectionMap.education ? `EDUCATION\n${sectionMap.education}` : "",
    sectionMap.projects ? `PROJECTS\n${sectionMap.projects}` : "",
    sectionMap.certifications ? `CERTIFICATIONS\n${sectionMap.certifications}` : "",
    sectionMap.community ? `COMMUNITY\n${sectionMap.community}` : "",
    sectionMap.interests ? `INTERESTS\n${sectionMap.interests}` : ""
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

const requiredGuidedOrder: SectionId[] = ["header", "summary", "experience", "skills", "education"];
const optionalGuidedOrder: SectionId[] = ["projects", "certifications", "community", "interests"];

function activeGuidedSections(sections: ResumeSection[]) {
  const optionalVisible = optionalGuidedOrder.filter((sectionId) => {
    const section = sections.find((item) => item.id === sectionId);
    return Boolean(section && normalizeText(section.content));
  });
  return [...requiredGuidedOrder, ...optionalVisible];
}

function nextGuidedSection(sections: ResumeSection[], activeSection: SectionId) {
  const ordered = activeGuidedSections(sections);
  const currentIndex = ordered.indexOf(activeSection);
  return ordered[currentIndex + 1] || null;
}

function sectionToneTips(sectionId: SectionId) {
  return {
    header: "Keep this factual, scan-friendly, and compact.",
    summary: "Aim for 2-3 lines. Explain direction and strengths without sounding inflated.",
    experience: "Prefer action + outcome. Show scope, ownership, or results when possible.",
    skills: "List only what helps the target role. Cut generic filler.",
    education: "Only include details that still help your story.",
    projects: "Show what you built, the tools involved, and why it mattered.",
    certifications: "Only keep credentials that help this target role.",
    community: "Treat this like resume evidence, not a biography sidebar.",
    interests: "Keep this short and human. It should not compete with experience."
  }[sectionId];
}

function suggestionSection(title: string): SectionId | "global" {
  const normalized = title.toLowerCase();
  if (normalized.includes("summary")) return "summary";
  if (normalized.includes("skills")) return "skills";
  if (normalized.includes("education") || normalized.includes("dates")) return "education";
  if (normalized.includes("project")) return "projects";
  if (normalized.includes("certification") || normalized.includes("license")) return "certifications";
  if (normalized.includes("community") || normalized.includes("volunteer") || normalized.includes("leadership")) return "community";
  if (normalized.includes("interest")) return "interests";
  if (
    normalized.includes("bullet") ||
    normalized.includes("experience") ||
    normalized.includes("verb tense") ||
    normalized.includes("first-person") ||
    normalized.includes("quantified") ||
    normalized.includes("impact")
  ) {
    return "experience";
  }
  return "global";
}

function sectionIssues(sectionId: SectionId, analysis: AnalysisResult | null) {
  if (!analysis) {
    return [];
  }
  const direct = (analysis.suggestions || []).filter((item) => suggestionSection(item.title) === sectionId);
  const ats = (analysis.atsSafety || [])
    .filter((item) => {
      const normalized = item.title.toLowerCase();
      if (sectionId === "experience") {
        return normalized.includes("c.a.r.") || normalized.includes("first-person");
      }
      if (sectionId === "education") {
        return normalized.includes("standard section titles");
      }
      if (sectionId === "skills") {
        return normalized.includes("standard section titles");
      }
      if (sectionId === "projects" || sectionId === "certifications" || sectionId === "community" || sectionId === "interests") {
        return false;
      }
      if (sectionId === "summary") {
        return normalized.includes("first-person");
      }
      return false;
    })
    .map((item) => ({
      priority: item.status === "needs-attention" ? "high" : "medium",
      title: item.title,
      detail: item.detail
    }));

  return [...direct, ...ats];
}

function recommendedSection(sections: ResumeSection[], analysis: AnalysisResult | null) {
  if (analysis) {
    const priorityOrder: SectionId[] = ["header", "summary", "experience", "skills", "education", "projects", "certifications", "community", "interests"];
    for (const sectionId of priorityOrder) {
      if (sectionIssues(sectionId, analysis).length > 0) {
        return sectionId;
      }
    }
  }
  return nextGuidedSection(sections, "header") || "header";
}

function sectionAiActions(sectionId: SectionId, targetRole: string) {
  const roleLabel = targetRole.trim() || "your target role";
  return {
    header: [
      {
        id: "tighten_header",
        kind: "ai",
        label: "Preview tighter header",
        detail: "Keep the header factual and easier to scan."
      }
    ],
    summary: [
      {
        id: "rewrite_summary",
        kind: "ai",
        label: "Preview summary rewrite",
        detail: "Tighten the summary without changing the core positioning."
      },
      {
        id: "align_summary_to_role",
        kind: "ai",
        label: `Align to ${roleLabel}`,
        detail: "Shift the summary toward the target role and strongest signal."
      }
    ],
    experience: [
      {
        id: "strengthen_bullets",
        kind: "ai",
        label: "Preview stronger bullets",
        detail: "Sharpen ownership and outcome language in this experience section."
      },
      {
        id: "align_experience_to_role",
        kind: "ai",
        label: `Align to ${roleLabel}`,
        detail: "Adjust bullet framing toward the target role and highlight measurable impact."
      }
    ],
    skills: [
      {
        id: "trim_skills",
        kind: "local",
        label: "Trim weak skills",
        detail: "Remove weak, duplicated, or low-signal skills from this list."
      },
      {
        id: "align_skills_to_role",
        kind: "local",
        label: `Align to ${roleLabel}`,
        detail: "Prioritize the skills that best support the target role."
      }
    ],
    education: [
      {
        id: "tighten_education",
        kind: "ai",
        label: "Preview concise education",
        detail: "Shorten education details without losing useful signal."
      },
      {
        id: "clarify_degree",
        kind: "ai",
        label: "Preview degree cleanup",
        detail: "Make the degree, school, and date easier to scan."
      }
    ],
    projects: [
      {
        id: "tighten_optional_section",
        kind: "ai",
        label: "Preview project cleanup",
        detail: "Make project scope and result easier to scan."
      }
    ],
    certifications: [
      {
        id: "tighten_optional_section",
        kind: "ai",
        label: "Preview concise certification list",
        detail: "Trim credentials to the ones that add signal."
      }
    ],
    community: [
      {
        id: "tighten_optional_section",
        kind: "ai",
        label: "Preview cleaner community section",
        detail: "Tighten this section into factual, resume-ready proof."
      }
    ],
    interests: [
      {
        id: "tighten_optional_section",
        kind: "ai",
        label: "Preview shorter interests",
        detail: "Keep only short, humanizing interests that do not distract."
      }
    ]
  }[sectionId];
}

function sectionExample(sectionId: SectionId) {
  return {
    header: "Maya Patel | San Francisco, CA | maya@email.com | linkedin.com/in/maya",
    summary: "Product manager targeting growth roles with experience across onboarding, experimentation, and cross-functional delivery.",
    experience: "Owned onboarding experiments across web and lifecycle email, lifting activation by 14% for new self-serve accounts.",
    skills: "Product Strategy | Experimentation | SQL | Stakeholder Management",
    education: "University of Washington | B.A. Economics | 2020",
    projects: "Activation Dashboard | Built a KPI dashboard in SQL and Tableau used in weekly product reviews.",
    certifications: "Pragmatic Certified Product Manager",
    community: "Mentor, Product School | Coach early-career PMs on experimentation and case-study storytelling.",
    interests: "Distance running | Ceramics"
  }[sectionId];
}

const weakSkillTerms = new Set([
  "communication",
  "teamwork",
  "hard working",
  "hardworking",
  "detail oriented",
  "detail-oriented",
  "leadership",
  "problem solving",
  "problem-solving",
  "microsoft office",
  "collaboration"
]);

const roleSkillHints: Array<[string, string[]]> = [
  ["product manager", ["Product Strategy", "Roadmapping", "Experimentation", "Analytics", "SQL", "Stakeholder Management", "User Research", "Prioritization"]],
  ["product", ["Product Strategy", "Roadmapping", "Experimentation", "Analytics", "SQL", "Stakeholder Management"]],
  ["designer", ["User Research", "Interaction Design", "Figma", "Design Systems", "Prototyping"]],
  ["engineer", ["JavaScript", "TypeScript", "React", "Node.js", "System Design", "Testing"]],
  ["data", ["SQL", "Python", "Analytics", "Experimentation", "Dashboarding"]]
];

function parseSkills(content: string) {
  return content
    .split(/\n|,|\|/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeSkills(skills: string[]) {
  return skills.join("\n");
}

function dedupeSkills(skills: string[]) {
  const seen = new Set<string>();
  return skills.filter((skill) => {
    const key = skill.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function trimWeakSkillsContent(content: string, targetRole: string) {
  const trimmed = trimWeakSkillsList(content);
  const normalizedRole = targetRole.toLowerCase();
  const preferredSkills = roleSkillHints.find(([role]) => normalizedRole.includes(role))?.[1] || [];
  if (!preferredSkills.length) {
    return serializeSkills(trimmed.slice(0, 10));
  }

  const preferredSet = new Set(preferredSkills.map((skill) => skill.toLowerCase()));
  const prioritized = [];
  const secondary = [];
  for (const skill of trimmed) {
    if (preferredSet.has(skill.toLowerCase())) {
      prioritized.push(skill);
    } else if (!weakSkillTerms.has(skill.toLowerCase())) {
      secondary.push(skill);
    }
  }

  if (prioritized.length >= 3) {
    return serializeSkills(prioritized.slice(0, 10));
  }

  return serializeSkills([...prioritized, ...secondary.slice(0, Math.max(0, 10 - prioritized.length))].slice(0, 10));
}

function alignSkillsToRoleContent(content: string, targetRole: string) {
  const skills = alignSkillsToRoleList(content, targetRole);
  if (!skills.length) {
    return "";
  }
  return serializeSkills(skills.slice(0, 10));
}

function sectionStatusLabel(section: ResumeSection) {
  const status = getSectionStatus(section);
  return status === "Ready" ? "Complete" : status === "Needs detail" ? "Recommended next" : status;
}

function navigatorStatus(section: ResumeSection, hasDraft: boolean, activeSection: SectionId) {
  if (!hasDraft) {
    return section.required ? "Ready after draft" : "Not started";
  }
  if (section.id === activeSection) {
    return "In progress";
  }
  const status = getSectionStatus(section);
  if (status === "Ready") return "Complete";
  if (status === "Needs detail") return "Recommended next";
  return "Not started";
}

function parseExperienceRoles(content: string) {
  const lines = normalizeText(content).split("\n");
  const roles: Array<{ title: string; bullets: string[] }> = [];
  let currentTitle = "";
  let currentBullets: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (currentTitle || currentBullets.length) {
        roles.push({ title: currentTitle || `Role ${roles.length + 1}`, bullets: currentBullets });
      }
      currentTitle = "";
      currentBullets = [];
      continue;
    }

    if (/^[-*•]/.test(line)) {
      currentBullets.push(line.replace(/^[-*•]\s*/, ""));
      continue;
    }

    if (!currentTitle) {
      currentTitle = line;
    } else {
      currentBullets.push(line);
    }
  }

  if (currentTitle || currentBullets.length) {
    roles.push({ title: currentTitle || `Role ${roles.length + 1}`, bullets: currentBullets });
  }

  return roles.filter((role) => role.title || role.bullets.length);
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
        "rounded-2xl border border-neutral-200 bg-white",
        className
      )}
    >
      {children}
    </div>
  );
}

function ProgressStepper({
  sections,
  hasDraft,
  activeSection,
  onSectionSelect
}: {
  sections: ResumeSection[];
  hasDraft: boolean;
  activeSection: SectionId;
  onSectionSelect?: (id: SectionId) => void;
}) {
  const guidedSections = activeGuidedSections(sections);
  const finalReviewUnlocked = requiredGuidedOrder.every((sectionId) => {
    const section = sections.find((item) => item.id === sectionId);
    return section ? getSectionStatus(section) !== "Missing" : false;
  });
  return (
    <aside className="h-fit xl:sticky xl:top-8">
      <SectionEyebrow>Progress</SectionEyebrow>
      <div className="mt-4 rounded-2xl bg-white/75 p-4 ring-1 ring-neutral-200/80 backdrop-blur">
        <div className="space-y-1.5">
        <div className="flex items-start gap-3 rounded-xl px-2 py-2">
          <span className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
            hasDraft ? "bg-emerald-50 text-emerald-700" : "bg-neutral-950 text-white"
          )}>
            1
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-950">Create first draft</p>
            <p className="mt-1 text-xs leading-5 text-neutral-500">{hasDraft ? "Complete" : "Start here"}</p>
          </div>
        </div>
        {guidedSections.map((sectionId, index) => {
          const section = sections.find((item) => item.id === sectionId)!;
          const state = navigatorStatus(section, hasDraft, activeSection);
          const tone = state === "Complete"
            ? "bg-emerald-50 text-emerald-700"
            : state === "In progress"
              ? "bg-neutral-950 text-white"
              : "bg-neutral-100 text-neutral-500";
          const canSelect = Boolean(hasDraft && onSectionSelect);
          return (
            <button
              key={section.id}
              type="button"
              data-testid={`left-rail-section-${section.id}`}
              onClick={() => {
                if (canSelect) {
                  onSectionSelect?.(section.id);
                }
              }}
              disabled={!canSelect}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition",
                canSelect ? "hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950/15" : "cursor-default"
              )}
            >
              <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", tone)}>
                {index + 2}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900">{section.title}</p>
                <p className="text-xs leading-5 text-neutral-500">{state}</p>
              </div>
            </button>
          );
        })}
        <div className="flex items-start gap-3 rounded-xl px-2 py-2">
          <span className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
            hasDraft ? "bg-neutral-50 text-neutral-600" : "border border-dashed border-neutral-300 bg-white text-neutral-400"
          )}>
            {guidedSections.length + 2}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">Final review</p>
            <p className="mt-1 text-xs leading-5 text-neutral-500">
              {hasDraft ? (finalReviewUnlocked ? "Ready next" : "Locked until required sections are complete") : "Ready after draft"}
            </p>
          </div>
        </div>
      </div>
      </div>
    </aside>
  );
}

function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  const copy = {
    grounded: "Grounded",
    structured: "Structured",
    inferred: "Inferred"
  }[level];

  const className = {
    grounded: "border-neutral-200 bg-neutral-100 text-neutral-700",
    structured: "border-sky-200 bg-sky-50 text-sky-700",
    inferred: "border-amber-200 bg-amber-50 text-amber-700"
  }[level];

  return (
    <span className={cn("rounded-lg border px-2.5 py-1 text-[11px] font-medium", className)}>
      {copy}
    </span>
  );
}

function AtsSafetyBadge({ status }: { status: AtsSafetyItem["status"] }) {
  const label = status === "looks-safe" ? "Looks safe" : status === "needs-attention" ? "Needs attention" : "Info";
  const classes = status === "looks-safe"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "needs-attention"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-neutral-200 bg-neutral-50 text-neutral-600";

  return (
    <span className={cn("rounded-full border px-3 py-1 text-xs font-medium", classes)}>
      {label}
    </span>
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
    <div data-testid="resume-preview" className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
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
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Missing keywords: {missingKeywords.join(", ")}
        </div>
      )}

      {([
        ["summary", "Summary"],
        ["experience", "Experience"],
        ["skills", "Skills"],
        ["education", "Education"],
        ["projects", "Projects"],
        ["certifications", "Certifications"],
        ["community", "Community"],
        ["interests", "Interests"]
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

function hasExperienceDateSignal(text: string) {
  return /\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(?:19|20)\d{2}\b/i.test(text);
}

function buildFinalReviewChecks(sections: ResumeSection[]) {
  const findSection = (id: SectionId) => sections.find((section) => section.id === id);
  const items: AtsSafetyItem[] = [];
  const requiredSections = requiredGuidedOrder.map((id) => findSection(id)).filter(Boolean) as ResumeSection[];
  const missingRequired = requiredSections.filter((section) => getSectionStatus(section) === "Missing");

  if (missingRequired.length) {
    items.push({
      status: "needs-attention",
      title: "Required sections are still incomplete",
      detail: `Finish ${missingRequired.map((section) => section.title.toLowerCase()).join(", ")} before export.`
    });
  } else {
    items.push({
      status: "looks-safe",
      title: "Required sections are present",
      detail: "Header, summary, experience, skills, and education are all filled in."
    });
  }

  const experience = findSection("experience");
  if (experience && normalizeText(experience.content) && !hasExperienceDateSignal(experience.content)) {
    items.push({
      status: "needs-attention",
      title: "Experience needs date clarity",
      detail: "Add date ranges to experience entries so recruiters can quickly understand timeline and tenure."
    });
  } else if (experience && normalizeText(experience.content)) {
    items.push({
      status: "looks-safe",
      title: "Experience timeline looks clear",
      detail: "Experience entries include visible date cues."
    });
  }

  const optionalPresent = optionalGuidedOrder.filter((sectionId) => {
    const section = findSection(sectionId);
    return Boolean(section && normalizeText(section.content));
  });
  if (optionalPresent.length) {
    items.push({
      status: "info",
      title: "Optional sections included",
      detail: `${optionalPresent.map((sectionId) => findSection(sectionId)?.title).filter(Boolean).join(", ")} will be included in the final resume.`
    });
  }

  return items;
}

function Landing({
  onStart,
  onViewSample
}: {
  onStart: () => void;
  onViewSample: () => void;
}) {
  return (
    <section className="py-8 sm:py-10">
      <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">Resume Refresh</p>
            </div>
            <p className="hidden text-xs text-neutral-400 sm:block">Resume cleanup for first-pass credibility</p>
          </div>
        </div>

        <div className="grid gap-8 px-5 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:gap-10 lg:px-8">
          <div className="max-w-xl">
            <SectionEyebrow>Resume cleanup, without the fluff</SectionEyebrow>
            <h1 className="mt-4 max-w-[10ch] text-4xl font-semibold leading-[0.96] tracking-[-0.045em] text-neutral-950 sm:text-5xl">
              Import your resume. Leave with stronger proof.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-neutral-600">
              Bring in your current resume or LinkedIn profile, tighten weak bullets, and leave with a cleaner draft built around clearer outcomes.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={onStart}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 text-sm font-medium text-white transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
              >
                Start Resume Refresh
              </button>
              <button
                onClick={onViewSample}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
              >
                View sample
              </button>
            </div>
          </div>

          <Panel className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-4">
              <div>
                <p className="text-sm font-semibold text-neutral-950">Rewrite example</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-400">Shorter, clearer, more credible</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                Before to after
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {beforeAfter.map((item) => (
                <div key={item.before} className="grid overflow-hidden rounded-xl border border-neutral-200 sm:grid-cols-2">
                  <div className="bg-neutral-50 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Before</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">{item.before}</p>
                  </div>
                  <div className="border-t border-neutral-200 bg-emerald-50/60 px-4 py-4 sm:border-l sm:border-t-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">After</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-900">{item.after}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <section id="sample-preview" className="mt-4 scroll-mt-24">
        <div className="grid gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-4 sm:grid-cols-3 sm:px-5">
          {landingProofItems.map(([title, copy]) => (
            <div key={title} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4">
              <p className="text-sm font-semibold text-neutral-950">{title}</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{copy}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
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
        Pick your starting point.
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
        Paste LinkedIn text if you want a faster import path without scraping. Start manually if you want a blank builder with placeholders only.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <button
          onClick={onImport}
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-left transition hover:border-neutral-300 hover:bg-white"
        >
          <p className="text-base font-semibold text-neutral-950">Paste LinkedIn text</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Paste the parts of your LinkedIn profile you want to use, then review what came in before it touches your draft.
          </p>
        </button>
        <button
          onClick={onManual}
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-left transition hover:border-neutral-300 hover:bg-white"
        >
          <p className="text-base font-semibold text-neutral-950">Start manually</p>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Open a blank builder and write section by section without importing anything.
          </p>
        </button>
      </div>
    </Panel>
  );
}

function LinkedInPasteImport({
  onContinue,
  onManual,
  linkedinUrl,
  linkedinHeadline,
  linkedinExperience,
  linkedinSkills,
  onLinkedinUrlChange,
  onLinkedinHeadlineChange,
  onLinkedinExperienceChange,
  onLinkedinSkillsChange
}: {
  onContinue: () => void;
  onManual: () => void;
  linkedinUrl: string;
  linkedinHeadline: string;
  linkedinExperience: string;
  linkedinSkills: string;
  onLinkedinUrlChange: (value: string) => void;
  onLinkedinHeadlineChange: (value: string) => void;
  onLinkedinExperienceChange: (value: string) => void;
  onLinkedinSkillsChange: (value: string) => void;
}) {
  return (
    <Panel className="p-8 sm:p-10">
      <SectionEyebrow>LinkedIn import</SectionEyebrow>
      <h2 data-step-heading="true" tabIndex={-1} className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-neutral-950">
        Paste LinkedIn text to build your draft.
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
        This app does not scrape LinkedIn profile data because that would violate LinkedIn's rules. Paste your own profile text here instead, and the app will turn it into a reviewable draft input.
      </p>
      <div className="mt-8 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Panel className="p-5">
          <p className="text-sm font-semibold text-neutral-900">What to paste</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-neutral-600">
            <li>Your LinkedIn profile URL.</li>
            <li>Headline or About text.</li>
            <li>Experience text copied from your profile.</li>
            <li>Skills, if it helps the target role.</li>
          </ul>
          <p className="mt-4 text-sm font-semibold text-neutral-900">Why it has to work this way</p>
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            The app can use LinkedIn text that you paste yourself, but it does not scrape profile data because that would violate LinkedIn's rules. This keeps the workflow compliant and still gives the draft builder enough material to work with.
          </p>
        </Panel>
        <Panel className="p-5">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-neutral-900">
              LinkedIn profile URL
              <input
                value={linkedinUrl}
                onChange={(event) => onLinkedinUrlChange(event.target.value)}
                placeholder="https://www.linkedin.com/in/your-name"
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-neutral-900">
              Headline or About
              <textarea
                value={linkedinHeadline}
                onChange={(event) => onLinkedinHeadlineChange(event.target.value)}
                placeholder="Paste your headline or About section"
                className="min-h-[110px] rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-neutral-900">
              Experience
              <textarea
                value={linkedinExperience}
                onChange={(event) => onLinkedinExperienceChange(event.target.value)}
                placeholder="Paste your LinkedIn experience text"
                className="min-h-[140px] rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-neutral-900">
              Skills
              <textarea
                value={linkedinSkills}
                onChange={(event) => onLinkedinSkillsChange(event.target.value)}
                placeholder="Optional: paste skills that support your target role"
                className="min-h-[90px] rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none"
              />
            </label>
          </div>
        </Panel>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          onClick={onContinue}
          className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Use this LinkedIn text
        </button>
        <button
          onClick={onManual}
          className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
        >
          Start manually instead
        </button>
      </div>
    </Panel>
  );
}

function ImportReview({
  sections,
  activeSection,
  onSectionChange,
  onSectionSelect,
  onContinue,
  linkedinText
}: {
  sections: ResumeSection[];
  activeSection: SectionId;
  onSectionChange: (id: SectionId, value: string) => void;
  onSectionSelect: (id: SectionId) => void;
  onContinue: () => void;
  linkedinText: string;
}) {
  const reviewOrder: SectionId[] = ["header", "summary", "experience", "skills", "education"];
  const currentIndex = Math.max(0, reviewOrder.indexOf(activeSection));
  const selectedSection = sections.find((section) => section.id === activeSection) || sections[0];
  const nextSectionId = reviewOrder[currentIndex + 1] || null;
  const hasLinkedinText = Boolean(normalizeText(linkedinText));
  const confidenceLabel = selectedSection.confidence === "high"
    ? "Looks solid"
    : selectedSection.confidence === "medium"
      ? "Quick review recommended"
      : "Needs a close look";

  return (
    <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-start">
      <Panel className="h-fit p-5 xl:sticky xl:top-8">
        <SectionEyebrow>Import review</SectionEyebrow>
        <p className="mt-4 text-sm leading-6 text-neutral-600">
          We organized your import into resume sections. Review each one before creating your first draft.
        </p>
        <div className="mt-5 space-y-2">
          {reviewOrder.map((sectionId, index) => {
            const section = sections.find((item) => item.id === sectionId)!;
            const isActive = sectionId === activeSection;
            const isComplete = index < currentIndex;
            return (
              <button
                key={sectionId}
                onClick={() => onSectionSelect(sectionId)}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition",
                  isActive ? "bg-neutral-950 text-white" : "bg-neutral-50 text-neutral-800 hover:bg-neutral-100"
                )}
              >
                <span>
                  <span className="block text-xs uppercase tracking-[0.14em] opacity-60">Step {index + 1}</span>
                  <span className="mt-1 block text-sm font-medium">{section.title}</span>
                </span>
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", isActive ? "bg-white/15 text-white" : isComplete ? "bg-emerald-100 text-emerald-800" : "bg-white text-neutral-600")}>
                  {isComplete ? "Reviewed" : isActive ? "Current" : "Up next"}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="space-y-5">
        <Panel className="p-8">
          <SectionEyebrow>Step {currentIndex + 1} of {reviewOrder.length}</SectionEyebrow>
          <h2 data-step-heading="true" tabIndex={-1} className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-neutral-950">
            Review {selectedSection.title.toLowerCase()} import
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
            {selectedSection.prompt} This is the structured version of what the app could infer from your import, not the final draft.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
              {selectedSection.sourceHint || "Parsed from imported content"}
            </div>
            <div className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">
              {confidenceLabel}
            </div>
            {hasLinkedinText && (
              <div className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">
                Pasted profile text cleaned automatically
              </div>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-sm font-semibold text-neutral-900">What to check</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">{selectedSection.helper}</p>
          </div>

          <label className="mt-6 block">
            <span className="text-sm font-medium text-neutral-900">{selectedSection.title}</span>
            <textarea
              data-testid={`review-${selectedSection.id}`}
              value={selectedSection.content}
              onChange={(event) => onSectionChange(selectedSection.id, event.target.value)}
              placeholder={selectedSection.placeholder}
              className="mt-3 min-h-[220px] w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none transition focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5"
            />
          </label>

          <div className="mt-6 flex flex-wrap gap-3">
            {currentIndex > 0 && (
              <button
                onClick={() => onSectionSelect(reviewOrder[currentIndex - 1])}
                className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
              >
                Back
              </button>
            )}
              <button
                onClick={() => {
                  if (nextSectionId) {
                    onSectionSelect(nextSectionId);
                    return;
                  }
                  onContinue();
                }}
                className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
              >
              {nextSectionId ? "Save and continue" : "Continue to draft setup"}
              </button>
          </div>
        </Panel>

        <Panel className="border-transparent bg-white/60 p-5 shadow-none">
          <SectionEyebrow>How it works</SectionEyebrow>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              "We cleaned obvious clipboard junk before this review step.",
              "You are checking one section at a time before draft generation.",
              "AI suggestions unlock only after the first draft exists."
            ].map((item) => (
              <div key={item} className="rounded-2xl bg-white/80 px-4 py-4 ring-1 ring-neutral-200/80">
                <p className="text-sm leading-6 text-neutral-600">{item}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PreDraftSetup({
  targetRole,
  linkedinUrl,
  linkedinText,
  resumeFileName,
  onTargetRoleChange,
  onLinkedinUrlChange,
  onLinkedinTextChange,
  onResumeUpload,
  onAnalyze,
  isAnalyzing
}: {
  targetRole: string;
  linkedinUrl: string;
  linkedinText: string;
  resumeFileName: string;
  onTargetRoleChange: (value: string) => void;
  onLinkedinUrlChange: (value: string) => void;
  onLinkedinTextChange: (value: string) => void;
  onResumeUpload: (file: File | null) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}) {
  const canAnalyze = Boolean(targetRole.trim() && (resumeFileName || linkedinText.trim()));
  const resumeInputId = "resume-upload-input";
  const linkedinTextId = "linkedin-support-text";
  const targetRoleId = "target-role-input";
  const missingItems = [
    !targetRole.trim() ? "Choose a target role" : "",
    !resumeFileName && !linkedinText.trim() ? "Add a resume file or paste LinkedIn text" : ""
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <Panel className="w-full overflow-hidden rounded-[28px] border-neutral-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <div className="border-b border-neutral-200 px-6 py-6 sm:px-8 sm:py-8">
          <SectionEyebrow>Resume Refresh</SectionEyebrow>
          <div className="mt-4 max-w-3xl">
            <h2 data-step-heading="true" tabIndex={-1} className="text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.05em] text-neutral-950 sm:text-[3.2rem]">
              Create your first draft
            </h2>
            <p className="mt-4 text-base leading-7 text-neutral-600">
              Start with the role you want, add your current resume or LinkedIn text, and we&apos;ll turn it into a structured draft before any AI coaching appears.
            </p>
          </div>
        </div>

        <div className="divide-y divide-neutral-200">
          <section className="px-6 py-6 sm:px-8 sm:py-7">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-neutral-950">Step 1</p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-neutral-950">Choose target role</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                This tells the draft generator what the resume should optimize for.
              </p>
            </div>
            <label htmlFor={targetRoleId} className="mt-5 grid max-w-2xl gap-2 text-sm font-medium text-neutral-900">
              Target role
              <input
                id={targetRoleId}
                value={targetRole}
                onChange={(event) => onTargetRoleChange(event.target.value)}
                placeholder="Senior Product Manager"
                className="h-12 rounded-2xl border border-neutral-300 bg-white px-4 text-sm text-neutral-900 outline-none transition focus-visible:border-neutral-950 focus-visible:ring-4 focus-visible:ring-neutral-950/5"
              />
            </label>
          </section>

          <section className="px-6 py-6 sm:px-8 sm:py-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-neutral-950">Step 2</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-neutral-950">Add your resume</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  Use whichever source is easier. You only need one to create the first draft.
                </p>
              </div>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                Upload or paste
              </span>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl bg-neutral-50 p-5 ring-1 ring-inset ring-neutral-200">
                <p className="text-base font-semibold text-neutral-950">Upload resume</p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  Best if you already have a resume draft file and want the fastest start.
                </p>
                <label htmlFor={resumeInputId} className="mt-5 grid gap-3 text-sm font-medium text-neutral-900">
                  <span className="sr-only">Resume file</span>
                  <input
                    id={resumeInputId}
                    type="file"
                    accept=".pdf,.txt,.md"
                    onChange={(event) => onResumeUpload(event.target.files?.[0] || null)}
                    className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition file:mr-3 file:rounded-full file:border-0 file:bg-neutral-950 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white focus-visible:border-neutral-950 focus-visible:ring-4 focus-visible:ring-neutral-950/5"
                  />
                  <span className="text-sm text-neutral-500">{resumeFileName || "No file selected yet"}</span>
                </label>
              </div>

              <div className="rounded-3xl bg-neutral-50 p-5 ring-1 ring-inset ring-neutral-200">
                <p className="text-base font-semibold text-neutral-950">Paste LinkedIn text</p>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  Paste your headline, about section, or recent experience if that content is more up to date.
                </p>
                <label htmlFor={linkedinTextId} className="mt-5 grid gap-3 text-sm font-medium text-neutral-900">
                  LinkedIn text
                  <textarea
                    id={linkedinTextId}
                    data-testid="linkedin-support-text"
                    value={linkedinText}
                    onChange={(event) => onLinkedinTextChange(event.target.value)}
                    placeholder="Paste your headline, about section, or recent experience"
                    className="min-h-[220px] w-full resize-y rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none transition focus-visible:border-neutral-950 focus-visible:ring-4 focus-visible:ring-neutral-950/5"
                  />
                </label>
              </div>
            </div>

            <details className="mt-5 rounded-2xl bg-neutral-50 px-5 py-4 ring-1 ring-inset ring-neutral-200">
              <summary className="cursor-pointer list-none text-sm font-medium text-neutral-900">
                Add extra context
                <span className="ml-2 text-xs font-normal text-neutral-500">Optional</span>
              </summary>
              <label className="mt-4 grid max-w-2xl gap-2 text-sm font-medium text-neutral-900">
                LinkedIn URL
                <input
                  value={linkedinUrl}
                  onChange={(event) => onLinkedinUrlChange(event.target.value)}
                  placeholder="https://www.linkedin.com/in/your-name"
                  className="h-12 rounded-2xl border border-neutral-300 bg-white px-4 text-sm text-neutral-900 outline-none transition focus-visible:border-neutral-950 focus-visible:ring-4 focus-visible:ring-neutral-950/5"
                />
              </label>
            </details>
          </section>

          <section className="bg-neutral-50/80 px-6 py-6 sm:px-8 sm:py-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-neutral-950">Step 3</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-neutral-950">Create first draft</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">
                  We&apos;ll analyze what you added, assemble a cleaner draft, and then unlock section-by-section AI suggestions where they actually help.
                </p>
                <p className="mt-3 text-sm font-medium text-neutral-700">
                  AI suggestions unlock after your first draft is created.
                </p>
                {missingItems.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-white px-4 py-3 ring-1 ring-inset ring-amber-200">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Before you continue</p>
                    <ul className="mt-2 space-y-1 text-sm leading-6 text-amber-900">
                      {missingItems.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="min-w-[240px]">
                <button
                  onClick={onAnalyze}
                  disabled={!canAnalyze || isAnalyzing}
                  aria-describedby={!canAnalyze ? "create-first-draft-help" : undefined}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-neutral-950 px-5 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950"
                >
                  {isAnalyzing ? "Creating first draft..." : "Create first draft"}
                </button>
                <p id="create-first-draft-help" className="mt-3 text-xs leading-5 text-neutral-500">
                  {canAnalyze
                    ? "Next: we’ll show your biggest improvement areas and move you into section-by-section editing."
                    : "Choose a target role and add a resume source to enable draft creation."}
                </p>
              </div>
            </div>
          </section>
        </div>
      </Panel>

      <div className="px-1">
        <Panel className="border-transparent bg-white/60 p-5 shadow-none">
          <SectionEyebrow>How this works</SectionEyebrow>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              "Generate a draft from your current resume",
              "Review the biggest improvement areas",
              "Use AI section-by-section after that"
            ].map((item) => (
              <div key={item} className="rounded-2xl bg-white/80 px-4 py-4 ring-1 ring-neutral-200/80">
                <p className="text-sm leading-6 text-neutral-600">{item}</p>
              </div>
            ))}
          </div>
        </Panel>
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
  onRunSectionAction,
  onApplyRewriteSection,
  onDiscardRewrite,
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
  onRunSectionAction: (action: SectionAction) => void;
  onApplyRewriteSection: (id: SectionId, value: string) => void;
  onDiscardRewrite: () => void;
  analysis: AnalysisResult | null;
  rewrite: RewriteResult | null;
  isAnalyzing: boolean;
  isRewriting: boolean;
  canRewrite: boolean;
  onContinue: () => void;
}) {
  const selectedSection = sections.find((section) => section.id === activeSection) || sections[0];
  const guidedSections = activeGuidedSections(sections);
  const selectedSectionIndex = Math.max(0, guidedSections.findIndex((sectionId) => sectionId === selectedSection.id));
  const nextSectionId = nextGuidedSection(sections, activeSection);
  const rewriteMatchesSection = rewrite?.sectionId === selectedSection.id;
  const rewrittenSections = rewriteMatchesSection && rewrite?.rewrittenResume
    ? deriveSections("", rewrite.rewrittenResume)
    : [];
  const rewrittenSectionMap = Object.fromEntries(
    rewrittenSections.map((section) => [section.id, normalizeText(section.content)])
  ) as Partial<Record<SectionId, string>>;
  const currentSectionText = normalizeText(selectedSection.content);
  const rewrittenSectionText = rewrittenSectionMap[selectedSection.id] || "";
  const selectedSectionLineCount = currentSectionText ? currentSectionText.split("\n").filter(Boolean).length : 0;
  const currentIssues = sectionIssues(selectedSection.id, analysis);
  const sectionActions = sectionAiActions(selectedSection.id, targetRole);
  const finalReviewReady = requiredGuidedOrder.every((sectionId) => {
    const section = sections.find((item) => item.id === sectionId);
    return section ? getSectionStatus(section) !== "Missing" : false;
  });
  const sectionRewriteReady = Boolean(canRewrite && currentSectionText.trim());
  const rewriteDisabledReason = !canRewrite
    ? "AI rewrite is unavailable right now."
    : !currentSectionText.trim()
      ? `Add some ${selectedSection.title.toLowerCase()} content to unlock AI suggestions.`
      : "";
  const nextSectionLabel = sections.find((section) => section.id === nextSectionId)?.title || "Final review";
  const experienceRoles = selectedSection.id === "experience" ? parseExperienceRoles(selectedSection.content) : [];
  const [activeRoleIndex, setActiveRoleIndex] = useState(0);
  const [isEditorActive, setIsEditorActive] = useState(false);
  useEffect(() => {
    setActiveRoleIndex(0);
  }, [selectedSection.id]);
  useEffect(() => {
    setIsEditorActive(false);
  }, [selectedSection.id]);
  const activeRole = experienceRoles[activeRoleIndex] || null;
  const strongestBullet = activeRole?.bullets.reduce((best, bullet) => (bullet.length > best.length ? bullet : best), activeRole?.bullets[0] || "");
  const weakestBullet = activeRole?.bullets.reduce((worst, bullet) => {
    const worstScore = worst ? worst.length : Number.MAX_SAFE_INTEGER;
    return bullet.length < worstScore ? bullet : worst;
  }, activeRole?.bullets[0] || "");
  const visibleTrustEntries = rewriteMatchesSection && rewrite?.trustEntries?.length
    ? rewrite.trustEntries
    : rewrittenSectionText && rewrittenSectionText !== currentSectionText
      ? [{
          original: currentSectionText || "Source content is limited for this section.",
          rewrite: rewrittenSectionText,
          whatChanged: "The wording was tightened to foreground ownership, execution, and outcomes without changing the overall claim.",
          whyStronger: "The revised version is easier to scan and makes the accomplishment clearer to a hiring manager.",
          evidenceLevel: "structured" as const,
          confidenceNote: ""
        }]
      : [];

  if (!analysis) {
    return (
      <div className="grid gap-8 xl:grid-cols-[180px_minmax(0,1fr)] xl:items-start">
        <ProgressStepper sections={sections} hasDraft={false} activeSection={activeSection} />
        <PreDraftSetup
          targetRole={targetRole}
          linkedinUrl={linkedinUrl}
          linkedinText={linkedinText}
          resumeFileName={resumeFileName}
          onTargetRoleChange={onTargetRoleChange}
          onLinkedinUrlChange={onLinkedinUrlChange}
          onLinkedinTextChange={onLinkedinTextChange}
          onResumeUpload={onResumeUpload}
          onAnalyze={onAnalyze}
          isAnalyzing={isAnalyzing}
        />
      </div>
    );
  }

  return (
    <div className={cn("grid gap-6", rewrite ? "xl:grid-cols-[200px_minmax(0,1fr)_320px]" : "xl:grid-cols-[200px_minmax(0,1fr)]")}>
      <ProgressStepper sections={sections} hasDraft={true} activeSection={activeSection} onSectionSelect={onSectionSelect} />

      <div className="space-y-5">
        <>
            <Panel className="p-6">
              <SectionEyebrow>Section editor</SectionEyebrow>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-neutral-500">
                    Step {selectedSectionIndex + 1} of {guidedSections.length}
                  </p>
                  <h2 data-step-heading="true" tabIndex={-1} className="text-3xl font-semibold tracking-[-0.04em] text-neutral-950">
                    {selectedSection.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-neutral-600">
                    {selectedSection.prompt}
                  </p>
                  <p className="mt-2 text-sm font-medium text-neutral-700">Focus on this section now. Next up: {nextSectionLabel}.</p>
                </div>
                <div className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-500">
                  {selectedSectionLineCount} line{selectedSectionLineCount === 1 ? "" : "s"}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm font-semibold text-neutral-900">Why this matters</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">{sectionToneTips(selectedSection.id)}</p>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm font-semibold text-neutral-900">Why this needs work</p>
                  <div className="mt-2 space-y-2">
                    {(currentIssues.length ? currentIssues : [{ title: "This section is in solid shape", detail: "Keep it concise and move on once it reads cleanly for the target role." }]).map((item) => (
                      <div key={item.title}>
                        <p className="text-sm font-medium text-neutral-900">{item.title}</p>
                        <p className="text-sm leading-6 text-neutral-600">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className="relative mt-6 rounded-2xl border border-neutral-200 bg-white p-4"
                onMouseEnter={() => setIsEditorActive(true)}
                onMouseLeave={() => setIsEditorActive(false)}
                onFocusCapture={() => setIsEditorActive(true)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsEditorActive(false);
                  }
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Current version</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm leading-6 text-neutral-600">
                    Edit this section directly, then use AI only if you want help tightening the wording.
                  </p>
                  <span className="hidden rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 lg:inline-flex">
                    AI unlocks per section
                  </span>
                </div>
                <textarea
                  data-testid="section-editor"
                  value={selectedSection.content}
                  onChange={(event) => onSectionChange(selectedSection.id, event.target.value)}
                  onFocus={() => setIsEditorActive(true)}
                  onClick={() => setIsEditorActive(true)}
                  placeholder={selectedSection.placeholder}
                  className="mt-3 min-h-[240px] w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-900 outline-none transition focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5"
                />
                <p className="mt-3 text-xs text-neutral-500">Changes are saved in this browser session while you work.</p>

                <div
                  className={cn(
                    "overflow-hidden transition-all duration-200",
                    isEditorActive ? "mt-4 max-h-[420px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                  )}
                >
                  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">AI tips</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">
                      {sectionRewriteReady
                        ? `Use AI for ${selectedSection.title.toLowerCase()} only after the content says what you mean. Any generated text stays in preview until you apply it.`
                        : rewriteDisabledReason}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sectionActions.slice(0, 2).map((action, index) => (
                        <button
                          key={action.id}
                          data-testid={`inline-ai-action-${index}`}
                          onClick={() => onRunSectionAction(action)}
                          disabled={!sectionRewriteReady || isRewriting}
                          className={cn(
                            "rounded-full border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed",
                            index === 0
                              ? "border-neutral-950 bg-neutral-950 text-white hover:bg-neutral-800 disabled:bg-neutral-300"
                              : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 disabled:text-neutral-400"
                          )}
                        >
                          {isRewriting && action.kind === "ai" && index === 0 ? "Preparing preview..." : action.label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 rounded-2xl bg-white px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">
                        Example
                      </p>
                      <p className="mt-2 text-sm leading-6 text-neutral-700">{sectionExample(selectedSection.id)}</p>
                      <p className="mt-2 text-xs leading-5 text-neutral-500">
                        This is an example only. It has not changed your resume.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {selectedSection.id === "experience" && activeRole && (
                <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{experienceRoles.length > 1 ? `Experience entry ${activeRoleIndex + 1}` : "Current role"}</p>
                      <p className="mt-1 text-sm leading-6 text-neutral-600">{activeRole.title}</p>
                    </div>
                    {experienceRoles.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {experienceRoles.map((role, index) => (
                          <button
                            key={`${role.title}-${index}`}
                            onClick={() => setActiveRoleIndex(index)}
                            className={cn(
                              "rounded-full border px-3 py-2 text-xs font-medium transition",
                              index === activeRoleIndex
                                ? "border-neutral-950 bg-neutral-950 text-white"
                                : "border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
                            )}
                          >
                            {role.title || `Role ${index + 1}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Strongest bullet</p>
                      <p className="mt-2 text-sm leading-6 text-neutral-700">{strongestBullet || "Add bullets with ownership and measurable outcomes."}</p>
                    </div>
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Weakest bullet</p>
                      <p className="mt-2 text-sm leading-6 text-neutral-700">{weakestBullet || "No bullets yet for this role."}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    if (nextSectionId) {
                      onSectionSelect(nextSectionId);
                      return;
                    }
                    if (finalReviewReady) {
                      onContinue();
                    }
                  }}
                  className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
                >
                  {nextSectionId ? "Save and continue" : "Continue to final review"}
                </button>
                {!finalReviewReady && !nextSectionId && (
                  <p className="self-center text-sm text-amber-700">Finish the required sections before final review unlocks.</p>
                )}
              </div>
            </Panel>
        </>
      </div>

      {rewriteMatchesSection && rewrite && (
        <div className="space-y-5">
          <Panel className="p-6">
            <SectionEyebrow>Suggestion preview</SectionEyebrow>
            <p className="mt-4 text-sm leading-6 text-neutral-600">
              This preview affects {selectedSection.title.toLowerCase()} only. It has not changed your editable content yet.
            </p>
            {visibleTrustEntries.length > 0 && (
              <div className="mt-4 space-y-3">
                {visibleTrustEntries.map((entry, index) => (
                  <div key={`${entry.original}-${index}`} className="rounded-2xl border border-neutral-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Rewrite trust check</p>
                      <EvidenceBadge level={entry.evidenceLevel} />
                    </div>
                    <div className="mt-4 grid gap-4">
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Original</p>
                        <p className="mt-2 text-sm leading-6 text-neutral-700">{entry.original}</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Suggested text</p>
                        <p className="mt-2 text-sm leading-6 text-emerald-950">{entry.rewrite}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">What changed</p>
                        <p className="mt-2 text-sm leading-6 text-neutral-700">{entry.whatChanged}</p>
                      </div>
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Why this is stronger</p>
                        <p className="mt-2 text-sm leading-6 text-neutral-700">{entry.whyStronger}</p>
                      </div>
                    </div>
                    {entry.evidenceLevel === "inferred" && entry.confidenceNote && (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Confidence note</p>
                        <p className="mt-2 text-sm leading-6 text-amber-900">{entry.confidenceNote}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {rewrittenSectionText && rewrittenSectionText !== currentSectionText && (
              <div className="mt-4 grid gap-4">
                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Before</p>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                    {currentSectionText || "Nothing written yet for this section."}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Preview</p>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950">
                    {rewrittenSectionText}
                  </div>
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => onApplyRewriteSection(selectedSection.id, rewrittenSectionText)}
                disabled={!rewrittenSectionText || rewrittenSectionText === currentSectionText}
                className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                Apply to this section
              </button>
              <button
                onClick={onDiscardRewrite}
                className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
              >
                Keep current version
              </button>
            </div>
          </Panel>
          {canRewrite && analysis && (
            <Panel className="h-fit p-6 xl:sticky xl:top-8">
              <SectionEyebrow>AI wording preference</SectionEyebrow>
              <p className="mt-4 text-sm leading-6 text-neutral-600">
                Pick the tone you want before you apply AI changes to this section.
              </p>
              <div className="mt-4 flex rounded-xl border border-neutral-200 bg-neutral-50 p-1">
                {([
                  ["concise", "Concise"],
                  ["balanced", "Balanced"],
                  ["achievement", "Achievement"]
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => onRewriteStyleChange(value)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs font-medium transition",
                      rewriteStyle === value ? "bg-neutral-950 text-white" : "text-neutral-500 hover:text-neutral-800"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function ExportStep({
  onDownload,
  onBack,
  hasDraft,
  resumeText,
  analysis,
  sections
}: {
  onDownload: (format: "pdf" | "docx") => void;
  onBack: () => void;
  hasDraft: boolean;
  resumeText: string;
  analysis: AnalysisResult | null;
  sections: ResumeSection[];
}) {
  const previewSections = deriveSections("", resumeText);
  const readiness = buildFinalReviewChecks(sections);
  const canExport = hasDraft && readiness.every((item) => item.status !== "needs-attention");
  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Panel className="p-8 sm:p-10">
        <SectionEyebrow>Final review</SectionEyebrow>
        <h2 data-step-heading="true" tabIndex={-1} className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-neutral-950">
          Final resume preview
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">
          Review the assembled draft now that the sections are complete. This is the first place the full resume preview appears.
        </p>
        <ResumePreview sections={previewSections} missingKeywords={analysis?.extracted?.missingKeywords || []} />
      </Panel>
      <div className="space-y-5">
        <Panel className="p-6">
          <SectionEyebrow>Export readiness</SectionEyebrow>
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-900">Formatting review</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Keep the final file single-column, use a text-based PDF or DOCX, and avoid tables, graphics, headers, footers, and text boxes.
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-900">Filename guidance</p>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Name the file like a human: `FirstName_LastName_RoleTitle.pdf` or `.docx`.
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-900">ATS safety</p>
              <div className="mt-2 space-y-2">
                {(analysis?.atsSafety || []).map((item) => (
                  <div key={item.title} className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-6 text-neutral-600">{item.title}</p>
                    <AtsSafetyBadge status={item.status} />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-900">Resume structure</p>
              <div className="mt-2 space-y-3">
                {readiness.map((item) => (
                  <div key={item.title} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{item.title}</p>
                      <p className="text-sm leading-6 text-neutral-600">{item.detail}</p>
                    </div>
                    <AtsSafetyBadge status={item.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => onDownload("docx")}
              disabled={!canExport}
              className="rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              Download DOCX
            </button>
            <button
              onClick={() => onDownload("pdf")}
              disabled={!canExport}
              className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
            >
              Download PDF
            </button>
            <button
              onClick={onBack}
              className="rounded-full border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              Back to sections
            </button>
          </div>
          {!canExport && (
            <p className="mt-4 text-sm text-amber-700">Resolve the final review issues before exporting.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function ResumeRefreshPrototype() {
  const persisted = useMemo(() => readPersistedState(), []);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<Stage>(persisted.stage);
  const [sourceMethod, setSourceMethod] = useState<SourceMethod>(persisted.sourceMethod);
  const [targetRole, setTargetRole] = useState(persisted.targetRole);
  const [linkedinUrl, setLinkedinUrl] = useState(persisted.linkedinUrl);
  const [linkedinText, setLinkedinText] = useState(persisted.linkedinText);
  const [rewriteStyle, setRewriteStyle] = useState<RewriteStyle>(persisted.rewriteStyle);
  const [activeSection, setActiveSection] = useState<SectionId>(persisted.activeSection);
  const [reviewSection, setReviewSection] = useState<SectionId>(persisted.reviewSection);
  const [sections, setSections] = useState<ResumeSection[]>(persisted.sections);
  const [sampleMode, setSampleMode] = useState(Boolean(persisted.sampleMode));
  const [linkedinHeadlineInput, setLinkedinHeadlineInput] = useState("");
  const [linkedinExperienceInput, setLinkedinExperienceInput] = useState("");
  const [linkedinSkillsInput, setLinkedinSkillsInput] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeFileName, setResumeFileName] = useState("");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [rewrite, setRewrite] = useState<RewriteResult | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const transitionKey = stage === "builder"
    ? `${stage}:${analysis ? activeSection : "setup"}`
    : stage === "review"
      ? `${stage}:${reviewSection}`
      : stage;

  useEffect(() => {
    if (sampleMode || ["landing", "source", "permissions"].includes(stage)) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }

    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        stage,
        sourceMethod,
        sampleMode,
        targetRole,
        linkedinUrl,
        linkedinText,
        rewriteStyle,
        activeSection,
        reviewSection,
        sections
      } satisfies PersistedState)
    );
  }, [stage, sourceMethod, sampleMode, targetRole, linkedinUrl, linkedinText, rewriteStyle, activeSection, reviewSection, sections]);

  useEffect(() => {
    fetchJson<AppConfig>("/api/config")
      .then((nextConfig) => {
        setConfig(nextConfig);
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
    setSections(deriveSections(linkedinText, "", linkedinUrl));
  }, [sourceMethod, linkedinText, linkedinUrl, sections]);

  useLayoutEffect(() => {
    const shell = appShellRef.current;
    shell?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const focusHeading = () => {
      const heading = document.querySelector<HTMLElement>("[data-step-heading='true']");
      heading?.focus({ preventScroll: true });
    };

    if (typeof window !== "undefined" && "requestAnimationFrame" in window) {
      window.requestAnimationFrame(focusHeading);
    } else {
      focusHeading();
    }
  }, [transitionKey]);

  function updateSection(id: SectionId, content: string) {
    setRewrite(null);
    setSections((current) =>
      current.map((section) => (section.id === id ? { ...section, content } : section))
    );
  }

  async function runAnalyze() {
    setError("");
    setStatus("Creating your first draft...");
    setIsAnalyzing(true);
    setRewrite(null);

    try {
      const serializedResume = serializeSections(sections);
      const payload: Record<string, string> = {
        targetRole,
        linkedinUrl,
        linkedinText,
        resumeText: serializedResume
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
        setSections(deriveSections(linkedinText, draftedText, linkedinUrl));
      }
      setSampleMode(false);
      setActiveSection("header");
      setStatus("We analyzed your resume. Start with your header, then continue section by section.");
      startTransition(() => setStage("builder"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Analyze failed");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function runSectionAction(action: SectionAction) {
    if (action.kind === "local") {
      const currentSection = sections.find((section) => section.id === activeSection);
      if (!currentSection) {
        return;
      }

      let nextContent = currentSection.content;
      if (action.id === "trim_skills") {
        nextContent = trimWeakSkillsContent(currentSection.content, targetRole);
      } else if (action.id === "align_skills_to_role") {
        nextContent = alignSkillsToRoleContent(currentSection.content, targetRole);
      }

      if (!normalizeText(nextContent) || normalizeText(nextContent) === normalizeText(currentSection.content)) {
        setStatus(`${action.label} did not need to change this section.`);
        return;
      }

      updateSection(activeSection, nextContent);
      setStatus(`${action.label} applied to ${currentSection.title.toLowerCase()}.`);
      return;
    }

    setError("");
    setStatus(`Preparing a suggestion preview for ${sections.find((section) => section.id === activeSection)?.title.toLowerCase() || "this section"}...`);
    setIsRewriting(true);

    try {
      const serializedResume = serializeSections(sections);
      const payload: Record<string, string> = {
        targetRole,
        linkedinUrl,
        linkedinText,
        resumeText: serializedResume,
        style: rewriteStyle,
        sectionId: activeSection,
        actionId: action.id
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
      setRewrite({
        ...result,
        sectionId: activeSection,
        actionId: action.id
      });
      setStatus("Suggestion preview ready for this section.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Rewrite failed");
    } finally {
      setIsRewriting(false);
    }
  }

  function applyRewriteToSection(id: SectionId, rewrittenContent: string) {
    if (!rewrite?.rewrittenResume || !rewrittenContent.trim()) {
      return;
    }
    setSections((current) =>
      current.map((section) => (section.id === id ? { ...section, content: rewrittenContent } : section))
    );
    setRewrite(null);
    setStatus("Suggestion applied to this section.");
  }

  async function handleDownload(format: "pdf" | "docx") {
    setError("");
    setStatus(`Preparing ${format.toUpperCase()}...`);
    try {
      const finalText = serializeSections(sections);
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
    setSampleMode(false);
    setLinkedinUrl("");
    setLinkedinText("");
    setLinkedinHeadlineInput("");
    setLinkedinExperienceInput("");
    setLinkedinSkillsInput("");
    setSections(buildDefaultSections());
    setReviewSection("header");
    setAnalysis(null);
    setRewrite(null);
    setError("");
    setStage("permissions");
  }

  function beginManual() {
    setSourceMethod("manual");
    setSampleMode(false);
    setTargetRole("");
    setLinkedinText("");
    setLinkedinUrl("");
    setRewriteStyle("balanced");
    setSections(buildDefaultSections());
    setActiveSection("summary");
    setReviewSection("header");
    setResumeFile(null);
    setResumeFileName("");
    setAnalysis(null);
    setRewrite(null);
    setStatus("Blank builder ready. Start with the target role, then create your first draft.");
    setError("");
    setStage("builder");
  }

  function viewSample() {
    setSourceMethod("manual");
    setSampleMode(true);
    setTargetRole(sampleResumeSeed.targetRole);
    setLinkedinText(sampleResumeSeed.linkedinText);
    setLinkedinUrl("");
    setRewriteStyle("balanced");
    setSections(sampleResumeSeed.sections);
    setActiveSection("summary");
    setReviewSection("header");
    setAnalysis(null);
    setRewrite(null);
    setResumeFile(null);
    setResumeFileName("");
    setStage("builder");
    setStatus("Sample resume loaded. Create your first draft to see what to improve first.");
  }

  function continueImport() {
    const combinedLinkedInText = [
      linkedinHeadlineInput ? `ABOUT\n${linkedinHeadlineInput}` : "",
      linkedinExperienceInput ? `EXPERIENCE\n${linkedinExperienceInput}` : "",
      linkedinSkillsInput ? `SKILLS\n${linkedinSkillsInput}` : ""
    ].filter(Boolean).join("\n\n").trim();

    setLinkedinText(combinedLinkedInText);
    setSampleMode(false);
    setSections(deriveSections(combinedLinkedInText, "", linkedinUrl));
    setReviewSection("header");
    setStatus("LinkedIn text imported. Review each section before creating your first draft.");
    setStage("review");
  }

  const currentDraft = serializeSections(sections);

  return (
    <div ref={appShellRef} className="min-h-screen overflow-x-hidden bg-[#f5f4ef] px-4 py-6 text-neutral-950 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        {stage === "landing" ? (
          <Landing
            onStart={() => setStage("source")}
            onViewSample={viewSample}
          />
        ) : (
          <>
            <WorkflowHeader stage={stage} onBackToLanding={() => setStage("landing")} />

            {(status || error) && (
              <div
                className={cn(
                  "mb-5 rounded-2xl border px-4 py-3 text-sm",
                  error ? "border-amber-200 bg-amber-50 text-amber-800" : "border-neutral-200 bg-white text-neutral-700"
                )}
              >
                {error || status}
              </div>
            )}

            {stage === "source" && <SourceChoice onImport={beginImport} onManual={beginManual} />}

            {stage === "permissions" && (
              <LinkedInPasteImport
                onContinue={continueImport}
                onManual={beginManual}
                linkedinUrl={linkedinUrl}
                linkedinHeadline={linkedinHeadlineInput}
                linkedinExperience={linkedinExperienceInput}
                linkedinSkills={linkedinSkillsInput}
                onLinkedinUrlChange={setLinkedinUrl}
                onLinkedinHeadlineChange={setLinkedinHeadlineInput}
                onLinkedinExperienceChange={setLinkedinExperienceInput}
                onLinkedinSkillsChange={setLinkedinSkillsInput}
              />
            )}

            {stage === "review" && (
              <ImportReview
                sections={sections}
                activeSection={reviewSection}
                onSectionChange={updateSection}
                onSectionSelect={setReviewSection}
                onContinue={() => {
                  setStatus("Import review complete. Add your target role, then create your first draft.");
                  setStage("builder");
                }}
                linkedinText={linkedinText}
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
                onRunSectionAction={runSectionAction}
                onApplyRewriteSection={applyRewriteToSection}
                onDiscardRewrite={() => {
                  setRewrite(null);
                  setStatus("Kept the current section text.");
                }}
                analysis={analysis}
                rewrite={rewrite}
                isAnalyzing={isAnalyzing}
                isRewriting={isRewriting}
                canRewrite={Boolean(config?.openAiRewriteEnabled)}
                onContinue={() => setStage("export")}
              />
            )}

            {stage === "export" && (
              <ExportStep
                onDownload={handleDownload}
                onBack={() => setStage("builder")}
                hasDraft={Boolean(currentDraft.trim())}
                resumeText={currentDraft}
                analysis={analysis}
                sections={sections}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
