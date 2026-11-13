export type Queryable = { query(text: string, values?: unknown[]): Promise<unknown> };

/** Append-only audit record (the table rejects UPDATE/DELETE). Parameters are explicitly cast so Postgres never has to guess types. */
export async function writeAudit(q: Queryable, e: { actorId: string | null; action: string; subjectType: string; subjectId: string; ip: string | null; meta?: Record<string, unknown> }) {
  await q.query(
    "INSERT INTO audit_events(actor_id, action, subject_type, subject_id, ip, metadata) VALUES ($1::uuid,$2::text,$3::text,$4::text,$5::inet,$6::jsonb)",
    [e.actorId, e.action, e.subjectType, e.subjectId, e.ip, JSON.stringify(e.meta ?? {})]);
}
