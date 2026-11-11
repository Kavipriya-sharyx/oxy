// 24h customer-service window is closed (free-form messages are not allowed, use a template)
export class WindowClosedError extends Error {
  constructor(message = "The 24-hour customer window is closed: send a template message instead") {
    super(message);
    this.name = "WindowClosedError";
  }
}

// Proactive messages are only allowed 09:00-21:00 IST
export class QuietHoursError extends Error {
  constructor(public readonly nextAllowedAt: Date) {
    super(`Quiet hours: proactive messages are allowed again at ${nextAllowedAt.toISOString()}`);
    this.name = "QuietHoursError";
  }
}

// The message breaks a WhatsApp limit. Never silently truncated.
export class InvalidMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMessageError";
  }
}

export class WhatsappApiError extends Error {
  public readonly retryable: boolean;
  public readonly metaCode?: number;
  public readonly httpStatus?: number;

  constructor(
    message: string,
    opts: { retryable: boolean; metaCode?: number; httpStatus?: number },
  ) {
    super(message);
    this.name = "WhatsappApiError";
    this.retryable = opts.retryable;
    this.metaCode = opts.metaCode;
    this.httpStatus = opts.httpStatus;
  }
}
