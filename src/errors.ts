export type OperationalErrorCode =
  | "invalid_query"
  | "site_unavailable"
  | "captcha_or_bot_challenge"
  | "timeout"
  | "no_result_detected"
  | "extraction_failed"
  | "browser_command_failed"
  | "rate_limited";

export class OperationalError extends Error {
  readonly code: OperationalErrorCode;
  readonly details: string | undefined;

  constructor(code: OperationalErrorCode, message: string, details?: string) {
    super(message);
    this.name = "OperationalError";
    this.code = code;
    this.details = details;
  }
}

export function isOperationalError(error: unknown): error is OperationalError {
  return error instanceof OperationalError;
}
