export type Ticket = { id: string; subject: string; status: string; priority: string; requester: string; assignee: string | null; createdAt: string; updatedAt: string };
export type TicketMessage = { id: string; kind: "public" | "internal"; author: string; body: string; createdAt: string };
export const STATUSES = ["open", "pending", "solved", "closed"] as const;
export const STATUS_LABEL: Record<string, string> = { open: "Open", pending: "Waiting on customer", solved: "Solved", closed: "Closed" };
export const UNAVAILABLE = "Ticketing is not available on this server yet. No tickets are shown because none can be loaded.";
