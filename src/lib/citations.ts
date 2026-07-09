// Shared shapes for grounded AI answers (library Q&A and workout/test
// analysis). Client-safe: no db or SDK imports — client components and the
// schema's jsonb typing both import from here.

export type LibraryCitation = {
  paperId: string;
  paperTitle: string;
  startPage: number;
  endPage: number;
  citedText: string;
};

export type AnswerBlock = { text: string; citations: LibraryCitation[] };

export type LibraryAnswer = {
  blocks: AnswerBlock[];
  // Snapshot of the papers consulted (not just cited), so a stored analysis
  // still renders after a paper is removed from the library.
  papers: {
    id: string;
    title: string;
    authors: string | null;
    year: number | null;
  }[];
};

// One stored analysis, serialized for client components (dates preformatted).
export type AnalysisView = {
  id: string;
  model: string;
  createdAt: string;
  content: LibraryAnswer;
};
