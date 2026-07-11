import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { OperationalError } from "../src/errors.js";
import type {
  JurisprudenciaIaQuery,
  JurisprudenciaIaRunner
} from "../src/jurisprudenciaia/types.js";
import {
  createJurisprudenciaIaMcpServer,
  normalizeToolInput
} from "../src/mcp/create-server.js";
import { findToolDefinition } from "../src/mcp/tool-definition.js";

async function withMcpClient(
  runner: JurisprudenciaIaRunner,
  run: (client: Client) => Promise<void>
) {
  const server = createJurisprudenciaIaMcpServer(runner);
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function firstText(result: Awaited<ReturnType<Client["callTool"]>>) {
  return (result as { content: [{ type: "text"; text: string }] }).content[0].text;
}

describe("normalizeToolInput", () => {
  it("accepts a valid query", () => {
    expect(
      normalizeToolInput({
        query: "responsabilidade civil por dano moral",
        max_wait_seconds: 60,
        include_debug: true
      })
    ).toEqual({
      query: [
        "Pesquise jurisprudência sobre: responsabilidade civil por dano moral.",
        "Responda diretamente, sem pedir esclarecimentos.",
        "Se o tema for amplo, escolha o recorte jurídico mais provável e indique essa escolha nos pontos de cautela.",
        "Estruture a resposta com tese principal, precedentes citados por referencia, tribunal, tipo/numero, data de julgamento, ementa, inteiro teor ou transcricao integral disponibilizada pela fonte, link quando disponivel e pontos de cautela. Nao substitua o inteiro teor por resumo, recorte ou excerto; quando a fonte nao disponibilizar inteiro teor, informe isso explicitamente."
      ].join(" "),
      maxWaitSeconds: 60,
      includeDebug: true
    });
  });

  it("guides generic queries to produce a direct jurisprudence answer", () => {
    expect(
      normalizeToolInput({
        query: "ressarcimento de danos após condenação em processo criminal"
      })
    ).toEqual({
      query: [
        "Pesquise jurisprudência sobre: ressarcimento de danos após condenação em processo criminal.",
        "Responda diretamente, sem pedir esclarecimentos.",
        "Se o tema for amplo, escolha o recorte jurídico mais provável e indique essa escolha nos pontos de cautela.",
        "Estruture a resposta com tese principal, precedentes citados por referencia, tribunal, tipo/numero, data de julgamento, ementa, inteiro teor ou transcricao integral disponibilizada pela fonte, link quando disponivel e pontos de cautela. Nao substitua o inteiro teor por resumo, recorte ou excerto; quando a fonte nao disponibilizar inteiro teor, informe isso explicitamente."
      ].join(" "),
      maxWaitSeconds: 120,
      includeDebug: false
    });
  });

  it("rejects short query text", () => {
    expect(() => normalizeToolInput({ query: "abc" })).toThrow(
      "A consulta deve ter pelo menos 8 caracteres"
    );
  });

  it("rejects oversized thesis context text", () => {
    const tool = findToolDefinition("analisar_tese_juridica");

    expect(() =>
      tool!.normalizeInput({
        tese: "responsabilidade civil por dano moral",
        contexto: "x".repeat(2001)
      })
    ).toThrow("O contexto excede o limite maximo de 2000 caracteres");
  });

  it("rejects oversized precedent court filters", () => {
    const tool = findToolDefinition("buscar_precedentes");

    expect(() =>
      tool!.normalizeInput({
        tema: "responsabilidade civil por dano moral",
        tribunais: Array.from({ length: 401 }, (_, index) => `tribunal-${index}`)
      })
    ).toThrow("Os tribunais excedem o limite maximo de 2000 caracteres");
  });

  it("caps max_wait_seconds at 120", () => {
    expect(
      normalizeToolInput({
        query: "responsabilidade civil por dano moral",
        max_wait_seconds: 999
      })
    ).toMatchObject({
      maxWaitSeconds: 120
    });
  });
});

describe("createJurisprudenciaIaMcpServer", () => {
  it("publishes server instructions for Codex and other MCP clients", async () => {
    await withMcpClient(
      {
        async search() {
          return { markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado." };
        }
      },
      async (client) => {
        expect(client.getInstructions()).toContain("inteiro teor");
        expect(client.getInstructions()).toContain("fonte oficial");
      }
    );
  });

  it("registers the query tool and returns Markdown with debug text", async () => {
    let receivedInput: Required<JurisprudenciaIaQuery> | undefined;

    await withMcpClient(
      {
        async search(input) {
          receivedInput = input;

          return {
            markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado.",
            rawText: "texto bruto extraido"
          };
        }
      },
      async (client) => {
        const { tools } = await client.listTools();
        const tool = tools.find((item) => item.name === "consultar_jurisprudenciaia");

        expect(tools.map((item) => item.name)).toEqual([
          "consultar_jurisprudenciaia",
          "pesquisar_jurisprudencia",
          "buscar_precedentes",
          "analisar_tese_juridica",
          "comparar_teses_juridicas",
          "buscar_por_cnj",
          "pesquisar_legislacao",
          "buscar_informativos",
          "analisar_jurimetria",
          "linha_do_tempo_precedentes",
          "buscar_citacoes_dispositivo",
          "historico_alteracoes_norma",
          "listar_overruling_tema",
          "buscar_precedentes_qualificados"
        ]);
        expect(tool).toMatchObject({
          name: "consultar_jurisprudenciaia",
          title: "Consultar JurisprudenciaIA",
          outputSchema: {
            type: "object",
            properties: {
              markdown: { type: "string" }
            },
            required: ["markdown"],
            additionalProperties: false
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
          }
        });
        expect(tools.every((item) => item.outputSchema !== undefined)).toBe(true);
        expect(tool?.description).toContain("JurisprudenciaIA");

        const result = await client.callTool({
          name: "consultar_jurisprudenciaia",
          arguments: {
            query: "responsabilidade civil por dano moral",
            max_wait_seconds: 60,
            include_debug: true
          }
        });

        expect(receivedInput).toEqual({
          query: [
            "Pesquise jurisprudência sobre: responsabilidade civil por dano moral.",
            "Responda diretamente, sem pedir esclarecimentos.",
            "Se o tema for amplo, escolha o recorte jurídico mais provável e indique essa escolha nos pontos de cautela.",
            "Estruture a resposta com tese principal, precedentes citados por referencia, tribunal, tipo/numero, data de julgamento, ementa, inteiro teor ou transcricao integral disponibilizada pela fonte, link quando disponivel e pontos de cautela. Nao substitua o inteiro teor por resumo, recorte ou excerto; quando a fonte nao disponibilizar inteiro teor, informe isso explicitamente."
          ].join(" "),
          maxWaitSeconds: 60,
          includeDebug: true
        });
        expect(firstText(result)).toBe(
          "# Resultado JurisprudenciaIA\n\nTexto consolidado.\n\n## Debug\n\n```text\ntexto bruto extraido\n```"
        );
        expect(result.structuredContent).toEqual({
          markdown:
            "# Resultado JurisprudenciaIA\n\nTexto consolidado.\n\n## Debug\n\n```text\ntexto bruto extraido\n```"
        });
      }
    );
  });

  it("maps specialist precedent tool arguments into a guided JurisprudenciaIA query", async () => {
    let receivedInput: Required<JurisprudenciaIaQuery> | undefined;

    await withMcpClient(
      {
        async search(input) {
          receivedInput = input;

          return {
            markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado."
          };
        }
      },
      async (client) => {
        const result = await client.callTool({
          name: "buscar_precedentes",
          arguments: {
            tema: "autofianca em contrato de locacao",
            tribunais: ["STJ", "TJSP"],
            max_wait_seconds: 60
          }
        });

        expect(result).not.toMatchObject({ isError: true });
        expect(receivedInput).toEqual({
          query: [
            "Busque precedentes jurisprudenciais sobre: autofianca em contrato de locacao.",
            "Priorize decisoes diretamente relacionadas ao tema.",
            "Responda diretamente, sem pedir esclarecimentos.",
            "Estruture a resposta com tese principal, precedentes citados por referencia, tribunal, tipo/numero, data de julgamento, ementa, inteiro teor ou transcricao integral disponibilizada pela fonte, link quando disponivel e pontos de cautela. Nao substitua o inteiro teor por resumo, recorte ou excerto; quando a fonte nao disponibilizar inteiro teor, informe isso explicitamente.",
            "Tribunais de interesse: STJ, TJSP."
          ].join(" "),
          maxWaitSeconds: 60,
          includeDebug: false
        });
      }
    );
  });

  it("maps direct search tool arguments into a guided JurisprudenciaIA query", async () => {
    let receivedInput: Required<JurisprudenciaIaQuery> | undefined;

    await withMcpClient(
      {
        async search(input) {
          receivedInput = input;

          return {
            markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado."
          };
        }
      },
      async (client) => {
        const result = await client.callTool({
          name: "pesquisar_jurisprudencia",
          arguments: {
            query: "ressarcimento de danos após condenação em processo criminal",
            max_wait_seconds: 60
          }
        });

        expect(result).not.toMatchObject({ isError: true });
        expect(receivedInput).toEqual({
          query: [
            "Pesquise jurisprudência sobre: ressarcimento de danos após condenação em processo criminal.",
            "Responda diretamente, sem pedir esclarecimentos.",
            "Se o tema for amplo, escolha o recorte jurídico mais provável e indique essa escolha nos pontos de cautela.",
            "Estruture a resposta com tese principal, precedentes citados por referencia, tribunal, tipo/numero, data de julgamento, ementa, inteiro teor ou transcricao integral disponibilizada pela fonte, link quando disponivel e pontos de cautela. Nao substitua o inteiro teor por resumo, recorte ou excerto; quando a fonte nao disponibilizar inteiro teor, informe isso explicitamente."
          ].join(" "),
          maxWaitSeconds: 60,
          includeDebug: false
        });
      }
    );
  });

  it("omits debug text when include_debug is false", async () => {
    await withMcpClient(
      {
        async search() {
          return {
            markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado.",
            rawText: "texto bruto extraido"
          };
        }
      },
      async (client) => {
        const result = await client.callTool({
          name: "consultar_jurisprudenciaia",
          arguments: {
            query: "responsabilidade civil por dano moral",
            include_debug: false
          }
        });

        expect(firstText(result)).toBe("# Resultado JurisprudenciaIA\n\nTexto consolidado.");
      }
    );
  });

  it("omits debug text when include_debug is true but raw text is absent", async () => {
    await withMcpClient(
      {
        async search() {
          return {
            markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado."
          };
        }
      },
      async (client) => {
        const result = await client.callTool({
          name: "consultar_jurisprudenciaia",
          arguments: {
            query: "responsabilidade civil por dano moral",
            include_debug: true
          }
        });

        expect(firstText(result)).toBe("# Resultado JurisprudenciaIA\n\nTexto consolidado.");
      }
    );
  });

  it("caps high max_wait_seconds through the MCP tool", async () => {
    let receivedInput: Required<JurisprudenciaIaQuery> | undefined;

    await withMcpClient(
      {
        async search(input) {
          receivedInput = input;

          return {
            markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado."
          };
        }
      },
      async (client) => {
        const result = await client.callTool({
          name: "consultar_jurisprudenciaia",
          arguments: {
            query: "responsabilidade civil por dano moral",
            max_wait_seconds: 999
          }
        });

        expect(result).not.toMatchObject({ isError: true });
        expect(receivedInput).toEqual({
          query: [
            "Pesquise jurisprudência sobre: responsabilidade civil por dano moral.",
            "Responda diretamente, sem pedir esclarecimentos.",
            "Se o tema for amplo, escolha o recorte jurídico mais provável e indique essa escolha nos pontos de cautela.",
            "Estruture a resposta com tese principal, precedentes citados por referencia, tribunal, tipo/numero, data de julgamento, ementa, inteiro teor ou transcricao integral disponibilizada pela fonte, link quando disponivel e pontos de cautela. Nao substitua o inteiro teor por resumo, recorte ou excerto; quando a fonte nao disponibilizar inteiro teor, informe isso explicitamente."
          ].join(" "),
          maxWaitSeconds: 120,
          includeDebug: false
        });
      }
    );
  });

  it("maps the CNJ lookup tool arguments into a guided JurisprudenciaIA query", async () => {
    let receivedInput: Required<JurisprudenciaIaQuery> | undefined;

    await withMcpClient(
      {
        async search(input) {
          receivedInput = input;

          return {
            markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado."
          };
        }
      },
      async (client) => {
        const result = await client.callTool({
          name: "buscar_por_cnj",
          arguments: {
            numero_cnj: "0001234-56.2023.8.26.0100"
          }
        });

        expect(result).not.toMatchObject({ isError: true });
        expect(receivedInput?.query).toContain(
          "processo de numero CNJ: 0001234-56.2023.8.26.0100"
        );
      }
    );
  });

  it("maps the jurimetrics tool arguments into a guided JurisprudenciaIA query", async () => {
    let receivedInput: Required<JurisprudenciaIaQuery> | undefined;

    await withMcpClient(
      {
        async search(input) {
          receivedInput = input;

          return {
            markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado."
          };
        }
      },
      async (client) => {
        const result = await client.callTool({
          name: "analisar_jurimetria",
          arguments: {
            tema: "revisao de clausula abusiva em plano de saude",
            tribunal: "STJ",
            recorte: "resultado predominante"
          }
        });

        expect(result).not.toMatchObject({ isError: true });
        expect(receivedInput?.query).toContain("Tribunal de interesse: STJ.");
        expect(receivedInput?.query).toContain(
          "Recorte estatistico solicitado: resultado predominante."
        );
      }
    );
  });

  it.each([
    [
      "buscar_citacoes_dispositivo",
      { dispositivo: "CDC art. 51, IV" },
      "citem ou apliquem o seguinte dispositivo legal: CDC art. 51, IV"
    ],
    [
      "historico_alteracoes_norma",
      { norma: "artigo 1.831 do Codigo Civil" },
      "historico de alteracoes legislativas da seguinte norma ou dispositivo: artigo 1.831 do Codigo Civil"
    ],
    [
      "listar_overruling_tema",
      { tema: "prisao civil do depositario infiel" },
      "entendimentos jurisprudenciais superados ou revistos sobre: prisao civil do depositario infiel"
    ],
    [
      "buscar_precedentes_qualificados",
      { tema: "fornecimento de medicamento pelo Estado" },
      "precedentes vinculantes ou qualificados sobre: fornecimento de medicamento pelo Estado"
    ]
  ])("maps %s arguments into a guided query", async (name, arguments_, expectedText) => {
    let receivedInput: Required<JurisprudenciaIaQuery> | undefined;

    await withMcpClient(
      {
        async search(input) {
          receivedInput = input;
          return { markdown: "# Resultado JurisprudenciaIA\n\nTexto consolidado." };
        }
      },
      async (client) => {
        const result = await client.callTool({ name, arguments: arguments_ });
        expect(result).not.toMatchObject({ isError: true });
        expect(receivedInput?.query).toContain(expectedText);
      }
    );
  });

  it("formats operational errors with the error code", async () => {
    await withMcpClient(
      {
        async search() {
          throw new OperationalError("timeout", "Tempo limite excedido");
        }
      },
      async (client) => {
        const result = await client.callTool({
          name: "consultar_jurisprudenciaia",
          arguments: {
            query: "responsabilidade civil por dano moral"
          }
        });

        expect(result).toMatchObject({ isError: true });
        expect(firstText(result)).toBe(
          "Falha ao consultar JurisprudenciaIA (timeout): Tempo limite excedido"
        );
      }
    );
  });

  it("hides details from unexpected errors", async () => {
    const internalMessage =
      "internal runner failed with credential REDACT_ME";

    await withMcpClient(
      {
        async search() {
          throw new Error(internalMessage);
        }
      },
      async (client) => {
        const result = await client.callTool({
          name: "consultar_jurisprudenciaia",
          arguments: {
            query: "responsabilidade civil por dano moral"
          }
        });
        const text = firstText(result);

        expect(result).toMatchObject({ isError: true });
        expect(text).toBe(
          "Falha inesperada ao consultar JurisprudenciaIA. Tente novamente mais tarde."
        );
        expect(text).not.toContain(internalMessage);
      }
    );
  });
});
