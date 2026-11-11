export interface Candidate {
  id: string; channel: "email" | "whatsapp"; enabled: boolean; maintenance: boolean; priority: number; weight: number;
  costMicroUsd: number; successRate: number; p95LatencyMs: number; capacityRemaining: number;
  circuit: "closed" | "open" | "half_open"; health: "healthy" | "degraded" | "down" | "unknown";
  countries?: string[]; routingEligible?: boolean;
}
export interface Weights { reliability: number; latency: number; cost: number; priority: number }
export const BALANCED: Weights = { reliability: 0.4, latency: 0.2, cost: 0.25, priority: 0.15 };
export interface Decision {
  chosen: string | null;
  considered: { id: string; excluded?: string; score?: number }[];
  explanation: string;
}

/** Deterministic, explainable selection. Every exclusion has a reason; the result is stored with the delivery. */
export function selectProvider(cands: Candidate[], req: { channel: "email" | "whatsapp"; country?: string; override?: string; failed?: string[] },
  w: Weights = BALANCED): Decision {
  const considered: Decision["considered"] = [];
  const ok: Candidate[] = [];
  for (const c of cands) {
    const why =
      c.channel !== req.channel ? "wrong channel" :
      !c.enabled ? "disabled" :
      c.maintenance ? "maintenance" :
      c.routingEligible === false ? "not routing-eligible" :
      c.circuit === "open" ? "circuit open" :
      c.health === "down" ? "health down" :
      c.capacityRemaining <= 0 ? "no capacity" :
      (req.failed ?? []).includes(c.id) ? "already failed for this request" :
      (c.countries && req.country && !c.countries.includes(req.country)) ? "country not eligible" : undefined;
    if (why) considered.push({ id: c.id, excluded: why }); else ok.push(c);
  }
  if (req.override) {
    const o = ok.find((c) => c.id === req.override);
    if (o) return { chosen: o.id, considered, explanation: `manual override to ${o.id}` };
  }
  if (!ok.length) return { chosen: null, considered, explanation: "no eligible provider" };
  const maxCost = Math.max(...ok.map((c) => c.costMicroUsd), 1), maxLat = Math.max(...ok.map((c) => c.p95LatencyMs), 1);
  const maxPri = Math.max(...ok.map((c) => c.priority), 1);
  const scored = ok.map((c) => {
    const degraded = c.health === "degraded" ? 0.8 : 1;
    const score = degraded * (w.reliability * c.successRate + w.latency * (1 - c.p95LatencyMs / maxLat) +
      w.cost * (1 - c.costMicroUsd / maxCost) + w.priority * (1 - c.priority / (maxPri + 1))) * Math.max(c.weight, 0) / 100;
    return { c, score };
  }).sort((a, b) => b.score - a.score || a.c.priority - b.c.priority || a.c.id.localeCompare(b.c.id));
  for (const s of scored) considered.push({ id: s.c.id, score: Number(s.score.toFixed(4)) });
  return { chosen: scored[0]!.c.id, considered, explanation: `balanced score selected ${scored[0]!.c.id} among ${scored.length} eligible` };
}

/** Circuit breaker: opens after N consecutive failures, half-opens after cooldown. */
export class CircuitBreaker {
  state: "closed" | "open" | "half_open" = "closed"; private fails = 0; private openedAt = 0;
  private threshold: number; private cooldownMs: number; private clock: () => number;
  constructor(threshold = 5, cooldownMs = 30_000, clock: () => number = Date.now) { this.threshold = threshold; this.cooldownMs = cooldownMs; this.clock = clock; }
  allow(): boolean {
    if (this.state === "open" && this.clock() - this.openedAt >= this.cooldownMs) this.state = "half_open";
    return this.state !== "open";
  }
  success() { this.fails = 0; this.state = "closed"; }
  failure() { this.fails++; if (this.state === "half_open" || this.fails >= this.threshold) { this.state = "open"; this.openedAt = this.clock(); } }
}
