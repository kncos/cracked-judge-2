export type CrackedErrorCode =
  | "REDIS_ERROR"
  | "ISOLATE_ERROR"
  | "PARSE_ERROR"
  | "OTHER";

export class CrackedError extends Error {
  public override readonly name: string = "CrackedError" as const;

  constructor(
    public readonly code: CrackedErrorCode,
    opts?: {
      message?: string;
      cause?: unknown;
    },
  ) {
    const { message = `CrackedError: ${code}`, cause } = opts || {};
    super(message, { cause });
  }
}
