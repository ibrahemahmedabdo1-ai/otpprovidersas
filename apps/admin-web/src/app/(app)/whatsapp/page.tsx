"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Empty, Loading } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useApp } from "../../../components/Providers";

type Device = { id: string; label: string; state: string; routingEligible: boolean; lastActivityAt: string | null };
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
  async function send() {
    setBusy(true); setErr(""); setMsg(""); setRc(null);
    const r = await api<{ messageId: string | null; note: string }>("POST", "/v1/admin/whatsapp/test-send", { to, deviceId, message: text });
    setBusy(false);
    if (r.ok && r.data) { setMsg("Accepted by WhatsApp (message " + (r.data.messageId ?? "unknown") + "). Accepted is not delivered: check receipts below."); if (r.data.messageId) void check(r.data.messageId); }
    else setErr(ERR[(r.data as unknown as { error?: string })?.error ?? ""] ?? "The test message was not sent.");
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
            <label>Device <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>{devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <label>Recipient (digits with country code) <input value={to} onChange={(e) => setTo(e.target.value)} inputMode="numeric" autoComplete="off" /></label>
            <label>Message <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} /></label>
            <button type="submit" disabled={busy || !to || !text || !deviceId}>{busy ? "Sending…" : "Send test message"}</button>
          </form>
          {rc && (<><h2>Delivery receipts</h2>
            {rc.events.length === 0 ? <p className="muted">No receipt yet. Check again shortly.</p> : <ul>{rc.events.map((e, i) => <li key={i}>{e.status} at {e.at}</li>)}</ul>}
            <button type="button" onClick={() => void check(rc.messageId)}>Refresh receipts</button></>)}
        </>
      )}
    </>
  );
}
