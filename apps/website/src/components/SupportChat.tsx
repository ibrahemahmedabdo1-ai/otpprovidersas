"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Locale = "en" | "ar" | "ru" | "es" | "de" | "zh";
type User = { id: string; email: string; name: string; role: string; mfaPending?: boolean };
type Ticket = { id: string; subject: string; status: string; updatedAt: string };
type Message = { id: string; from: "you" | "support"; body: string; createdAt: string };
type Thread = { ticket: Ticket; messages: Message[] };
type Copy = {
  label: string; title: string; subtitle: string; close: string; email: string; password: string;
  signIn: string; signingIn: string; loginHelp: string; register: string; subject: string; message: string;
  start: string; starting: string; newChat: string; previous: string; send: string; sending: string;
  back: string; support: string; you: string; empty: string; loading: string; loginError: string;
  roleError: string; mfa: string; ticketError: string; messageError: string; network: string;
};
const COPY: Record<Locale, Copy> = {
  en: { label:"Chat with support",title:"OTPProvider Support",subtitle:"Send us a message. Our team will reply here.",close:"Close",email:"Email address",password:"Password",signIn:"Sign in",signingIn:"Signing in…",loginHelp:"Sign in to start a secure support conversation.",register:"Create an account",subject:"What do you need help with?",message:"Write your message…",start:"Start conversation",starting:"Starting…",newChat:"New conversation",previous:"Your conversations",send:"Send",sending:"Sending…",back:"Back to conversations",support:"Support",you:"You",empty:"No conversations yet.",loading:"Loading…",loginError:"Could not sign in. Check your details and try again.",roleError:"This account cannot open customer support.",mfa:"Your account requires an extra security check. Finish signing in through the customer portal, then return here.",ticketError:"Could not load this conversation.",messageError:"Could not send your message.",network:"Connection problem. Please try again." },
  ar: { label:"تواصل مع الدعم",title:"دعم OTPProvider",subtitle:"اكتب رسالتك وسيرد عليك فريق الدعم هنا.",close:"إغلاق",email:"البريد الإلكتروني",password:"كلمة المرور",signIn:"تسجيل الدخول",signingIn:"جارٍ تسجيل الدخول…",loginHelp:"سجّل الدخول لبدء محادثة آمنة مع الدعم.",register:"إنشاء حساب",subject:"ما الذي تحتاج المساعدة فيه؟",message:"اكتب رسالتك…",start:"ابدأ المحادثة",starting:"جارٍ البدء…",newChat:"محادثة جديدة",previous:"محادثاتك",send:"إرسال",sending:"جارٍ الإرسال…",back:"العودة للمحادثات",support:"الدعم",you:"أنت",empty:"لا توجد محادثات حتى الآن.",loading:"جارٍ التحميل…",loginError:"تعذر تسجيل الدخول. راجع بياناتك وحاول مرة أخرى.",roleError:"هذا الحساب لا يملك صلاحية محادثة دعم العملاء.",mfa:"حسابك يتطلب تحققًا أمنيًا إضافيًا. أكمل تسجيل الدخول من بوابة العميل ثم ارجع إلى هنا.",ticketError:"تعذر تحميل المحادثة.",messageError:"تعذر إرسال رسالتك.",network:"مشكلة في الاتصال. حاول مرة أخرى." },
  ru: { label:"Чат с поддержкой",title:"Поддержка OTPProvider",subtitle:"Напишите нам — команда ответит здесь.",close:"Закрыть",email:"Электронная почта",password:"Пароль",signIn:"Войти",signingIn:"Вход…",loginHelp:"Войдите, чтобы начать защищённый чат.",register:"Создать аккаунт",subject:"Чем мы можем помочь?",message:"Введите сообщение…",start:"Начать чат",starting:"Создание…",newChat:"Новый чат",previous:"Ваши обращения",send:"Отправить",sending:"Отправка…",back:"К обращениям",support:"Поддержка",you:"Вы",empty:"Обращений пока нет.",loading:"Загрузка…",loginError:"Не удалось войти. Проверьте данные.",roleError:"Этот аккаунт не может открыть чат клиента.",mfa:"Требуется дополнительная проверка. Завершите вход в клиентском портале и вернитесь.",ticketError:"Не удалось загрузить чат.",messageError:"Не удалось отправить сообщение.",network:"Ошибка соединения. Попробуйте ещё раз." },
  es: { label:"Hablar con soporte",title:"Soporte OTPProvider",subtitle:"Escríbenos y el equipo responderá aquí.",close:"Cerrar",email:"Correo electrónico",password:"Contraseña",signIn:"Iniciar sesión",signingIn:"Iniciando…",loginHelp:"Inicia sesión para abrir una conversación segura.",register:"Crear una cuenta",subject:"¿En qué podemos ayudarte?",message:"Escribe tu mensaje…",start:"Iniciar conversación",starting:"Creando…",newChat:"Nueva conversación",previous:"Tus conversaciones",send:"Enviar",sending:"Enviando…",back:"Volver a conversaciones",support:"Soporte",you:"Tú",empty:"Aún no hay conversaciones.",loading:"Cargando…",loginError:"No se pudo iniciar sesión. Comprueba tus datos.",roleError:"Esta cuenta no puede abrir el soporte de clientes.",mfa:"Tu cuenta requiere una verificación adicional. Completa el acceso en el portal y vuelve aquí.",ticketError:"No se pudo cargar la conversación.",messageError:"No se pudo enviar el mensaje.",network:"Problema de conexión. Inténtalo de nuevo." },
  de: { label:"Support kontaktieren",title:"OTPProvider Support",subtitle:"Schreib uns. Unser Team antwortet hier.",close:"Schließen",email:"E-Mail-Adresse",password:"Passwort",signIn:"Anmelden",signingIn:"Anmeldung…",loginHelp:"Melde dich an, um einen sicheren Support-Chat zu starten.",register:"Konto erstellen",subject:"Wobei können wir helfen?",message:"Nachricht schreiben…",start:"Gespräch starten",starting:"Wird erstellt…",newChat:"Neues Gespräch",previous:"Deine Gespräche",send:"Senden",sending:"Wird gesendet…",back:"Zurück zu Gesprächen",support:"Support",you:"Du",empty:"Noch keine Gespräche.",loading:"Laden…",loginError:"Anmeldung fehlgeschlagen. Prüfe deine Daten.",roleError:"Dieses Konto kann keinen Kunden-Support öffnen.",mfa:"Dein Konto benötigt eine zusätzliche Sicherheitsprüfung. Melde dich im Kundenportal vollständig an und kehre zurück.",ticketError:"Gespräch konnte nicht geladen werden.",messageError:"Nachricht konnte nicht gesendet werden.",network:"Verbindungsproblem. Bitte erneut versuchen." },
  zh: { label:"联系支持",title:"OTPProvider 客服",subtitle:"发送消息，客服团队将在这里回复。",close:"关闭",email:"电子邮箱",password:"密码",signIn:"登录",signingIn:"正在登录…",loginHelp:"登录后即可开始安全的客服对话。",register:"创建账户",subject:"您需要什么帮助？",message:"输入消息…",start:"开始对话",starting:"正在创建…",newChat:"新对话",previous:"您的对话",send:"发送",sending:"正在发送…",back:"返回对话列表",support:"客服",you:"你",empty:"暂无对话。",loading:"加载中…",loginError:"登录失败，请检查账号信息。",roleError:"此账户无法使用客户支持。",mfa:"账户需要额外安全验证。请先在客户门户完成登录，然后返回此处。",ticketError:"无法加载此对话。",messageError:"无法发送消息。",network:"网络连接问题，请重试。" },
};

async function request<T>(path: string, method = "GET", body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(`/api${path}`, { method, credentials:"same-origin", cache:"no-store", headers: body === undefined ? {} : { "content-type":"application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    let data: T | null = null;
    if (res.status !== 204) { try { data = await res.json() as T; } catch { data = null; } }
    return { ok:res.ok, status:res.status, data };
  } catch { return { ok:false, status:0, data:null }; }
}

export default function SupportChat({ locale, registerUrl }: { locale: Locale; registerUrl: string }) {
  const c = COPY[locale];
  const rtl = locale === "ar";
  const [open,setOpen] = useState(false);
  const [user,setUser] = useState<User | null>(null);
  const [checking,setChecking] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [tickets,setTickets] = useState<Ticket[]>([]);
  const [ticketId,setTicketId] = useState("");
  const [thread,setThread] = useState<Thread | null>(null);
  const [subject,setSubject] = useState("");
  const [draft,setDraft] = useState("");

  const loadTickets = useCallback(async () => {
    const r = await request<Ticket[]>("/v1/console/tickets");
    if (r.ok && r.data) setTickets(r.data);
    else setError(r.status === 0 ? c.network : c.ticketError);
  }, [c]);

  const loadThread = useCallback(async (id: string) => {
    const r = await request<Thread>(`/v1/console/tickets/${encodeURIComponent(id)}`);
    if (r.ok && r.data) setThread(r.data);
    else setError(r.status === 0 ? c.network : c.ticketError);
  }, [c]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setChecking(true); setError("");
    void request<User>("/v1/auth/me").then(async r => {
      if (!alive) return;
      if (r.ok && r.data?.role === "customer" && !r.data.mfaPending) { setUser(r.data); await loadTickets(); }\n      else if (r.ok && r.data?.mfaPending) setError(c.mfa);
      else if (r.ok) setError(c.roleError);
      setChecking(false);
    });
    return () => { alive = false; };
  }, [open, loadTickets, c.roleError]);

  useEffect(() => {
    if (!open || !ticketId) return;
    void loadThread(ticketId);
    const timer = window.setInterval(() => void loadThread(ticketId), 5000);
    return () => window.clearInterval(timer);
  }, [open,ticketId,loadThread]);

  async function signIn(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const r = await request<{user:User;mfa?:{required:boolean}}>("/v1/auth/login","POST",{email:email.trim(),password});
    setBusy(false);
    if (!r.ok || !r.data) { setError(r.status === 0 ? c.network : c.loginError); return; }
    if (r.data.mfa?.required) { setError(c.mfa); return; }
    if (r.data.user.role !== "customer") { setError(c.roleError); return; }
    setUser(r.data.user); setPassword(""); await loadTickets();
  }

  async function createTicket(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const r = await request<{id:string}>("/v1/console/tickets","POST",{subject:subject.trim(),body:draft.trim()});
    setBusy(false);
    if (!r.ok || !r.data?.id) { setError(r.status === 0 ? c.network : c.ticketError); return; }
    setSubject(""); setDraft(""); setTicketId(r.data.id); await loadTickets(); await loadThread(r.data.id);
  }

  async function sendReply(e: FormEvent) {
    e.preventDefault(); if (!ticketId || !draft.trim()) return;
    setBusy(true); setError("");
    const r = await request<{ok:boolean}>(`/v1/console/tickets/${encodeURIComponent(ticketId)}/reply`,"POST",{body:draft.trim()});
    setBusy(false);
    if (!r.ok) { setError(r.status === 0 ? c.network : c.messageError); return; }
    setDraft(""); await loadThread(ticketId); await loadTickets();
  }

  function close() { setOpen(false); setError(""); setTicketId(""); setThread(null); }
  return (
    <>
      <button type="button" className="support-bubble" onClick={() => setOpen(true)} aria-label={c.label} title={c.label}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        <span>{c.label}</span><i className="support-bubble__ping" aria-hidden="true" />
      </button>
      {open && <div className="support-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        <section className="support-modal" role="dialog" aria-modal="true" aria-labelledby="support-chat-title" dir={rtl ? "rtl" : "ltr"}>
          <header className="support-modal-head">
            <div><strong id="support-chat-title">{c.title}</strong><small>{c.subtitle}</small></div>
            <button type="button" className="support-close" onClick={close} aria-label={c.close}>×</button>
          </header>
          <div className="support-modal-body">
            {error && <p className="support-error" role="alert">{error}</p>}
            {checking ? <p className="support-muted">{c.loading}</p> : !user ? (
              <form className="support-form" onSubmit={signIn}>
                <p>{c.loginHelp}</p>
                <label>{c.email}<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
                <label>{c.password}<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} /></label>
                <button className="support-submit" disabled={busy}>{busy ? c.signingIn : c.signIn}</button>
                <a href={registerUrl} target="_blank" rel="noreferrer">{c.register}</a>
              </form>
            ) : ticketId && thread ? (
              <div className="support-thread">
                <button type="button" className="support-back" onClick={()=>{setTicketId("");setThread(null);setDraft("");void loadTickets();}}>← {c.back}</button>
                <h3>{thread.ticket.subject}</h3>
                <div className="support-messages" aria-live="polite">
                  {thread.messages.map(m=><article key={m.id} className={m.from === "you" ? "support-msg mine" : "support-msg"}><b>{m.from === "you" ? c.you : c.support}</b><p>{m.body}</p><time>{new Date(m.createdAt).toLocaleString(locale)}</time></article>)}
                </div>
                <form className="support-reply" onSubmit={sendReply}><textarea value={draft} onChange={e=>setDraft(e.target.value)} placeholder={c.message} maxLength={5000} rows={3} required /><button className="support-submit" disabled={busy || !draft.trim()}>{busy ? c.sending : c.send}</button></form>
              </div>
            ) : user ? (
              <div className="support-start">
                <div className="support-user">{user.email}</div>
                <h3>{c.previous}</h3>
                {tickets.length ? <ul className="support-ticket-list">{tickets.map(t=><li key={t.id}><button type="button" onClick={()=>setTicketId(t.id)}><span>{t.subject}</span><small>{t.status}</small></button></li>)}</ul> : <p className="support-muted">{c.empty}</p>}
                <form className="support-form" onSubmit={createTicket}>
                  <h3>{c.newChat}</h3>
                  <label>{c.subject}<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength={150} minLength={3} required /></label>
                  <label>{c.message}<textarea value={draft} onChange={e=>setDraft(e.target.value)} maxLength={5000} rows={4} required /></label>
                  <button className="support-submit" disabled={busy || subject.trim().length<3 || !draft.trim()}>{busy ? c.starting : c.start}</button>
                </form>
              </div>
            ) : null}
          </div>
        </section>
      </div>}
    </>
  );
}
