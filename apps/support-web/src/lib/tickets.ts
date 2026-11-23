export type Ticket = { id: string; subject: string; status: string; priority: string; requester: string; assignee: string | null; createdAt: string; updatedAt: string; translationEnabled: boolean; customerLanguage: string | null; customerLanguageSource: "detected" | "override" | null };
export type TicketMessage = { id: string; kind: "public" | "internal"; author: string; body: string; translation: string | null; translationLang: string | null; createdAt: string };
export const STATUSES = ["open", "pending_customer", "escalated", "resolved", "closed"] as const;
export const STATUS_LABEL: Record<string, string> = { open: "Open", pending_customer: "Waiting on customer", escalated: "Escalated", resolved: "Resolved", closed: "Closed" };
export const UNAVAILABLE = "Ticketing is not available on this server yet. No tickets are shown because none can be loaded.";
export const LANGS = [["ar", "العربية"], ["en", "English"], ["ru", "Русский"], ["es", "Español"], ["de", "Deutsch"], ["zh", "中文"]] as const;
export type TranslationStatus = { configured: boolean; systemEnabled: boolean; languages: string[]; agent: { allowed: boolean; enabled: boolean; language: string }; available: boolean; unavailableReason: string | null };
export const REASON: Record<string, string> = {
  system_disabled: "Automatic translation is turned off by an Admin.",
  not_configured: "Automatic translation is not configured on the server yet. No messages are translated.",
  agent_not_allowed: "An Admin has not allowed translation for your account.",
  agent_disabled: "Translation is off for you. Turn it on above.",
  conversation_disabled: "Translation is off for this conversation.",
  language_not_enabled: "Your language is not enabled for translation.",
};
