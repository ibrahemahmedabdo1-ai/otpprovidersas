import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthContext } from "../auth/auth.service";
import type { DbService } from "../db.service";
import { SupportDepositsService } from "./support-deposits.service";

const depositId = "33333333-3333-4333-8333-333333333333";
const ticketId = "44444444-4444-4444-8444-444444444444";
const support = { userId: "22222222-2222-4222-8222-222222222222", role: "support_staff" } as unknown as AuthContext;

test("support top-up queue only exposes unassigned or self-assigned tickets", async () => {
  let query = "";
  let params: unknown[] = [];
  const db = { pool: { query: async (sql: string, values: unknown[]) => { query = sql; params = values; return { rows: [] }; } } } as unknown as DbService;
  await new SupportDepositsService(db).list(support);
  assert.match(query, /t\.assignee_id IS NULL OR t\.assignee_id = \$2::uuid/);
  assert.deepEqual(params, [true, support.userId]);
});

test("support cannot submit evidence for another agent's assigned top-up", async () => {
  const calls: string[] = [];
  const db = {
    tx: async (work: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
      work({ query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes("SELECT ticket_id FROM deposits")) return { rows: [{ ticket_id: ticketId }] };
        if (sql.includes("SELECT id FROM tickets")) return { rows: [] };
        throw new Error("Unexpected query in test");
      } }),
  } as unknown as DbService;
  await assert.rejects(
    () => new SupportDepositsService(db).submit(support, depositId, { evidenceNote: "Transfer slip verified" }),
    (error: { getStatus?: () => number }) => error.getStatus?.() === 404,
  );
  assert.equal(calls.length, 2);
  assert.match(calls[1] ?? "", /assignee_id IS NULL OR assignee_id = \$2::uuid/);
});
