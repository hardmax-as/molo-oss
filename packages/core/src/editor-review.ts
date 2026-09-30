import type { GlossSuggestion } from "./gloss-suggestion.ts";

/** Editor-only wire contracts, shared by web and mobile. Never learner content. */
export interface EditorReviewItem {
  entityKind: string;
  entityId: string;
  /** Parent lexeme for lexeme/gloss rows; null for other queue kinds. */
  lexemeId: string | null;
  label: string;
  status: string;
  createdBy: string | null;
  updatedAt: string;
  assignedTo: string | null;
  assignedToName: string | null;
  assignedAt: string | null;
  assignedBy: string | null;
  assignedByName: string | null;
  priority: number;
  notes: string | null;
  /** Set for a bare-click recording (audio_asset): the click letter it was made for. */
  clickLetter?: string | null;
  /** Who created the row, by name. Older servers omit it. */
  createdByName?: string | null;
  /** For a recording: what it is of, who spoke it, and a signed link to play it. */
  audio?: {
    targetKind: string;
    targetId: string;
    targetText: string | null;
    tier: string;
    speakerName: string | null;
    url: string;
  } | null;
  /** For an exercise: its type, and a culture card's English title. */
  exercise?: { type: string; title: string | null } | null;
}

export interface EditorRevision {
  id: string;
  diff: unknown;
  actorId: string | null;
  note: string | null;
  createdAt: string;
}

export interface EditorLexemeDetail {
  glossSuggestions: GlossSuggestion[];
  lexeme: {
    id: string;
    lemma: string;
    stem: string | null;
    pos: string;
    nounClass: string | null;
    isPlural: boolean;
    infinitive: string | null;
    tonePattern: string | null;
    register: string;
    cefrBand: string | null;
    frequencyRank: number | null;
    attribution: string[];
    status: string;
    source: string;
    sourceRef: string | null;
    licence: string;
    createdBy: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    updatedAt: string;
  };
  glosses: {
    id: string;
    sourceLang: string;
    gloss: string;
    usageNote: string | null;
    contrastiveNote: string | null;
    status: string;
    origin: "human" | "llm" | "unknown";
    revisions: EditorRevision[];
  }[];
  links: { kind: string; sourceKind: string | null; toId: string; toLemma: string }[];
  audio: {
    id: string;
    tier: string;
    status: string;
    durationMs: number;
    url: string;
    speakerId: string | null;
    createdAt: string;
  }[];
  revisions: {
    id: string;
    diff: unknown;
    actorId: string | null;
    note: string | null;
    createdAt: string;
  }[];
}
