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

const cnjInputSchema = z.object({
  numero_cnj: z.string(),
  max_wait_seconds: z.number().int().positive().optional()
});

const legislationInputSchema = z.object({
  norma: z.string(),
  contexto: z.string().optional(),
  max_wait_seconds: z.number().int().positive().optional()
});

const informativesInputSchema = z.object({
  tema: z.string(),
  tribunais: z.array(z.string()).optional(),
  max_wait_seconds: z.number().int().positive().optional()
});

const jurimetricsInputSchema = z.object({
  tema: z.string(),
  tribunal: z.string().optional(),
  recorte: z.string().optional(),
  max_wait_seconds: z.number().int().positive().optional()
});

const timelineInputSchema = z.object({
  tema: z.string(),
  max_wait_seconds: z.number().int().positive().optional()
});

const citationsByStatuteInputSchema = z.object({
  dispositivo: z.string(),
  max_wait_seconds: z.number().int().positive().optional()
});

const statuteHistoryInputSchema = z.object({
  norma: z.string(),
  max_wait_seconds: z.number().int().positive().optional()
});

const overrulingInputSchema = z.object({
  tema: z.string(),
  max_wait_seconds: z.number().int().positive().optional()
});

const qualifiedPrecedentsInputSchema = z.object({
  tema: z.string(),
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

const cnjZodToolInputSchema = {
  numero_cnj: z.string().describe("Numero unico do processo no padrao CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO)."),
  max_wait_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(MAX_WAIT_DESCRIPTION)
};

const cnjJsonToolInputSchema = {
  type: "object",
  properties: {
    numero_cnj: {
      type: "string",
      description: "Numero unico do processo no padrao CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO)."
    },
    max_wait_seconds: {
      type: "integer",
      minimum: 1,
      maximum: 120,
      description: MAX_WAIT_DESCRIPTION
    }
  },
  required: ["numero_cnj"],
  additionalProperties: false
} as const satisfies JsonToolInputSchema;

const legislationZodToolInputSchema = {
  norma: z.string().describe("Norma, artigo ou dispositivo legal a ser consultado, por exemplo 'CDC art. 6, V'."),
  contexto: z.string().optional().describe("Contexto do caso para orientar a interpretacao do dispositivo."),
  max_wait_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(MAX_WAIT_DESCRIPTION)
};

const legislationJsonToolInputSchema = {
  type: "object",
  properties: {
    norma: {
      type: "string",
      description: "Norma, artigo ou dispositivo legal a ser consultado, por exemplo 'CDC art. 6, V'."
    },
    contexto: {
      type: "string",
      description: "Contexto do caso para orientar a interpretacao do dispositivo."
    },
    max_wait_seconds: {
      type: "integer",
      minimum: 1,
      maximum: 120,
      description: MAX_WAIT_DESCRIPTION
    }
  },
  required: ["norma"],
  additionalProperties: false
} as const satisfies JsonToolInputSchema;

const informativesZodToolInputSchema = {
  tema: z.string().describe("Tema juridico para localizar informativos de tribunais superiores."),
  tribunais: z
    .array(z.string())
    .optional()
    .describe("Tribunais preferenciais para os informativos, por exemplo STF ou STJ."),
  max_wait_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(MAX_WAIT_DESCRIPTION)
};

const informativesJsonToolInputSchema = {
  type: "object",
  properties: {
    tema: {
      type: "string",
      description: "Tema juridico para localizar informativos de tribunais superiores."
    },
    tribunais: {
      type: "array",
      items: { type: "string" },
      description: "Tribunais preferenciais para os informativos, por exemplo STF ou STJ."
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

const jurimetricsZodToolInputSchema = {
  tema: z.string().describe("Tema ou classe processual para o levantamento jurimetrico."),
  tribunal: z.string().optional().describe("Tribunal de interesse para o levantamento, por exemplo TJSP ou STJ."),
  recorte: z
    .string()
    .optional()
    .describe("Recorte estatistico desejado, por exemplo resultado, relator, orgao julgador ou tempo de tramitacao."),
  max_wait_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(MAX_WAIT_DESCRIPTION)
};

const jurimetricsJsonToolInputSchema = {
  type: "object",
  properties: {
    tema: {
      type: "string",
      description: "Tema ou classe processual para o levantamento jurimetrico."
    },
    tribunal: {
      type: "string",
      description: "Tribunal de interesse para o levantamento, por exemplo TJSP ou STJ."
    },
    recorte: {
      type: "string",
      description:
        "Recorte estatistico desejado, por exemplo resultado, relator, orgao julgador ou tempo de tramitacao."
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

const timelineZodToolInputSchema = {
  tema: z.string().describe("Tema juridico para montar a linha do tempo de precedentes."),
  max_wait_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(MAX_WAIT_DESCRIPTION)
};

const timelineJsonToolInputSchema = {
  type: "object",
  properties: {
    tema: {
      type: "string",
      description: "Tema juridico para montar a linha do tempo de precedentes."
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

function singleTextZodToolInputSchema(field: string, description: string): ZodToolInputSchema {
  return {
    [field]: z.string().describe(description),
    max_wait_seconds: z.number().int().positive().optional().describe(MAX_WAIT_DESCRIPTION)
  };
}

function singleTextJsonToolInputSchema(
  field: string,
  description: string
): JsonToolInputSchema {
  return {
    type: "object",
    properties: {
      [field]: { type: "string", description },
      max_wait_seconds: {
        type: "integer",
        minimum: 1,
        maximum: 120,
        description: MAX_WAIT_DESCRIPTION
      }
    },
    required: [field],
    additionalProperties: false
  };
}

const citationsByStatuteZodToolInputSchema = singleTextZodToolInputSchema(
  "dispositivo",
  "Dispositivo legal cujas citacoes em precedentes devem ser pesquisadas."
);
const citationsByStatuteJsonToolInputSchema = singleTextJsonToolInputSchema(
  "dispositivo",
  "Dispositivo legal cujas citacoes em precedentes devem ser pesquisadas."
);
const statuteHistoryZodToolInputSchema = singleTextZodToolInputSchema(
  "norma",
  "Norma ou dispositivo cujo historico legislativo deve ser pesquisado."
);
const statuteHistoryJsonToolInputSchema = singleTextJsonToolInputSchema(
  "norma",
  "Norma ou dispositivo cujo historico legislativo deve ser pesquisado."
);
const overrulingZodToolInputSchema = singleTextZodToolInputSchema(
  "tema",
  "Tema juridico para pesquisar superacao ou revisao de entendimentos."
);
const overrulingJsonToolInputSchema = singleTextJsonToolInputSchema(
  "tema",
  "Tema juridico para pesquisar superacao ou revisao de entendimentos."
);
const qualifiedPrecedentsZodToolInputSchema = singleTextZodToolInputSchema(
  "tema",
  "Tema juridico para priorizar precedentes vinculantes ou qualificados."
);
const qualifiedPrecedentsJsonToolInputSchema = singleTextJsonToolInputSchema(
  "tema",
  "Tema juridico para priorizar precedentes vinculantes ou qualificados."
);

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
  },
  {
    name: "buscar_por_cnj",
    title: "Buscar por numero CNJ",
    description:
      "Localiza decisoes e andamentos relevantes de um processo a partir do numero unico CNJ.",
    inputSchema: cnjZodToolInputSchema,
    jsonInputSchema: cnjJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = cnjInputSchema.parse(input);
      const numeroCnj = normalizeQuery(parsed.numero_cnj);

      return {
        query: joinParts([
          `Localize decisoes, andamentos e publicacoes disponiveis para o processo de numero CNJ: ${numeroCnj}.`,
          "Se o numero informado nao for localizado, informe isso explicitamente e nao invente dados do processo.",
          DIRECT_ANSWER_INSTRUCTION,
          STRUCTURED_RESULT_INSTRUCTION
        ]),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: false
      };
    }
  },
  {
    name: "pesquisar_legislacao",
    title: "Pesquisar legislacao",
    description:
      "Pesquisa referencias a uma norma ou dispositivo e solicita texto, alteracoes e interpretacao jurisprudencial, conforme a cobertura da fonte.",
    inputSchema: legislationZodToolInputSchema,
    jsonInputSchema: legislationJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = legislationInputSchema.parse(input);
      const norma = normalizeQuery(parsed.norma);
      const contexto = normalizeOptionalText(parsed.contexto);

      return {
        query: joinParts([
          `Traga o texto vigente e a interpretacao jurisprudencial dominante do seguinte dispositivo legal: ${norma}.`,
          contexto ? `Contexto do caso: ${contexto}.` : undefined,
          "Informe alteracoes legislativas relevantes, se houver, e a fonte oficial do texto normativo.",
          DIRECT_ANSWER_INSTRUCTION,
          STRUCTURED_RESULT_INSTRUCTION
        ]),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: false
      };
    }
  },
  {
    name: "buscar_informativos",
    title: "Buscar informativos",
    description:
      "Localiza informativos de jurisprudencia de tribunais superiores sobre um tema juridico.",
    inputSchema: informativesZodToolInputSchema,
    jsonInputSchema: informativesJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = informativesInputSchema.parse(input);
      const tema = normalizeQuery(parsed.tema);
      const tribunais = normalizeTribunais(parsed.tribunais);

      return {
        query: joinParts([
          `Busque informativos de jurisprudencia sobre: ${tema}.`,
          "Identifique o numero do informativo, o tribunal, a data de publicacao e o acordao ou julgado de origem.",
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
    name: "analisar_jurimetria",
    title: "Analisar jurimetria",
    description:
      "Estima um panorama da amostra de julgados encontrada, sem representar estatistica oficial ou exaustiva do tribunal.",
    inputSchema: jurimetricsZodToolInputSchema,
    jsonInputSchema: jurimetricsJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = jurimetricsInputSchema.parse(input);
      const tema = normalizeQuery(parsed.tema);
      const tribunal = normalizeOptionalText(parsed.tribunal);
      const recorte = normalizeOptionalText(parsed.recorte);

      return {
        query: joinParts([
          `Levante um panorama jurimetrico sobre: ${tema}.`,
          "Estime volume de decisoes, resultado predominante, orgaos julgadores e relatores mais recorrentes com base nos julgados encontrados.",
          "Deixe claro que o levantamento e uma estimativa a partir da amostra de decisoes encontrada, nao um dado oficial de tribunal.",
          tribunal ? `Tribunal de interesse: ${tribunal}.` : undefined,
          recorte ? `Recorte estatistico solicitado: ${recorte}.` : undefined,
          DIRECT_ANSWER_INSTRUCTION,
          STRUCTURED_RESULT_INSTRUCTION
        ]),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: false
      };
    }
  },
  {
    name: "linha_do_tempo_precedentes",
    title: "Linha do tempo de precedentes",
    description:
      "Monta uma linha do tempo cronologica dos principais precedentes sobre um tema, apontando mudancas de entendimento.",
    inputSchema: timelineZodToolInputSchema,
    jsonInputSchema: timelineJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = timelineInputSchema.parse(input);
      const tema = normalizeQuery(parsed.tema);

      return {
        query: joinParts([
          `Monte uma linha do tempo cronologica dos principais precedentes sobre: ${tema}.`,
          "Ordene por data de julgamento e indique quando um precedente supera, distingue ou reafirma entendimento anterior.",
          DIRECT_ANSWER_INSTRUCTION,
          STRUCTURED_RESULT_INSTRUCTION
        ]),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: false
      };
    }
  },
  {
    name: "buscar_citacoes_dispositivo",
    title: "Buscar citacoes de dispositivo",
    description:
      "Pesquisa precedentes que citam ou aplicam um dispositivo legal, conforme a cobertura da fonte.",
    inputSchema: citationsByStatuteZodToolInputSchema,
    jsonInputSchema: citationsByStatuteJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = citationsByStatuteInputSchema.parse(input);
      const dispositivo = normalizeQuery(parsed.dispositivo);

      return {
        query: joinParts([
          `Busque precedentes que citem ou apliquem o seguinte dispositivo legal: ${dispositivo}.`,
          "Transcreva o trecho verificavel em que o dispositivo aparece e diferencie citacao literal, aplicacao inferida e mera referencia lateral.",
          DIRECT_ANSWER_INSTRUCTION,
          STRUCTURED_RESULT_INSTRUCTION
        ]),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: false
      };
    }
  },
  {
    name: "historico_alteracoes_norma",
    title: "Historico de alteracoes de norma",
    description:
      "Pesquisa alteracoes legislativas de uma norma e solicita fontes oficiais, conforme a cobertura da fonte.",
    inputSchema: statuteHistoryZodToolInputSchema,
    jsonInputSchema: statuteHistoryJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = statuteHistoryInputSchema.parse(input);
      const norma = normalizeQuery(parsed.norma);

      return {
        query: joinParts([
          `Pesquise o historico de alteracoes legislativas da seguinte norma ou dispositivo: ${norma}.`,
          "Indique ato alterador, numero, data, dispositivo afetado, redacoes anteriores, revogacoes, vigencia e links de fontes oficiais quando disponiveis.",
          "Nao invente versoes ou datas que nao estejam documentadas na fonte.",
          DIRECT_ANSWER_INSTRUCTION,
          STRUCTURED_RESULT_INSTRUCTION
        ]),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: false
      };
    }
  },
  {
    name: "listar_overruling_tema",
    title: "Listar overruling por tema",
    description:
      "Pesquisa entendimentos superados ou revistos sobre um tema e os precedentes posteriores relacionados.",
    inputSchema: overrulingZodToolInputSchema,
    jsonInputSchema: overrulingJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = overrulingInputSchema.parse(input);
      const tema = normalizeQuery(parsed.tema);

      return {
        query: joinParts([
          `Pesquise entendimentos jurisprudenciais superados ou revistos sobre: ${tema}.`,
          "Para cada caso, identifique os precedentes anterior e posterior, as datas e o trecho que evidencia a superacao ou revisao.",
          "Diferencie overruling, distinguishing, superacao legislativa e mera divergencia.",
          DIRECT_ANSWER_INSTRUCTION,
          STRUCTURED_RESULT_INSTRUCTION
        ]),
        maxWaitSeconds: normalizeMaxWait(parsed.max_wait_seconds),
        includeDebug: false
      };
    }
  },
  {
    name: "buscar_precedentes_qualificados",
    title: "Buscar precedentes qualificados",
    description:
      "Prioriza precedentes vinculantes ou qualificados sobre um tema e informa a autoridade identificada.",
    inputSchema: qualifiedPrecedentsZodToolInputSchema,
    jsonInputSchema: qualifiedPrecedentsJsonToolInputSchema,
    normalizeInput(input) {
      const parsed = qualifiedPrecedentsInputSchema.parse(input);
      const tema = normalizeQuery(parsed.tema);

      return {
        query: joinParts([
          `Busque precedentes vinculantes ou qualificados sobre: ${tema}.`,
          "Priorize Sumula Vinculante, controle concentrado, repercussao geral, recursos repetitivos, IRDR e IAC antes de acordaos comuns.",
          "Identifique categoria, tema, sumula ou incidente, numero, tese, situacao atual e alcance vinculante ou persuasivo; nao atribua qualificacao sem identificador verificavel.",
          DIRECT_ANSWER_INSTRUCTION,
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
