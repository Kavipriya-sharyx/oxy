// 24h customer-service window is closed (free-form messages are not allowed, use a template)
export class WindowClosedError extends Error {
  constructor(message = "The 24-hour customer window is closed: send a template message instead") {
    super(message);
    this.name = "WindowClosedError";
  }
}

// Meta's per-user marketing-message limit (131049, India): not delivered, never retried the same day
// (Playbook 15.1, Trigger layer 12: log as frequency_cap)
export const FREQUENCY_CAP_CODES = [131049];
export class FrequencyCapError extends Error {
  constructor(message = "Meta's marketing-message limit for this user: not delivered (frequency_cap)") {
    super(message);
    this.name = "FrequencyCapError";
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
