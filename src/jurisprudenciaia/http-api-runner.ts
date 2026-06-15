import { OperationalError } from "../errors.js";
import type {
  JurisprudenciaIaQuery,
  JurisprudenciaIaRunner,
  JurisprudenciaIaSearchResult
} from "./types.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type HttpApiRunnerOptions = {
  sourceUrl: string;
  requestTimeoutMs: number;
  fetch?: FetchLike;
};

type ChatSession = {
  chatId: string;
  signature: string;
  issuedAt: number;
};

type StreamEvent = {
  type?: string;
  delta?: string;
  data?: RegistryUpdate;
};

type RegistryUpdate = {
  ref?: string;
  tribunal?: string;
  titulo?: string;
  precedente?: {
    texto_ementa?: string;
    texto_inteiro_teor?: string | null;
    inteiro_teor?: string | null;
    textoInteiroTeor?: string | null;
    inteiroTeor?: string | null;
    full_text?: string | null;
    fullText?: string | null;
    teor?: string | null;
    texto?: string | null;
    conteudo?: string | null;
    content?: string | null;
    data_julgamento?: string | null;
    link_pdf?: string | null;
    link?: string | null;
  };
};

type ParsedStream = {
  answer: string;
  references: RegistryUpdate[];
};

const CITATION_PATTERN = /\u27e6\s*(?:=\s*)?([A-Z]\d+)[^\u27e7]*\u27e7/g;
const RAW_CITATION_PATTERN = /\[([A-Z]\d+)\](?!\()/g;
const MARKDOWN_CITATION_REF_PATTERN = /\[(J\d+)(?:[^\]]*)\]/g;

export class HttpApiJurisprudenciaIaRunner implements JurisprudenciaIaRunner {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: HttpApiRunnerOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async search(input: Required<JurisprudenciaIaQuery>): Promise<JurisprudenciaIaSearchResult> {
    const timeoutMs = Math.min(input.maxWaitSeconds * 1000, this.options.requestTimeoutMs);
    const session = await this.createSession(timeoutMs);
    const rawText = await this.callChat(input.query, session, timeoutMs);
    const parsed = parseJurisprudenciaIaStream(rawText);
    const markdown = formatJurisprudenciaIaMarkdown({
      query: input.query,
      sourceUrl: this.options.sourceUrl,
      executedAtIso: new Date().toISOString(),
      parsed
    });

    return input.includeDebug ? { markdown, rawText } : { markdown };
  }

  private async createSession(timeoutMs: number): Promise<ChatSession> {
    const response = await this.fetchJson(
      "/api/chat-jurisprudencia/session",
      {
        method: "POST",
        headers: this.headers("application/json"),
        body: "{}"
      },
      timeoutMs
    );

    if (!isChatSession(response)) {
      throw new OperationalError(
        "extraction_failed",
        "JurisprudenciaIA returned an invalid chat session"
      );
    }

    return response;
  }

  private async callChat(query: string, session: ChatSession, timeoutMs: number): Promise<string> {
    const response = await this.fetchText(
      "/api/chat-jurisprudencia",
      {
        method: "POST",
        headers: this.headers("text/event-stream, text/plain, */*"),
        body: JSON.stringify({
          messages: [
            {
              id: "msg-1",
              role: "user",
              parts: [{ type: "text", text: query }]
            }
          ],
          chatId: session.chatId,
          signature: session.signature,
          issuedAt: session.issuedAt,
          origin: "typed"
        })
      },
      timeoutMs
    );

    return response;
  }

  private async fetchJson(pathname: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
    const text = await this.fetchText(pathname, init, timeoutMs);

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new OperationalError(
        "extraction_failed",
        "JurisprudenciaIA returned invalid JSON"
      );
    }
  }

  private async fetchText(pathname: string, init: RequestInit, timeoutMs: number): Promise<string> {
    const url = new URL(pathname, this.options.sourceUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        ...init,
        signal: controller.signal
      });
      const text = await response.text();

      if (!response.ok) {
        throw new OperationalError(
          response.status === 429 ? "rate_limited" : "browser_command_failed",
          `JurisprudenciaIA HTTP API returned ${response.status}`,
          text.slice(0, 1000)
        );
      }

      return text;
    } catch (error) {
      if (error instanceof OperationalError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new OperationalError(
          "timeout",
          "Timed out waiting for JurisprudenciaIA HTTP API"
        );
      }

      throw new OperationalError(
        "browser_command_failed",
        "JurisprudenciaIA HTTP API request failed",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private headers(accept: string): HeadersInit {
    const origin = new URL(this.options.sourceUrl).origin;

    return {
      "content-type": "application/json",
      accept,
      origin,
      referer: this.options.sourceUrl
    };
  }
}

function isChatSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<ChatSession>;
  return (
    typeof session.chatId === "string" &&
    typeof session.signature === "string" &&
    typeof session.issuedAt === "number"
  );
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
  );
}

export function parseJurisprudenciaIaStream(rawText: string): ParsedStream {
  const references = new Map<string, RegistryUpdate>();
  let answer = "";

  for (const event of parseSseEvents(rawText)) {
    if (event.type === "text-delta" && typeof event.delta === "string") {
      answer += event.delta;
      continue;
    }

    if (event.type === "data-registry-update" && event.data?.ref) {
      references.set(event.data.ref, event.data);
    }
  }

  const sortedReferences = Array.from(references.values()).sort(compareReferences);

  return {
    answer: formatInlineCitations(answer, sortedReferences).trim(),
    references: sortedReferences
  };
}

function parseSseEvents(rawText: string): StreamEvent[] {
  const events: StreamEvent[] = [];

  for (const block of rawText.split(/\n\n+/)) {
    const dataLines = block
      .split(/\n/)
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6));

    if (dataLines.length === 0) {
      continue;
    }

    try {
      events.push(JSON.parse(dataLines.join("\n")) as StreamEvent);
    } catch {
      continue;
    }
  }

  return events;
}

function compareReferences(left: RegistryUpdate, right: RegistryUpdate): number {
  return referenceNumber(left.ref) - referenceNumber(right.ref);
}

function referenceNumber(ref: string | undefined): number {
  const match = ref?.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function formatInlineCitations(text: string, references: RegistryUpdate[]): string {
  const referencesByRef = new Map(
    references
      .filter((reference): reference is RegistryUpdate & { ref: string } => !!reference.ref)
      .map((reference) => [reference.ref, reference])
  );

  const formatCitation = (ref: string) => {
    const reference = referencesByRef.get(ref);
    const tribunal = reference?.tribunal?.toUpperCase();
    const label = tribunal ? `${ref} - ${tribunal}` : ref;
    const link = referenceLink(reference);

    return link ? `[${label}](${link})` : `[${label}]`;
  };

  return text
    .replace(CITATION_PATTERN, (_marker, ref: string) => formatCitation(ref))
    .replace(RAW_CITATION_PATTERN, (_marker, ref: string) => formatCitation(ref));
}

function referenceLink(reference: RegistryUpdate | undefined): string | undefined {
  return reference?.precedente?.link_pdf ?? reference?.precedente?.link ?? undefined;
}

function referenceFullText(reference: RegistryUpdate): string | undefined {
  const precedente = reference.precedente;
  if (!precedente) {
    return undefined;
  }

  const ementaFingerprint = comparableLongText(precedente.texto_ementa);
  const candidates = [
    precedente.texto_inteiro_teor,
    precedente.inteiro_teor,
    precedente.textoInteiroTeor,
    precedente.inteiroTeor,
    precedente.full_text,
    precedente.fullText,
    precedente.teor,
    precedente.texto,
    precedente.conteudo,
    precedente.content
  ];

  for (const candidate of candidates) {
    const normalized = normalizeLongText(candidate);
    if (!normalized) {
      continue;
    }

    if (ementaFingerprint && comparableLongText(normalized) === ementaFingerprint) {
      continue;
    }

    return normalized;
  }

  return undefined;
}

function formatJurisprudenciaIaMarkdown(input: {
  query: string;
  sourceUrl: string;
  executedAtIso: string;
  parsed: ParsedStream;
}): string {
  const answer = input.parsed.answer;

  if (answer.length < 40) {
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
    "## Resposta do JurisprudenciaIA",
    "",
    answer,
    "",
    "## Tese principal identificada",
    "",
    summarizeMainThesis(answer),
    ...formatReferences(filterCitedReferences(input.parsed.references, answer)),
    "",
    "## Pontos de cautela",
    "",
    "- Confira o inteiro teor dos precedentes antes de usar em peca, parecer ou minuta.",
    "- Quando o campo \"Inteiro teor\" estiver ausente, valide a fonte no JurisprudenciaIA ou no site oficial do tribunal.",
    "- Verifique se tribunal, data, ementa, inteiro teor e link correspondem ao caso concreto.",
    "- Quando algum metadado estiver ausente, valide a fonte no JurisprudenciaIA ou no site oficial do tribunal."
  ].join("\n");
}

function summarizeMainThesis(answer: string): string {
  const plainText = answer
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = plainText.match(/^(.{80,280}?[.!?])(?:\s|$)/)?.[1] ?? plainText;

  return sentence.length > 360 ? `${sentence.slice(0, 357).trimEnd()}...` : sentence;
}

function filterCitedReferences(references: RegistryUpdate[], answer: string): RegistryUpdate[] {
  const citedRefs = collectCitedReferenceIds(answer);

  if (citedRefs.size === 0) {
    return [];
  }

  return references.filter((reference) => !!reference.ref && citedRefs.has(reference.ref));
}

function collectCitedReferenceIds(answer: string): Set<string> {
  const refs = new Set<string>();

  for (const match of answer.matchAll(MARKDOWN_CITATION_REF_PATTERN)) {
    refs.add(match[1]);
  }

  return refs;
}

function formatReferences(references: RegistryUpdate[]): string[] {
  if (references.length === 0) {
    return [];
  }

  return [
    "",
    "## Precedentes citados",
    "",
    ...references.flatMap((reference) => {
      const ref = reference.ref ?? "sem-ref";
      const title = reference.titulo?.trim();
      const tribunal = reference.tribunal?.toUpperCase();
      const date = formatDate(reference.precedente?.data_julgamento);
      const link = referenceLink(reference);
      const ementa = reference.precedente?.texto_ementa?.trim();
      const inteiroTeor = referenceFullText(reference);
      const missingMetadata: string[] = [];
      const lines = [`### Precedente ${ref}`];

      if (!title) {
        missingMetadata.push("tipo/numero");
      }

      if (!date) {
        missingMetadata.push("data de julgamento");
      }

      if (!link) {
        missingMetadata.push("link");
      }

      if (!ementa) {
        missingMetadata.push("ementa");
      }

      if (!inteiroTeor) {
        missingMetadata.push("inteiro teor");
      }

      lines.push(
        `- Tribunal: ${tribunal ?? "nao informado"}`,
        `- Tipo/numero: ${title ?? "nao informado"}`,
        `- Data de julgamento: ${date ?? "nao informada"}`,
        `- Link: ${link ?? "nao informado"}`,
        `- Ementa: ${ementa ?? "nao informada"}`
      );

      if (inteiroTeor) {
        lines.push("", "#### Inteiro teor", "", inteiroTeor);
      } else {
        lines.push("- Inteiro teor: nao informado pela fonte consultada");
      }

      if (missingMetadata.length > 0) {
        lines.push(`- Metadados ausentes: ${missingMetadata.join(", ")}`);
      }

      return [...lines, ""];
    })
  ];
}

function formatDate(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function normalizeLongText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized || undefined;
}

function comparableLongText(value: string | null | undefined): string | undefined {
  return normalizeLongText(value)?.replace(/\s+/g, " ").toLowerCase();
}
