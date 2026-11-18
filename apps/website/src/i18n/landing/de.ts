import type { Landing } from "./en";
const de: Landing = {
  header: { login: "Anmelden", start: "Loslegen", language: "Sprache" },
  hero: {
    badge: "Sandbox offen: Testschlüssel sind kostenlos",
    h1: "Schnelle, sichere OTP-Verifizierung per WhatsApp und E-Mail",
    sub: "Eine REST-API zum Senden und Prüfen von Einmalcodes. Testschlüssel erstellen und den ersten Code in wenigen Minuten senden.",
    cta1: "Kostenlos starten", cta2: "API-Dokumentation",
    window: "Code senden", chatName: "OTPProvider", chatNow: "jetzt", sms: "Dein Bestätigungscode lautet", delivered: "Zugestellt",
  },
  strip: {
    title: "Alles, was ein OTP-Ablauf braucht",
    items: ["E-Mail-OTP", "WhatsApp-OTP", "REST-API", "Signierte Webhooks", "Idempotenz-Schlüssel", "Prepaid-Guthaben", "Audit-Log", "MFA für Mitarbeitende"],
  },
  why: {
    title: "Warum OTPProvider?",
    sub: "Verifizierung, die sich nachvollziehen lässt: Jeder Versand, jede Abbuchung und jede Saldoänderung wird protokolliert.",
    items: [
      { t: "Zwei Kanäle, eine API", d: "Senden Sie Codes per E-Mail oder WhatsApp mit derselben Anfrage. Der Kanal wird pro Aufruf gewählt." },
      { t: "Zahlen nur für bestätigte Zustellung", d: "Guthaben wird beim Senden reserviert und erst bei bestätigter Zustellung abgebucht." },
      { t: "Signierte Webhooks", d: "Erhalten Sie signierte Ereignisse auf Ihrem Server, sobald ein Code bestätigt wurde." },
      { t: "Integrierter Missbrauchsschutz", d: "Gehashte Codes, Versuchslimits, Sperren und Ratenbegrenzung pro Empfänger." },
    ],
  },
  plans: {
    title: "Einfache, transparente Pakete",
    sub: "Guthaben aufladen und nur für bestätigte Zustellungen zahlen.",
    unit: "Guthaben-Aufladung", custom: "Individuell", popular: "Am beliebtesten",
    items: [
      { name: "Starter", blurb: "Zum Ausprobieren und für kleine Apps.", features: ["Testschlüssel und Sandbox", "E-Mail-OTP", "Nutzungsbasiert vom Guthaben", "Support-Tickets"], cta: "Loslegen" },
      { name: "Growth", blurb: "Für Produkte mit echtem Registrierungsverkehr.", features: ["Alles aus Starter", "Signierte Webhooks", "WhatsApp-OTP nach Prüfung", "Nutzungs- und Guthaben-Dashboard"], cta: "Loslegen" },
      { name: "Enterprise", blurb: "Für hohe Volumen und besondere Anforderungen.", features: ["Individuelle Volumen", "Schriftlich vereinbarte Preise", "Persönliches Onboarding", "Unterstützung bei Sicherheitsprüfungen"], cta: "Kontakt aufnehmen" },
    ],
    note: "Das Guthaben wird gutgeschrieben, nachdem ein Administrator Ihre Zahlung geprüft hat. Preise pro Nachricht zeigt die Konsole.",
  },
  dev: {
    title: "Von Entwicklern für Entwickler",
    sub: "Vorhersehbares JSON, Idempotenz-Schlüssel und klare Fehlercodes. Testschlüssel senden nie echte Nachrichten.",
    points: ["Senden, prüfen, erneut senden und abbrechen", "Sichere Wiederholungen mit Idempotency-Key", "Die Sandbox liefert den Code zum Testen"],
    docs: "Schnellstart lesen",
  },
  cta: { title: "Jetzt mit dem Versand von OTPs starten", sub: "Sichere Verifizierung für Ihre Plattform, in wenigen Minuten eingerichtet.", signup: "Jetzt registrieren", docs: "Dokumentation lesen" },
  footer: {
    blurb: "Einmalcodes per E-Mail und WhatsApp, auf Korrektheit gebaut.",
    platform: "Plattform", resources: "Ressourcen", company: "Unternehmen", account: "Loslegen",
    quickstart: "Schnellstart", products: "Produkte", pricing: "Preise", security: "Sicherheit",
    terms: "Nutzungsbedingungen", privacy: "Datenschutzerklärung", contact: "Kontakt",
    signup: "Konto erstellen", login: "Anmelden", forgot: "Passwort vergessen", keys: "API-Schlüssel",
    services: "Leistungen", servicesList: "E-Mail-OTP, WhatsApp-OTP, REST-API, Webhooks",
    address: "Adresse", language: "Sprache", rights: "Alle Rechte vorbehalten.",
    status: "Der echte Versand wird pro Konto nach einer Prüfung freigeschaltet.",
    badges: ["Argon2id-Hashing", "Nur anfügbares Hauptbuch", "MFA für Mitarbeitende", "Audit-Log"],
    templateNote: "Die rechtlichen Seiten sind Vorlagen und müssen vor der Nutzung von qualifizierten Juristen geprüft werden.",
  },
  faqTitle: "Klare Antworten",
  faq: [
    { q: "Kann ich heute echte Nachrichten senden?", a: "Sie können alles sofort in der Sandbox testen, ohne dass etwas gesendet oder abgerechnet wird. Der echte Versand wird pro Konto nach Einrichtung und Prüfung freigeschaltet." },
    { q: "Welche Kanäle werden unterstützt?", a: "E-Mail-OTP und WhatsApp-OTP. E-Mail ist der Standardkanal; WhatsApp wird pro Projekt nach einer Prüfung aktiviert." },
    { q: "Wie wird abgerechnet?", a: "Über ein Prepaid-Guthaben in USD und nur bei bestätigter Zustellung. Die Preise legt der Plattform-Administrator fest." },
    { q: "Wer kann mein Guthaben ändern?", a: "Nur ein Administrator, nachdem er den Zahlungseingang unabhängig geprüft hat. Der Support kann weder Einzahlungen freigeben noch Salden ändern." },
  ],
};
export default de;
