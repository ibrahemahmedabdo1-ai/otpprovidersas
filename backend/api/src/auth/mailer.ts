import { Logger } from "@nestjs/common";

export abstract class Mailer {
  abstract sendVerification(to: string, link: string): Promise<void>;
  abstract sendPasswordReset(to: string, link: string): Promise<void>;
}
/** Development only: prints the link to the server console. Never used in production. */
export class ConsoleMailer extends Mailer {
  private log = new Logger("ConsoleMailer");
  async sendVerification(to: string, link: string) { this.log.warn(`DEV MAIL to ${to}: ${link}`); }
  async sendPasswordReset(to: string, link: string) { this.log.warn(`DEV MAIL (password reset) to ${to}: ${link}`); }
}
/** Production placeholder until the Resend adapter is configured: fails loudly instead of pretending to send. */
export class DisabledMailer extends Mailer {
  private log = new Logger("DisabledMailer");
  async sendVerification(to: string) {
    this.log.error("Email provider is not configured; verification email was NOT sent");
    throw new Error("mailer_not_configured");
  }
  async sendPasswordReset(): Promise<void> {
    this.log.error("Email provider is not configured; password reset email was NOT sent");
    throw new Error("mailer_not_configured");
  }
}

/** Resend transactional mail. NOT TESTED against the live service (needs an API key and a verified sending domain). */
export class ResendMailer extends Mailer {
  private log = new Logger("ResendMailer");
  constructor(private readonly apiKey: string, private readonly from: string) { super(); }
  private async send(to: string, subject: string, text: string): Promise<void> {
    // Structural type: the global fetch typings differ between @types/node versions, so only name what we read.
    const res = (await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    })) as unknown as { ok: boolean; status: number };
    if (!res.ok) { this.log.error(`Resend rejected the request with status ${res.status}`); throw new Error("mail_send_failed"); }
  }
  sendVerification(to: string, link: string) {
    return this.send(to, "Verify your email", `Confirm your email address to activate your OTPProvider account:\n\n${link}\n\nThe link works once and expires in 24 hours. If you did not sign up, ignore this message.`);
  }
  sendPasswordReset(to: string, link: string) {
    return this.send(to, "Reset your password", `Use this link to choose a new password:\n\n${link}\n\nIt works once and expires in 1 hour. If you did not ask for it, ignore this message; your password is unchanged.`);
  }
}
