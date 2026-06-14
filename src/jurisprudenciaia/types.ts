export type JurisprudenciaIaQuery = {
  query: string;
  maxWaitSeconds?: number;
  includeDebug?: boolean;
};

export type JurisprudenciaIaSearchResult = {
  markdown: string;
  rawText?: string;
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
