import { Logger } from "@nestjs/common";

export abstract class Mailer {
  abstract sendVerification(to: string, link: string): Promise<void>;
}
/** Development only: prints the link to the server console. Never used in production. */
export class ConsoleMailer extends Mailer {
  private log = new Logger("ConsoleMailer");
  async sendVerification(to: string, link: string) { this.log.warn(`DEV MAIL to ${to}: ${link}`); }
}
/** Production placeholder until the Resend adapter is configured: fails loudly instead of pretending to send. */
export class DisabledMailer extends Mailer {
  private log = new Logger("DisabledMailer");
  async sendVerification(to: string) {
    this.log.error("Email provider is not configured; verification email was NOT sent");
    throw new Error("mailer_not_configured");
  }
}
