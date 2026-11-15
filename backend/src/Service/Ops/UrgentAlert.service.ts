import { Injectable, Logger } from "@nestjs/common";
import { TaskType } from "@Helper/Enum/TaskType";

// Full Plan 12.7: an emergency, a self-harm message or another urgent case alerts the sales team at once, not only
// as a row in the Escalations list. Inside the console a banner, a sound and a desktop notification show it
// (GET /Console/UrgentAlerts); outside it this posts one message to SAFETY_ALERT_WEBHOOK_URL (else
// ALERT_WEBHOOK_URL): Slack / Teams / Google Chat style JSON {"text": ...}.
// No health detail and no full number leave the system: the alert says what kind of case it is, the first name,
// the last 4 digits and where to open it in the console.

export const URGENT_LABEL: Record<string, string> = {
  [TaskType.Emergency]: "Medical emergency reported",
  [TaskType.SelfHarm]: "Self-harm risk reported",
  [TaskType.Escalation]: "Urgent complaint or payment dispute",
  [TaskType.PaymentIssue]: "Urgent payment issue",
};

export const urgentLabel = (type: string) => URGENT_LABEL[type] ?? "Urgent case";

/** "…2345": enough for the team to recognise the chat, not a number to share outside */
export const maskNumber = (wa?: string | null) => (wa ? `…${String(wa).slice(-4)}` : "");

export function alertText(
  t: { type: string },
  c: { first_name?: string | null; wa_number?: string | null },
  consoleUrl?: string | null,
): string {
  const who = [c.first_name?.trim() || "Customer", maskNumber(c.wa_number)]
    .filter(Boolean)
    .join(" ");
  const base = (consoleUrl || "").replace(/\/+$/, "");
  // the link carries no number: the console (after sign-in) shows who it is
  const link = base ? ` Open: ${base}/escalations` : "";
  const what =
    t.type === TaskType.Emergency
      ? "The bot sent 112 / 108 and paused sales. Call the customer now."
      : t.type === TaskType.SelfHarm
        ? "The bot sent Tele-MANAS 14416 and paused sales. Call the customer now."
        : "A person must call back.";
  return `URGENT (Oxxy WhatsApp): ${urgentLabel(t.type)}. ${who}. ${what}${link}`;
}

@Injectable()
export class UrgentAlertService {
  private readonly logger = new Logger(UrgentAlertService.name);

  /** One alert per urgent task (the caller creates each task once). Never throws: the customer's reply comes first. */
  async notify(
    t: { id?: string; type: string },
    c: { first_name?: string | null; wa_number?: string | null },
  ): Promise<boolean> {
    const text = alertText(t, c, process.env.CONSOLE_URL);
    this.logger.error(text);
    const url = (
      process.env.SAFETY_ALERT_WEBHOOK_URL ||
      process.env.ALERT_WEBHOOK_URL ||
      ""
    ).trim();
    if (!url || process.env.NODE_ENV === "test") return false;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch (e) {
      this.logger.warn(`urgent alert webhook failed: ${(e as Error).message}`);
      return false;
    }
  }
}
