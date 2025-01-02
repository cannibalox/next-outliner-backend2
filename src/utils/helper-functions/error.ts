export class BusinessError extends Error {
  public code: number;
  public debugMessage?: string;

  /**
   * @param message will be send to client
   * @param debugMessage will only be logged
   */
  constructor(code: number, message?: string, debugMessage?: string) {
    super(message);
    this.code = code;
    this.debugMessage = debugMessage;
  }
}

export type CaptureErrorResult<T, E> =
  | { type: "ok"; value: T }
  | { type: "err"; error: E };

export const captureError = <T, E extends Error = Error>(
  fn: () => T,
  filter: (err: any) => boolean,
): CaptureErrorResult<T, E> => {
  try {
    const ret = fn();
    return { type: "ok", value: ret };
  } catch (err) {
    if (
      typeof filter === "function" &&
      filter.prototype instanceof Error &&
      err instanceof filter
    ) {
      return { type: "err", error: err as E };
    } else if (typeof filter === "function" && (filter as any)(err)) {
      return { type: "err", error: err as any };
    } else {
      throw err;
    }
  }
};
