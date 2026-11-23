import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthContext } from "../auth/auth.service";
import type { DbService } from "../db.service";
import { TicketsService } from "./tickets.service";

const ticketId = "11111111-1111-4111-8111-111111111111";
const support = { userId: "22222222-2222-4222-8222-222222222222", role: "support_staff" } as unknown as AuthContext;

test("support ticket queue is limited to unassigned or self-assigned tickets", async () => {
  let query = "";
  let params: unknown[] = [];
  const db = { pool: { query: async (sql: string, values: unknown[]) => { query = sql; params = values; return { rows: [] }; } } } as unknown as DbService;
  await new TicketsService(db).staffList(support, null);
  assert.match(query, /t\.assignee_id IS NULL OR t\.assignee_id = \$3::uuid/);
  assert.deepEqual(params, [null, true, support.userId]);
});

test("support cannot open a ticket assigned to another staff member", async () => {
  let query = "";
  const db = { pool: { query: async (sql: string) => { query = sql; return { rows: [] }; } } } as unknown as DbService;
  await assert.rejects(
    () => new TicketsService(db).staffGet(support, ticketId),
    (error: { getStatus?: () => number }) => error.getStatus?.() === 404,
  );
  assert.match(query, /t\.assignee_id IS NULL OR t\.assignee_id = \$3::uuid/);
});

test("support cannot post to a ticket assigned to another staff member", async () => {
  const calls: string[] = [];
  const db = {
    tx: async (work: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) =>
      work({ query: async (sql: string) => { calls.push(sql); return { rows: [] }; } }),
  } as unknown as DbService;
  await assert.rejects(
    () => new TicketsService(db).staffPost(support, ticketId, false, { body: "Hello" }, undefined),
    (error: { getStatus?: () => number }) => error.getStatus?.() === 404,
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0], /assignee_id IS NULL OR assignee_id = \$3::uuid/);
});
