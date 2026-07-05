import { describe, expect, it } from "vitest";
import type { JurisprudenciaIaNormalizeInput } from "../src/jurisprudenciaia/types.js";
import { OperationalError } from "../src/errors.js";
import { normalizeJurisprudenciaIaResult } from "../src/jurisprudenciaia/result-normalizer.js";

describe("normalizeJurisprudenciaIaResult", () => {
  it("formats generated content as Markdown", () => {
    const markdown = normalizeJurisprudenciaIaResult({
      query: "responsabilidade civil dano moral banco",
      rawText: [
        "Entrar",
        "Pesquisar",
        "Resultado",
        "O entendimento predominante indica responsabilidade civil quando há falha na prestação do serviço.",
        "Citação: STJ, AgInt no AREsp 1234567, julgado em 10/10/2024."
      ].join("\n"),
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      executedAtIso: "2026-06-12T15:00:00.000Z"
    });

    expect(markdown).toContain("# Resultado JurisprudenciaIA");
    expect(markdown).toContain("Consulta: responsabilidade civil dano moral banco");
    expect(markdown).toContain("O entendimento predominante indica responsabilidade civil");
    expect(markdown).toContain("STJ");
    expect(markdown).not.toContain("\nEntrar\n");
  });

  it("filters page chrome terms from generated content", () => {
    const input: JurisprudenciaIaNormalizeInput = {
      query: "multa contratual jurisprudência",
      rawText: [
        "Cadastrar",
        "loading",
        "Copiar",
        "Nova busca",
        "Fazer nova pesquisa",
        "Termos",
        "politica",
        "política",
        "Resultado",
        "A jurisprudência analisada aponta que a multa contratual pode ser reduzida quando se mostra excessiva diante da obrigação principal.",
        "Precedente: STJ, REsp 987654, julgado em 05/05/2025."
      ].join("\n"),
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      executedAtIso: "2026-06-12T15:00:00.000Z"
    };

    const markdown = normalizeJurisprudenciaIaResult(input);

    expect(markdown).toContain("A jurisprudência analisada aponta");
    expect(markdown).not.toMatch(/^Cadastrar$/im);
    expect(markdown).not.toMatch(/^loading$/im);
    expect(markdown).not.toMatch(/^Copiar$/im);
    expect(markdown).not.toMatch(/^Nova busca$/im);
    expect(markdown).not.toMatch(/^Fazer nova pesquisa$/im);
    expect(markdown).not.toMatch(/^Termos$/im);
    expect(markdown).not.toMatch(/^politica$/im);
    expect(markdown).not.toMatch(/^política$/im);
  });

  it("preserves substantive legal lines that start with terms and policy words", () => {
    const markdown = normalizeJurisprudenciaIaResult({
      query: "saúde suplementar contrato",
      rawText: [
        "Termos",
        "política",
        "Política pública de saúde deve ser considerada na análise da obrigação estatal quando o pedido envolve fornecimento de medicamento essencial.",
        "Termos contratuais abusivos podem ser afastados quando restringem direito básico do consumidor em contrato de plano de saúde."
      ].join("\n"),
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      executedAtIso: "2026-06-12T15:00:00.000Z"
    });

    expect(markdown).toContain("Política pública de saúde deve ser considerada");
    expect(markdown).toContain("Termos contratuais abusivos podem ser afastados");
    expect(markdown).not.toMatch(/^Termos$/im);
    expect(markdown).not.toMatch(/^política$/im);
  });

  it("preserves repeated non-adjacent legal lines", () => {
    const repeatedCitation = "Citação repetida: STJ, AgInt no AREsp 1111111, julgado em 01/01/2024.";

    const markdown = normalizeJurisprudenciaIaResult({
      query: "dano moral contrato bancário",
      rawText: [
        "Resultado",
        "Tese central: o dever de indenizar depende da comprovação do dano e do nexo causal.",
        repeatedCitation,
        "Fundamento adicional: a repetição de julgados em seções distintas não deve ser eliminada.",
        repeatedCitation
      ].join("\n"),
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      executedAtIso: "2026-06-12T15:00:00.000Z"
    });

    expect(markdown.match(new RegExp(repeatedCitation, "g"))).toHaveLength(2);
  });

  it("extracts generated prose from a captured page snapshot", () => {
    const markdown = normalizeJurisprudenciaIaResult({
      query: "responsabilidade civil banco contrato",
      rawText: [
        "- generic",
        "- banner",
        "- link \"JurisprudenciaIA\" [ref=e1]",
        "- button \"Abrir menu\" [ref=e3]",
        "- paragraph",
        "- StaticText \"responsabilidade civil banco contrato\"",
        "- status",
        "- StaticText \"Busca\"",
        "- StaticText \": \"",
        "- StaticText \"responsabilidade civil banco\"",
        "- paragraph",
        "- StaticText \"Buscar precedentes sobre responsabilidade civil.\"",
        "- paragraph",
        "- StaticText \"A jurisprudencia do STJ reconhece responsabilidade civil quando ha falha na prestacao do servico.\"",
        "- heading \"1. Dano moral\" [level=3, ref=e11]",
        "- paragraph",
        "- StaticText \"O dano moral pode ser reconhecido quando presentes ato ilicito, dano e nexo causal.\"",
        "- button \"Conferir STJ AgInt no AREsp 123 no painel\" [ref=e12]"
      ].join("\n"),
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      executedAtIso: "2026-06-12T15:00:00.000Z"
    });

    expect(markdown).toContain(
      "A jurisprudencia do STJ reconhece responsabilidade civil"
    );
    expect(markdown).toContain("### 1. Dano moral");
    expect(markdown).toContain("O dano moral pode ser reconhecido");
    expect(markdown).not.toContain("StaticText");
    expect(markdown).not.toContain("Abrir menu");
    expect(markdown).not.toContain("Buscar precedentes");
    expect(markdown).not.toContain("\nresponsabilidade civil banco contrato\n");
  });

  it("filters long snapshot plan lines before the normalization fast path", () => {
    const longPlanLine = `Buscar precedentes sobre ${"responsabilidade civil ".repeat(20)}`;

    const markdown = normalizeJurisprudenciaIaResult({
      query: "responsabilidade civil banco contrato",
      rawText: [
        "- paragraph",
        `- StaticText "${longPlanLine}"`,
        "- paragraph",
        "- StaticText \"Trata-se de resposta gerada sobre responsabilidade civil bancária, com análise suficiente para ultrapassar o limite mínimo de texto útil.\""
      ].join("\n"),
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      executedAtIso: "2026-06-12T15:00:00.000Z"
    });

    expect(markdown).toContain("Trata-se de resposta gerada");
    expect(markdown).not.toContain("Buscar precedentes");
  });

  it("adds spacing between adjacent snapshot text nodes", () => {
    const markdown = normalizeJurisprudenciaIaResult({
      query: "dano moral inscricao indevida",
      rawText: [
        "- paragraph",
        "- StaticText \"A jurisprudencia do STJ considera o dano moral presumido em negativacao indevida.\"",
        "- paragraph",
        "- StaticText \"Nesse sentido:\"",
        "- StaticText \"STJ - AgRg no AREsp 217.520/RS\"",
        "- StaticText \".\""
      ].join("\n"),
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      executedAtIso: "2026-06-12T15:00:00.000Z"
    });

    expect(markdown).toContain("Nesse sentido: STJ - AgRg no AREsp 217.520/RS.");
    expect(markdown).not.toContain("sentido:STJ");
    expect(markdown).not.toContain("RS .");
  });

  it("throws when no useful generated text remains", () => {
    expect(() =>
      normalizeJurisprudenciaIaResult({
        query: "x",
        rawText: "Entrar\nPesquisar\nCarregando",
        sourceUrl: "https://www.jurisprudenciaia.com.br/",
        executedAtIso: "2026-06-12T15:00:00.000Z"
      })
    ).toThrow("No usable JurisprudenciaIA result text was detected");

    try {
      normalizeJurisprudenciaIaResult({
        query: "x",
        rawText: "Entrar\nPesquisar\nCarregando",
        sourceUrl: "https://www.jurisprudenciaia.com.br/",
        executedAtIso: "2026-06-12T15:00:00.000Z"
      });
      throw new Error("Expected normalizeJurisprudenciaIaResult to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(OperationalError);
      expect(error).toMatchObject({
        code: "no_result_detected",
        message: "No usable JurisprudenciaIA result text was detected"
      });
    }
  });

  it("filters preamble lines before the first generated text marker", () => {
    const markdown = normalizeJurisprudenciaIaResult({
      query: "responsabilidade civil",
      rawText: [
        "- paragraph",
        "- StaticText \"Some noisy UI element\"",
        "- paragraph",
        "- StaticText \"responsabilidade civil\"",
        "- paragraph",
        "- StaticText \"O entendimento consolidado sobre responsabilidade civil indica que houve progresso na tese, o que gera bastante conteudo util e ultrapassa a marca minima.\"",
      ].join("\n"),
      sourceUrl: "https://www.jurisprudenciaia.com.br/",
      executedAtIso: "2026-06-12T15:00:00.000Z"
    });

    expect(markdown).toContain("O entendimento consolidado sobre responsabilidade civil");
    expect(markdown).not.toContain("Some noisy UI element");
    expect(markdown).not.toContain("\nresponsabilidade civil\n");
  });
});
