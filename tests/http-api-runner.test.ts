import { describe, expect, it, vi } from "vitest";
import {
  HttpApiJurisprudenciaIaRunner,
  parseJurisprudenciaIaStream
} from "../src/jurisprudenciaia/http-api-runner.js";

const session = {
  chatId: "chat-test",
  signature: "sig-test",
  issuedAt: 1781405302877
};

const stream = [
  'data: {"type":"start"}',
  "",
  'data: {"type":"data-registry-update","data":{"ref":"J1","tribunal":"stj","titulo":"AgInt no AREsp 1234567","precedente":{"texto_ementa":"EMENTA: responsabilidade civil e dano moral.","texto_inteiro_teor":"INTEIRO TEOR: acordam os ministros em reconhecer a necessidade de demonstracao do dano, do nexo causal e da conduta ilicita. O voto condutor examina a prova dos autos e fixa os limites da responsabilidade civil no caso concreto.","data_julgamento":"2025-03-24T00:00:00.000Z","link_pdf":"https://example.test/acordao.pdf"}}}',
  "",
  'data: {"type":"text-delta","delta":"O STJ reconhece que a responsabilidade civil depende da demonstracao do dano, do nexo causal e da conduta ilicita "}',
  "",
  'data: {"type":"text-delta","delta":"quando a falha do servico gera prejuizo indenizavel [J1]."}',
  ""
].join("\n");

describe("parseJurisprudenciaIaStream", () => {
  it("collects answer deltas and registry references", () => {
    const parsed = parseJurisprudenciaIaStream(stream);

    expect(parsed.answer).toContain("responsabilidade civil depende");
    expect(parsed.references).toHaveLength(1);
    expect(parsed.references[0]).toMatchObject({
      ref: "J1",
      tribunal: "stj",
      titulo: "AgInt no AREsp 1234567"
    });
  });

  it("normalizes JurisprudenciaIA citation markers", () => {
    const parsed = parseJurisprudenciaIaStream(
      'data: {"type":"text-delta","delta":"Texto gerado com citacao \\u27e6=J2\\u27e7."}\n\n'
    );

    expect(parsed.answer).toBe("Texto gerado com citacao [J2].");
  });

  it("normalizes raw JurisprudenciaIA citation markers without equals sign", () => {
    const parsed = parseJurisprudenciaIaStream(
      'data: {"type":"text-delta","delta":"Texto gerado com citacao \\u27e6J2\\u27e7."}\n\n'
    );

    expect(parsed.answer).toBe("Texto gerado com citacao [J2].");
  });

  it("formats citation markers as links when registry data has a source URL", () => {
    const parsed = parseJurisprudenciaIaStream([
      'data: {"type":"data-registry-update","data":{"ref":"J7","tribunal":"tjsp","titulo":"Apelacao Civel 1000000-00.2024.8.26.0000","precedente":{"texto_ementa":"EMENTA: fiador de si mesmo.","data_julgamento":"2025-01-10T00:00:00.000Z","link":"https://example.test/tjsp-j7"}}}',
      "",
      'data: {"type":"text-delta","delta":"Nesse sentido: \\u27e6=J7\\u27e7."}',
      ""
    ].join("\n"));

    expect(parsed.answer).toBe(
      "Nesse sentido: [J7 - TJSP](https://example.test/tjsp-j7)."
    );
  });

  it("ignores malformed JSON blocks without throwing", () => {
    const parsed = parseJurisprudenciaIaStream(
      'data: {"type":"text-delta","delta":"Valid part 1."}\n\n' +
      'data: {"type":"text-delta","delta": malformed }\n\n' +
      'data: {"type":"text-delta","delta":" Valid part 2."}\n\n'
    );
    expect(parsed.answer).toBe("Valid part 1. Valid part 2.");
  });

  it("ignores empty and non-data blocks without throwing", () => {
    const parsed = parseJurisprudenciaIaStream(
      'data: {"type":"text-delta","delta":"Valid part 1."}\n\n' +
      '\n\n' +
      'event: ping\ndata: \n\n' +
      'data: {"type":"text-delta","delta":" Valid part 2."}\n\n'
    );
    expect(parsed.answer).toBe("Valid part 1. Valid part 2.");
  });

  it("returns empty answer but preserves references when no text-deltas are present", () => {
    const parsed = parseJurisprudenciaIaStream(
      'data: {"type":"data-registry-update","data":{"ref":"J1","tribunal":"stj","titulo":"AgInt no AREsp 1234567"}}\n\n'
    );
    expect(parsed.answer).toBe("");
    expect(parsed.references).toHaveLength(1);
    expect(parsed.references[0]).toMatchObject({ ref: "J1" });
  });

  it("overwrites duplicate references, keeping the latest update", () => {
    const parsed = parseJurisprudenciaIaStream(
      'data: {"type":"data-registry-update","data":{"ref":"J1","tribunal":"stj","titulo":"Old Title"}}\n\n' +
      'data: {"type":"data-registry-update","data":{"ref":"J1","tribunal":"stj","titulo":"New Title"}}\n\n'
    );
    expect(parsed.references).toHaveLength(1);
    expect(parsed.references[0]).toMatchObject({ ref: "J1", titulo: "New Title" });
  });
});

describe("HttpApiJurisprudenciaIaRunner", () => {
  it("calls the direct HTTP API and formats Markdown", async () => {
    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/chat-jurisprudencia/session")) {
        return new Response(JSON.stringify(session), { status: 200 });
      }

      if (url.endsWith("/api/chat-jurisprudencia")) {
        expect(init?.body).toBeTypeOf("string");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          chatId: session.chatId,
          signature: session.signature,
          issuedAt: session.issuedAt,
          origin: "typed",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "responsabilidade civil por dano moral" }]
            }
          ]
        });

        return new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        });
      }

      return new Response("not found", { status: 404 });
    });

    const runner = new HttpApiJurisprudenciaIaRunner({
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      requestTimeoutMs: 120000,
      fetch
    });

    const result = await runner.search({
      query: "responsabilidade civil por dano moral",
      maxWaitSeconds: 60,
      includeDebug: true
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.rawText).toBe(stream);
    expect(result.markdown).toContain("# Resultado JurisprudenciaIA");
    expect(result.markdown).toContain("## Resposta do JurisprudenciaIA");
    expect(result.markdown).toContain(
      "[J1 - STJ](https://example.test/acordao.pdf)"
    );
    expect(result.markdown).toContain("## Tese principal identificada");
    expect(result.markdown).toContain("## Precedentes citados");
    expect(result.markdown).toContain("### Precedente J1");
    expect(result.markdown).toContain("- Tribunal: STJ");
    expect(result.markdown).toContain("- Tipo/numero: AgInt no AREsp 1234567");
    expect(result.markdown).toContain("- Data de julgamento: 2025-03-24");
    expect(result.markdown).toContain("- Link: https://example.test/acordao.pdf");
    expect(result.markdown).toContain("- Ementa: EMENTA: responsabilidade civil e dano moral.");
    expect(result.markdown).toContain("#### Inteiro teor");
    expect(result.markdown).toContain(
      "INTEIRO TEOR: acordam os ministros em reconhecer a necessidade de demonstracao do dano"
    );
    expect(result.markdown).toContain("## Pontos de cautela");
  });

  it("keeps precedent output useful when some metadata is missing", async () => {
    const partialMetadataStream = [
      'data: {"type":"start"}',
      "",
      'data: {"type":"data-registry-update","data":{"ref":"J2","tribunal":"tjsp","precedente":{"texto_ementa":"EMENTA: acordo e sub-rogacao."}}}',
      "",
      'data: {"type":"text-delta","delta":"O entendimento citado reforca a necessidade de conferir a eficacia do acordo antes da sub-rogacao. O precedente deve ser analisado pela integra [J2]."}',
      ""
    ].join("\n");

    const fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith("/api/chat-jurisprudencia/session")) {
        return new Response(JSON.stringify(session), { status: 200 });
      }

      return new Response(partialMetadataStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    });
    const runner = new HttpApiJurisprudenciaIaRunner({
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      requestTimeoutMs: 120000,
      fetch
    });

    const result = await runner.search({
      query: "sub-rogacao seguradora acordo previo",
      maxWaitSeconds: 60,
      includeDebug: false
    });

    expect(result.markdown).toContain("### Precedente J2");
    expect(result.markdown).toContain("- Tribunal: TJSP");
    expect(result.markdown).toContain("- Tipo/numero: nao informado");
    expect(result.markdown).toContain("- Data de julgamento: nao informada");
    expect(result.markdown).toContain("- Link: nao informado");
    expect(result.markdown).toContain("- Ementa: EMENTA: acordo e sub-rogacao.");
    expect(result.markdown).toContain("- Inteiro teor: nao informado pela fonte consultada");
    expect(result.markdown).toContain(
      "- Metadados ausentes: tipo/numero, data de julgamento, link, inteiro teor"
    );
  });

  it("omits registry precedents that were not cited in the generated answer", async () => {
    const noisyRegistryStream = [
      'data: {"type":"start"}',
      "",
      'data: {"type":"data-registry-update","data":{"ref":"J1","tribunal":"stj","titulo":"REsp 1111111","precedente":{"texto_ementa":"EMENTA: precedente pertinente.","data_julgamento":"2024-01-10T00:00:00.000Z","link":"https://example.test/j1"}}}',
      "",
      'data: {"type":"data-registry-update","data":{"ref":"J2","tribunal":"stj","titulo":"REsp 2222222","precedente":{"texto_ementa":"EMENTA: precedente lateral nao usado.","data_julgamento":"2024-02-10T00:00:00.000Z","link":"https://example.test/j2"}}}',
      "",
      'data: {"type":"text-delta","delta":"A sentença penal condenatória pode embasar execução civil após liquidação quando não houver valor mínimo fixado [J1]."}',
      ""
    ].join("\n");

    const fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith("/api/chat-jurisprudencia/session")) {
        return new Response(JSON.stringify(session), { status: 200 });
      }

      return new Response(noisyRegistryStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    });
    const runner = new HttpApiJurisprudenciaIaRunner({
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      requestTimeoutMs: 120000,
      fetch
    });

    const result = await runner.search({
      query: "execucao civil da sentenca penal condenatoria",
      maxWaitSeconds: 60,
      includeDebug: false
    });

    expect(result.markdown).toContain("### Precedente J1");
    expect(result.markdown).not.toContain("### Precedente J2");
    expect(result.markdown).not.toContain("precedente lateral nao usado");
  });

  it("maps HTTP 429 to rate_limited", async () => {
    const fetch = vi.fn(async () => new Response("quota", { status: 429 }));
    const runner = new HttpApiJurisprudenciaIaRunner({
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      requestTimeoutMs: 120000,
      fetch
    });

    await expect(
      runner.search({
        query: "responsabilidade civil por dano moral",
        maxWaitSeconds: 60,
        includeDebug: false
      })
    ).rejects.toMatchObject({
      code: "rate_limited"
    });
  });

  it("rejects responses without usable generated text", async () => {
    const fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith("/api/chat-jurisprudencia/session")) {
        return new Response(JSON.stringify(session), { status: 200 });
      }

      return new Response('data: {"type":"text-delta","delta":"curto"}\n\n', { status: 200 });
    });
    const runner = new HttpApiJurisprudenciaIaRunner({
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      requestTimeoutMs: 120000,
      fetch
    });

    await expect(
      runner.search({
        query: "responsabilidade civil por dano moral",
        maxWaitSeconds: 60,
        includeDebug: false
      })
    ).rejects.toMatchObject({
      code: "no_result_detected"
    });
  });
});
