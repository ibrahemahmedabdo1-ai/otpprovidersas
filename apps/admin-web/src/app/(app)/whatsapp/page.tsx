"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useApp } from "../../../components/Providers";

type Device = { id: string; label: string; state: string; routingEligible: boolean; lastActivityAt: string | null };
type Job = { jobId: string; status: "queued" | "sending" | "accepted" | "failed" | "unknown"; messageId: string | null; error: string | null; note?: string };
type Receipt = { messageId: string; events: { status: string; at: string }[] };
const ERR: Record<string, string> = {
  gateway_token_not_configured: "The API has no WA_GATEWAY_TOKEN yet. Add it in the API project settings.",
  gateway_url_not_configured: "The WhatsApp provider has no gateway address configured.",
  gateway_unreachable: "The WhatsApp gateway did not answer. Try again in a minute.",
  recipient_not_allowlisted: "This number is not on the test allow-list.",
  recipient_allowlist_not_configured: "Test sending is blocked until the Admin test-recipient allow-list is configured.",
  rate_limited: "Too many test sends. Wait a few minutes.",
  device_not_connected: "The selected device is not connected.",
  whatsapp_route_unavailable: "No connected device is explicitly enabled for customer routing.",
  admin_test_sending_disabled: "Test sending is switched off on the gateway.",
  receipts_endpoint_not_deployed: "The gateway has not been updated to record delivery receipts yet.",
  validation_failed: "Check the number, device and message (1-200 characters).",
  forbidden: "Only Admin and Super Admin can use this page.",
  gateway_did_not_start: "The gateway never started this send, so nothing was sent. You can try again.",
  gateway_restarted: "The gateway restarted while sending. The message may have been sent; do not resend, check the phone and receipts.",
  sending_outcome_unknown: "No result came back. The message may have been sent; do not resend, check the phone and receipts.",
  send_outcome_unknown: "WhatsApp did not confirm the send. The message may have been sent; do not resend, check the phone and receipts.",
  provider_message_id_missing: "WhatsApp gave no message id. The message may have been sent; do not resend.",
  recipient_not_registered_on_whatsapp: "That number is not registered on WhatsApp.",
  whatsapp_recipient_lookup_failed: "Could not look up the recipient on WhatsApp. Nothing was sent.",
  signal_session_refresh_failed: "Could not refresh the secure session with the recipient. Nothing was sent.",
  recipient_not_allowlisted_or_invalid: "The gateway refused this recipient.",
};

export default function WhatsAppPage() {
  const { user } = useApp();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [deviceId, setDeviceId] = useState(""); const [to, setTo] = useState(""); const [text, setText] = useState("OTPProvider test message");
  const [rc, setRc] = useState<Receipt | null>(null);
  const load = useCallback(async () => {
    const r = await api<Device[]>("GET", "/v1/admin/whatsapp/devices");
    if (r.ok && r.data) { setDevices(r.data); setErr(""); if (!deviceId && r.data[0]) setDeviceId(r.data[0].id); }
    else { setDevices([]); setErr(ERR[(r.data as unknown as { error?: string })?.error ?? ""] ?? "Could not load devices."); }
  }, [deviceId]);
  useEffect(() => { void load(); }, [load]);
  async function setRouting(d: Device) {
    setErr(""); setMsg("");
    const r = await api<{ routingEligible: boolean }>("PATCH", "/v1/admin/whatsapp/devices/" + encodeURIComponent(d.id) + "/routing", { enabled: !d.routingEligible });
    if (r.ok) { setMsg(!d.routingEligible ? "Device enabled for customer routing. Customer sending still requires separate release gates." : "Device removed from customer routing."); await load(); }
    else setErr(ERR[(r.data as unknown as { error?: string })?.error ?? ""] ?? "Could not update routing eligibility.");
  }
  // One idempotency key per user action: a retry of the same request can never send a second message.
  const requestIdRef = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [job, setJob] = useState<Job | null>(null);
  function show(j: Job) {
    setJob(j);
    if (j.status === "accepted") setMsg("Accepted by WhatsApp (message " + (j.messageId ?? "unknown") + "). Accepted is not delivered: check receipts below.");
    else if (j.status === "failed" || j.status === "unknown") setErr(ERR[j.error ?? ""] ?? (j.status === "unknown" ? "The outcome is unknown. Do not resend; check the phone and receipts." : "The test message was not sent."));
  }
  async function follow(jobId: string) {
    for (let i = 0; i < 45 && alive.current; i++) {
      const r = await api<Job>("GET", "/v1/admin/whatsapp/test-jobs/" + encodeURIComponent(jobId));
      if (!alive.current) return;
      if (r.ok && r.data) {
        setJob(r.data);
        if (r.data.status === "accepted" || r.data.status === "failed" || r.data.status === "unknown") {
          requestIdRef.current = null; show(r.data);
          if (r.data.status === "accepted" && r.data.messageId) void check(r.data.messageId);
          return;
        }
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
    if (alive.current) setMsg("Still waiting for the gateway. The send is in progress; refresh this page later. Do not resend.");
  }
  async function send() {
    setBusy(true); setErr(""); setMsg(""); setRc(null); setJob(null);
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const r = await api<Job>("POST", "/v1/admin/whatsapp/test-send", { to, deviceId, message: text, requestId: requestIdRef.current });
    if (r.ok && r.data) { setJob(r.data); await follow(r.data.jobId); }
    else { setErr(ERR[(r.data as unknown as { error?: string })?.error ?? ""] ?? "The test message was not queued."); }
    setBusy(false);
  }
  async function check(messageId: string) {
    const r = await api<Receipt>("GET", "/v1/admin/whatsapp/receipts/" + encodeURIComponent(messageId));
    if (r.ok && r.data) setRc(r.data); else setErr(ERR[(r.data as unknown as { error?: string })?.error ?? ""] ?? "Could not read receipts.");
  }
  return (
    <>
      <div className="pagehead"><h1>WhatsApp</h1><p>Linked devices and admin test sends to allow-listed numbers only. Customer sending stays disabled until delivery receipts and billing are verified.</p></div>
      {err && <Alert kind="error">{err}</Alert>}
      {msg && <Alert kind="ok">{msg}</Alert>}
      {devices === null ? <Loading /> : devices.length === 0 ? <Empty title="No devices" body="No linked device was returned by the gateway." /> : (
        <>
          <div className="tablewrap"><table>
            <thead><tr><th scope="col">Device</th><th scope="col">State</th><th scope="col">Customer route</th><th scope="col">Last activity</th></tr></thead>
            <tbody>{devices.map((d) => <tr key={d.id}><td>{d.label}</td><td>{d.state}</td><td>{d.routingEligible ? "Eligible" : "Disabled"} {user?.role === "super_admin" && <button type="button" className="btn small" disabled={d.state !== "connected"} onClick={() => void setRouting(d)}>{d.routingEligible ? "Disable route" : "Enable route"}</button>}</td><td>{d.lastActivityAt ?? "-"}</td></tr>)}</tbody>
          </table></div>
          <h2>Test send</h2>
          <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <label>Device <select value={deviceId} onChange={(e) => { requestIdRef.current = null; setDeviceId(e.target.value); }}>{devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <label>Recipient (digits with country code) <input value={to} onChange={(e) => { requestIdRef.current = null; setTo(e.target.value); }} inputMode="numeric" autoComplete="off" /></label>
            <label>Message <input value={text} maxLength={200} onChange={(e) => { requestIdRef.current = null; setText(e.target.value); }} /></label>
            <button type="submit" disabled={busy || !to || !text || !deviceId}>{busy ? "Sending…" : "Send test message"}</button>
            {job && <p className="muted" role="status">Status: {job.status}{job.note ? " — " + job.note : ""}</p>}
          </form>
          {rc && (<><h2>Delivery receipts</h2>
            {rc.events.length === 0 ? <p className="muted">No receipt yet. Check again shortly.</p> : <ul>{rc.events.map((e, i) => <li key={i}>{e.status} at {e.at}</li>)}</ul>}
            <button type="button" onClick={() => void check(rc.messageId)}>Refresh receipts</button></>)}
        </>
      )}
    </>
  );
}
