import { OperationalError } from "../errors.js";
import type { JurisprudenciaIaNormalizeInput } from "./types.js";

const NOISE_PATTERN = /^(?:entrar|login|cadastrar|pesquisar|buscar|menu|in[ií]cio|termos(?: de uso| e condi[cç][oõ]es)?|pol[ií]tica(?: de privacidade)?|copiar|nova busca|fazer nova pesquisa|cookies?)$|^(?:carregando|loading|O Jurisprud[eê]nciaIA pode cometer erros|Precedentes citados|Os precedentes que a IA citar)/i;

const ACCESSIBILITY_SNAPSHOT_PATTERN = /^\s*-\s+(?:paragraph|heading|StaticText|status)\b/m;
const SNAPSHOT_GENERATED_START_PATTERN =
  /^(?:#{1,6}\s*)?(?:(?:\d+\.|[IVX]+\.)\s|(?:A|As|O|Os|Em|No|Na|Nos|Nas|Quanto|Conforme|Segundo|Nesse|Nessa|Dessa|Assim|Para|Quando)\b)/i;
const SNAPSHOT_PLAN_LINE_PATTERN = /^(?:buscar|pesquisar)\b/i;

// Regex patterns extracted for performance to avoid recompiling in loops
const PARAGRAPH_PATTERN = /^-\s+paragraph\b/;
const HEADING_PATTERN = /^-\s+heading\b/;
const STATUS_PATTERN = /^-\s+status\b/;
const STATIC_ELEMENTS_PATTERN = /^-\s+(?:button|textbox|image|generic|banner|main|log|separator|sectionheader|radiogroup|radio)\b/;
const STATIC_TEXT_PATTERN = /^-\s+StaticText\b/;

function parseQuotedText(line: string): string | undefined {
  const match = line.match(/"((?:\\.|[^"\\])*)"/);
  if (!match) {
    return undefined;
  }

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1].replace(/\\"/g, "\"");
  }
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimSnapshotChrome(lines: string[], query: string): string[] {
  const normalizedQuery = normalizeForComparison(query);
  const filtered = lines.filter((line) => {
    const lineWithoutHeading = line.replace(/^#{1,6}\s*/, "");

    if (SNAPSHOT_PLAN_LINE_PATTERN.test(lineWithoutHeading.trim())) {
      return false;
    }

    // FAST PATH: Skip expensive NFD normalization for long paragraphs
    if (line.length > Math.max(query.length + 50, 200)) {
      return true;
    }

    const normalizedLine = normalizeForComparison(lineWithoutHeading);

    if (normalizedLine === normalizedQuery) {
      return false;
    }

    return !SNAPSHOT_PLAN_LINE_PATTERN.test(normalizedLine);
  });

  const firstGeneratedLineIndex = filtered.findIndex((line) =>
    SNAPSHOT_GENERATED_START_PATTERN.test(line)
  );

  return firstGeneratedLineIndex >= 0 ? filtered.slice(firstGeneratedLineIndex) : filtered;
}

function joinSnapshotParagraph(parts: string[]): string {
  return parts
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAccessibilitySnapshotText(rawText: string, query: string): string {
  if (!ACCESSIBILITY_SNAPSHOT_PATTERN.test(rawText)) {
    return rawText;
  }

  const output: string[] = [];
  let paragraphParts: string[] = [];
  let collectParagraphText = false;
  let ignoreStaticText = false;

  const flushParagraph = () => {
    const paragraph = joinSnapshotParagraph(paragraphParts);
    paragraphParts = [];

    if (paragraph.length > 0) {
      output.push(paragraph);
    }
  };

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.charCodeAt(0) !== 45) { // 45 is '-'
      continue;
    }

    if (PARAGRAPH_PATTERN.test(line)) {
      flushParagraph();
      collectParagraphText = true;
      ignoreStaticText = false;
      continue;
    }

    if (HEADING_PATTERN.test(line)) {
      flushParagraph();
      collectParagraphText = false;
      ignoreStaticText = false;

      const heading = parseQuotedText(line);
      if (heading) {
        output.push(`### ${heading}`);
      }
      continue;
    }

    if (STATUS_PATTERN.test(line)) {
      flushParagraph();
      collectParagraphText = false;
      ignoreStaticText = true;
      continue;
    }

    if (STATIC_ELEMENTS_PATTERN.test(line)) {
      if (!collectParagraphText) {
        ignoreStaticText = true;
      }
      continue;
    }

    if (STATIC_TEXT_PATTERN.test(line) && collectParagraphText && !ignoreStaticText) {
      const text = parseQuotedText(line);
      if (text) {
        paragraphParts.push(text);
      }
    }
  }

  flushParagraph();

  const trimmed = trimSnapshotChrome(output, query);
  return trimmed.join("\n");
}

function cleanLines(rawText: string): string[] {
  const result: string[] = [];
  const lines = rawText.split(/\r?\n/);
  let lastProcessedLine = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+/g, " ").trim();

    if (line.length === 0) continue;
    if (line === lastProcessedLine) continue;
    lastProcessedLine = line;

    if (NOISE_PATTERN.test(line)) continue;

    result.push(line);
  }

  return result;
}

export function normalizeJurisprudenciaIaResult(input: JurisprudenciaIaNormalizeInput): string {
  const extractedText = extractAccessibilitySnapshotText(input.rawText, input.query);
  const lines = cleanLines(extractedText);
  const body = lines.join("\n\n").trim();

  if (body.length < 80) {
    throw new OperationalError(
      "no_result_detected",
      "No usable JurisprudenciaIA result text was detected"
    );
  }

  return [
    "# Resultado JurisprudenciaIA",
    "",
    `Consulta: ${input.query}`,
    `Executado em: ${input.executedAtIso}`,
    `Fonte: ${input.sourceUrl}`,
    "",
    "## Resultado",
    "",
    body
  ].join("\n");
}
