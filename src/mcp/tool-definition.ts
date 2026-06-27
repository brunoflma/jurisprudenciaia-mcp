import { z } from "zod";
import type { JurisprudenciaIaQuery } from "../jurisprudenciaia/types.js";

const QUERY_DESCRIPTION = "Consulta juridica a ser pesquisada no JurisprudenciaIA.";
const MAX_WAIT_DESCRIPTION = "Tempo maximo de espera pelo resultado, limitado a 120 segundos.";
const INCLUDE_DEBUG_DESCRIPTION = "Inclui texto bruto extraido da fonte quando verdadeiro.";
const STRUCTURED_RESULT_INSTRUCTION =
  "Estruture a resposta com tese principal, precedentes citados por referencia, tribunal, tipo/numero, data de julgamento, ementa, inteiro teor ou transcricao integral disponibilizada pela fonte, link quando disponivel e pontos de cautela. Nao substitua o inteiro teor por resumo, recorte ou excerto; quando a fonte nao disponibilizar inteiro teor, informe isso explicitamente.";
const DIRECT_ANSWER_INSTRUCTION = "Responda diretamente, sem pedir esclarecimentos.";
const BROAD_THEME_INSTRUCTION =
  "Se o tema for amplo, escolha o recorte jurídico mais provável e indique essa escolha nos pontos de cautela.";

type ZodToolInputSchema = Record<string, z.ZodType>;

type JsonToolInputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

export const TOOL_OUTPUT_SCHEMA = {
  markdown: z.string().describe("Resultado consolidado da consulta em Markdown.")
};

export const JSON_TOOL_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    markdown: { type: "string" }
  },
  required: ["markdown"],
  additionalProperties: false
} as const;

export const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const;

export type JurisprudenciaIaToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodToolInputSchema;
  jsonInputSchema: JsonToolInputSchema;
  normalizeInput(input: unknown): Required<JurisprudenciaIaQuery>;
};

const MAX_TEXT_LENGTH = 2000;

const genericInputSchema = z.object({
  query: z.string(),
  max_wait_seconds: z.number().int().positive().optional(),
  include_debug: z.boolean().optional()
});

const searchInputSchema = z.object({
  query: z.string(),
  max_wait_seconds: z.number().int().positive().optional()
});

const precedentsInputSchema = z.object({
  tema: z.string(),
  tribunais: z.array(z.string()).optional(),
  max_wait_seconds: z.number().int().positive().optional()
});

const thesisInputSchema = z.object({
  tese: z.string(),
  contexto: z.string().optional(),
  max_wait_seconds: z.number().int().positive().optional()
});

const compareInputSchema = z.object({
  questao: z.string(),
  tese_a: z.string(),
  tese_b: z.string(),
  max_wait_seconds: z.number().int().positive().optional()
});

const genericZodToolInputSchema = {
  query: z.string().describe(QUERY_DESCRIPTION),
  max_wait_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(MAX_WAIT_DESCRIPTION),
  include_debug: z.boolean().optional().describe(INCLUDE_DEBUG_DESCRIPTION)
};

const searchZodToolInputSchema = {
  query: z.string().describe(QUERY_DESCRIPTION),
  max_wait_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(MAX_WAIT_DESCRIPTION)
};

const genericJsonToolInputSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: QUERY_DESCRIPTION
    },
    max_wait_seconds: {
      type: "integer",
      minimum: 1,
      maximum: 120,
      description: MAX_WAIT_DESCRIPTION
    },
    include_debug: {
      type: "boolean",
      description: INCLUDE_DEBUG_DESCRIPTION
    }
  },
  required: ["query"],
  additionalProperties: false
} as const satisfies JsonToolInputSchema;

const searchJsonToolInputSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: QUERY_DESCRIPTION
    },
    max_wait_seconds: {
      type: "integer",
      minimum: 1,
      maximum: 120,
      description: MAX_WAIT_DESCRIPTION
    }
  },
  required: ["query"],
  additionalProperties: false
} as const satisfies JsonToolInputSchema;

const precedentsZodToolInputSchema = {
  tema: z.string().describe("Tema juridico para localizar precedentes."),
  tribunais: z
    .array(z.string())
    .optional()
    .describe("Tribunais preferenciais, por exemplo STJ, STF, TJSP ou TJRJ."),
  max_wait_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(MAX_WAIT_DESCRIPTION)
};

const precedentsJsonToolInputSchema = {
  type: "object",
  properties: {
    tema: {
      type: "string",
      description: "Tema juridico para localizar precedentes."
    },
    tribunais: {
      type: "array",
      items: { type: "string" },
      description: "Tribunais preferenciais, por exemplo STJ, STF, TJSP ou TJRJ."
    },
    max_wait_seconds: {
      type: "integer",
      minimum: 1,
      maximum: 120,
      description: MAX_WAIT_DESCRIPTION
    }
  },
  required: ["tema"],
  additionalProperties: false
} as const satisfies JsonToolInputSchema;

const thesisZodToolInputSchema = {
  tese: z.string().describe("Tese juridica que deve ser confrontada com a jurisprudencia."),
  contexto: z.string().optional().describe("Contexto resumido do caso concreto."),
  max_wait_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(MAX_WAIT_DESCRIPTION)
};

const thesisJsonToolInputSchema = {
  type: "object",
  properties: {
    tese: {
      type: "string",
      description: "Tese juridica que deve ser confrontada com a jurisprudencia."
    },
    contexto: {
      type: "string",
      description: "Contexto resumido do caso concreto."
    },
    max_wait_seconds: {
      type: "integer",
      minimum: 1,
      maximum: 120,
      description: MAX_WAIT_DESCRIPTION
    }
  },
  required: ["tese"],
  additionalProperties: false
} as const satisfies JsonToolInputSchema;

const compareZodToolInputSchema = {
  questao: z.string().describe("Questao juridica central a ser comparada."),
  tese_a: z.string().describe("Primeira tese juridica."),
  tese_b: z.string().describe("Segunda tese juridica."),
  max_wait_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(MAX_WAIT_DESCRIPTION)
};

const compareJsonToolInputSchema = {
  type: "object",
  properties: {
    questao: {
      type: "string",
      description: "Questao juridica central a ser comparada."
    },
    tese_a: {
      type: "string",
      description: "Primeira tese juridica."
    },
    tese_b: {
      type: "string",
      description: "Segunda tese juridica."
    },
    max_wait_seconds: {
      type: "integer",
      minimum: 1,
      maximum: 120,
      description: MAX_WAIT_DESCRIPTION
    }
  },
  required: ["questao", "tese_a", "tese_b"],
  additionalProperties: false
} as const satisfies JsonToolInputSchema;

export const TOOL_DEFINITIONS: JurisprudenciaIaToolDefinition[] = [
  {
    name: "consultar_jurisprudenciaia",
    title: "Consultar JurisprudenciaIA",
    description:
      "Consulta livre no JurisprudenciaIA e retorna Markdown com resposta, tese principal, precedentes e pontos de cautela.",
    inputSchema: genericZodToolInputSchema,
    jsonInputSchema: genericJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = genericInputSchema.parse(input);
      const query = normalizeQuery(parsed.query);

      return {
        query: buildDirectSearchQuery(query),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: parsed.include_debug ?? false
      };
    }
  },
  {
    name: "pesquisar_jurisprudencia",
    title: "Pesquisar jurisprudencia",
    description:
      "Pesquisa jurisprudencia por consulta direta e retorna uma resposta consolidada com precedentes estruturados.",
    inputSchema: searchZodToolInputSchema,
    jsonInputSchema: searchJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = searchInputSchema.parse(input);
      const query = normalizeQuery(parsed.query);

      return {
        query: buildDirectSearchQuery(query),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: false
      };
    }
  },
  {
    name: "buscar_precedentes",
    title: "Buscar precedentes",
    description:
      "Localiza precedentes sobre um tema juridico e destaca metadados essenciais para conferencia da fonte.",
    inputSchema: precedentsZodToolInputSchema,
    jsonInputSchema: precedentsJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = precedentsInputSchema.parse(input);
      const tema = normalizeQuery(parsed.tema);
      const tribunais = normalizeTribunais(parsed.tribunais);

      return {
        query: joinParts([
          `Busque precedentes jurisprudenciais sobre: ${tema}.`,
          "Priorize decisoes diretamente relacionadas ao tema.",
          DIRECT_ANSWER_INSTRUCTION,
          STRUCTURED_RESULT_INSTRUCTION,
          tribunais.length > 0 ? `Tribunais de interesse: ${tribunais.join(", ")}.` : undefined
        ]),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: false
      };
    }
  },
  {
    name: "analisar_tese_juridica",
    title: "Analisar tese juridica",
    description:
      "Analisa uma tese juridica contra a jurisprudencia e separa apoio, oposicao, lacunas e cautelas.",
    inputSchema: thesisZodToolInputSchema,
    jsonInputSchema: thesisJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = thesisInputSchema.parse(input);
      const tese = normalizeQuery(parsed.tese);
      const contexto = normalizeOptionalText(parsed.contexto);

      return {
        query: joinParts([
          `Analise a tese juridica a seguir com base na jurisprudencia: ${tese}.`,
          contexto ? `Contexto do caso: ${contexto}.` : undefined,
          "Separe precedentes favoraveis, contrarios, distincoes possiveis e ressalvas relevantes.",
          STRUCTURED_RESULT_INSTRUCTION
        ]),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: false
      };
    }
  },
  {
    name: "comparar_teses_juridicas",
    title: "Comparar teses juridicas",
    description:
      "Compara duas teses juridicas para a mesma questao e indica apoio jurisprudencial, divergencias e riscos.",
    inputSchema: compareZodToolInputSchema,
    jsonInputSchema: compareJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = compareInputSchema.parse(input);

      return {
        query: joinParts([
          `Compare as teses juridicas para a seguinte questao: ${normalizeQuery(parsed.questao)}.`,
          `Tese A: ${normalizeQuery(parsed.tese_a)}.`,
          `Tese B: ${normalizeQuery(parsed.tese_b)}.`,
          "Indique qual tese tem melhor apoio jurisprudencial, precedentes relevantes, divergencias e riscos de cada posicao.",
          STRUCTURED_RESULT_INSTRUCTION
        ]),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: false
      };
    }
  }
];

export const TOOL_NAME = TOOL_DEFINITIONS[0].name;
export const TOOL_TITLE = TOOL_DEFINITIONS[0].title;
export const TOOL_DESCRIPTION = TOOL_DEFINITIONS[0].description;
export const zodToolInputSchema = TOOL_DEFINITIONS[0].inputSchema;
export const jsonToolInputSchema = TOOL_DEFINITIONS[0].jsonInputSchema;

export function normalizeToolInput(input: unknown): Required<JurisprudenciaIaQuery> {
  return TOOL_DEFINITIONS[0].normalizeInput(input);
}

export function findToolDefinition(name: unknown): JurisprudenciaIaToolDefinition | undefined {
  return typeof name === "string"
    ? TOOL_DEFINITIONS.find((definition) => definition.name === name)
    : undefined;
}

function normalizeQuery(value: string): string {
  const query = value.trim().replace(/\s+/g, " ");

  if (query.length < 8) {
    throw new Error("A consulta deve ter pelo menos 8 caracteres");
  }

  if (query.length > MAX_TEXT_LENGTH) {
    throw new Error(`A consulta excede o limite maximo de ${MAX_TEXT_LENGTH} caracteres`);
  }

  return query;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, " ");

  if (normalized && normalized.length > MAX_TEXT_LENGTH) {
    throw new Error(`O contexto excede o limite maximo de ${MAX_TEXT_LENGTH} caracteres`);
  }

  return normalized || undefined;
}

function normalizeTribunais(value: string[] | undefined): string[] {
  const tribunais = (value ?? [])
    .map((item) => item.trim().replace(/\s+/g, " ").toUpperCase())
    .filter(Boolean);

  if (tribunais.join(", ").length > MAX_TEXT_LENGTH) {
    throw new Error(`Os tribunais excedem o limite maximo de ${MAX_TEXT_LENGTH} caracteres`);
  }

  return tribunais;
}

function normalizeMaxWait(value: number | undefined): number {
  return Math.min(value ?? 120, 120);
}

function buildDirectSearchQuery(query: string): string {
  return joinParts([
    `Pesquise jurisprudência sobre: ${query}.`,
    DIRECT_ANSWER_INSTRUCTION,
    BROAD_THEME_INSTRUCTION,
    STRUCTURED_RESULT_INSTRUCTION
  ]);
}

function joinParts(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => !!part).join(" ");
}
