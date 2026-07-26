export type JurisprudenciaIaQuery = {
  query: string;
  maxWaitSeconds?: number;
  includeDebug?: boolean;
};

export type JurisprudenciaIaSearchResult = {
  markdown: string;
  rawText?: string;
  structured?: JurisprudenciaIaStructuredResult;
};

export type JurisprudenciaIaStructuredPrecedent = {
  reference: string;
  court: string | null;
  case_number: string | null;
  judgment_date: string | null;
  syllabus: string | null;
  full_text: string | null;
  official_url: string | null;
  missing_metadata: string[];
};

export type JurisprudenciaIaStructuredResult = {
  schema_version: "amf.jurisprudenciaia.result.v1";
  request_id: string;
  status: "complete" | "partial" | "no_results" | "clarification_required";
  query: string;
  executed_at: string;
  source_url: string;
  answer: string;
  precedents: JurisprudenciaIaStructuredPrecedent[];
  cautions: string[];
};

export type JurisprudenciaIaNormalizeInput = {
  query: string;
  rawText: string;
  sourceUrl: string;
  executedAtIso: string;
};

export type JurisprudenciaIaRunner = {
  search(input: Required<JurisprudenciaIaQuery>): Promise<JurisprudenciaIaSearchResult>;
};
