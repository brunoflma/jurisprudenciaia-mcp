import { OperationalError } from "../errors.js";
import type { JurisprudenciaIaNormalizeInput } from "./types.js";

const NOISE_PATTERNS = [
  /^entrar$/i,
  /^login$/i,
  /^cadastrar$/i,
  /^pesquisar$/i,
  /^buscar$/i,
  /^carregando/i,
  /^loading/i,
  /^menu$/i,
  /^início$/i,
  /^inicio$/i,
  /^termos$/i,
  /^termos de uso$/i,
  /^termos e condições$/i,
  /^termos e condicoes$/i,
  /^política$/i,
  /^politica$/i,
  /^política de privacidade$/i,
  /^politica de privacidade$/i,
  /^copiar$/i,
  /^nova busca$/i,
  /^fazer nova pesquisa$/i,
  /^cookies?$/i,
  /^O JurisprudênciaIA pode cometer erros/i,
  /^O JurisprudenciaIA pode cometer erros/i,
  /^Precedentes citados/i,
  /^Os precedentes que a IA citar/i
];

const COMBINED_NOISE_PATTERN = new RegExp(
  NOISE_PATTERNS.map((pattern) => pattern.source).join("|"),
  "i"
);

const ACCESSIBILITY_SNAPSHOT_PATTERN = /^\s*-\s+(?:paragraph|heading|StaticText|status)\b/m;
const SNAPSHOT_GENERATED_START_PATTERN =
  /^(?:#{1,6}\s*)?(?:(?:\d+\.|[IVX]+\.)\s|(?:A|As|O|Os|Em|No|Na|Nos|Nas|Quanto|Conforme|Segundo|Nesse|Nessa|Dessa|Assim|Para|Quando)\b)/i;
const SNAPSHOT_PLAN_LINE_PATTERN = /^(?:buscar|pesquisar)\b/i;

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
    const normalizedLine = normalizeForComparison(line.replace(/^#{1,6}\s*/, ""));

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

    if (/^-\s+paragraph\b/.test(line)) {
      flushParagraph();
      collectParagraphText = true;
      ignoreStaticText = false;
      continue;
    }

    if (/^-\s+heading\b/.test(line)) {
      flushParagraph();
      collectParagraphText = false;
      ignoreStaticText = false;

      const heading = parseQuotedText(line);
      if (heading) {
        output.push(`### ${heading}`);
      }
      continue;
    }

    if (/^-\s+status\b/.test(line)) {
      flushParagraph();
      collectParagraphText = false;
      ignoreStaticText = true;
      continue;
    }

    if (/^-\s+(?:button|textbox|image|generic|banner|main|log|separator|sectionheader|radiogroup|radio)\b/.test(line)) {
      if (!collectParagraphText) {
        ignoreStaticText = true;
      }
      continue;
    }

    if (/^-\s+StaticText\b/.test(line) && collectParagraphText && !ignoreStaticText) {
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
  // Performance optimization:
  // Process the text in a single pass instead of split -> map -> filter -> filter -> filter
  // Deduplicates adjacent lines and filters out noise efficiently.
  const result: string[] = [];
  let previousLine: string | undefined;

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length === 0) continue;

    if (line !== previousLine) {
      if (!COMBINED_NOISE_PATTERN.test(line)) {
        result.push(line);
      }
    }
    previousLine = line;
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
