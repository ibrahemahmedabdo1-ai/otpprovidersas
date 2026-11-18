import type { Dict } from "./en";
const de: Dict = {
  site: { name: "OTPProvider", tagline: "API für Einmalcodes per E-Mail und WhatsApp" },
  common: { skip: "Zum Inhalt springen", language: "Sprache", console: "Konsole öffnen", docs: "Schnellstart für Entwickler", rights: "Alle Rechte vorbehalten.", templateNote: "Die Rechtsseiten sind Vorlagen und müssen vor der Nutzung von einer qualifizierten Rechtsberatung geprüft werden.", sandbox: "Nur Sandbox. Echter Versand ist noch nicht aktiviert." },
  nav: { products: "Produkte", developers: "Entwickler", pricing: "Preise", security: "Sicherheit", legal: "Rechtliches" },
  meta: {
    home: { title: "OTPProvider: OTP-API per E-Mail und WhatsApp für Entwickler", description: "Senden und prüfen Sie Einmalcodes per E-Mail und WhatsApp mit einer einfachen REST-API, einem Prepaid-USD-Guthaben und einem unveränderlichen Hauptbuch. Sandbox jetzt verfügbar." },
    products: { title: "Email-OTP und WhatsApp-OTP Produkte | OTPProvider", description: "Email-OTP über eine verifizierte Absenderdomain und WhatsApp-OTP im QR-Geräte-Modus, mit klar benannten Grenzen und Risiken." },
    developers: { title: "OTP-API Schnellstart: Codes senden und prüfen | OTPProvider", description: "Testschlüssel erstellen, Code mit POST /v1/otp/send senden, mit POST /v1/otp/verify prüfen und Idempotency-Key sicher verwenden." },
    pricing: { title: "Preise und Abrechnungsmodell | OTPProvider", description: "Prepaid-USD-Guthaben, Abrechnung nur bei bestätigter Zustellung, manuelle Einzahlungen, die ein Administrator prüft. Tarife werden nach der Konfiguration veröffentlicht." },
    security: { title: "Sicherheitsmaßnahmen | OTPProvider", description: "Argon2id-Passwörter, gehashte API-Schlüssel, ein Append-only-Hauptbuch, verpflichtende MFA für Mitarbeiter, Schutz vor Brute-Force und protokollierte Admin-Aktionen." },
    legalTerms: { title: "Nutzungsbedingungen (Vorlage) | OTPProvider", description: "Vorlage der Nutzungsbedingungen. Vor der Verwendung rechtlich prüfen lassen." },
    legalPrivacy: { title: "Datenschutzerklärung (Vorlage) | OTPProvider", description: "Vorlage der Datenschutzerklärung. Vor der Verwendung rechtlich prüfen lassen." },
  },
  home: {
    badge: "Sandbox jetzt verfügbar",
    h1: "Einmalcodes per E-Mail und WhatsApp, auf Korrektheit gebaut.",
    sub: "Eine REST-API zum Senden und Prüfen von OTPs, ein Prepaid-USD-Guthaben und ein unveränderliches Hauptbuch. Sie zahlen nur für bestätigte Zustellungen.",
    cta1: "Konsole öffnen", cta2: "Schnellstart lesen",
    featuresTitle: "Was Sie bekommen",
    features: [
      { t: "Einfache REST-API", d: "Senden, prüfen, erneut senden und stornieren mit vorhersehbarem JSON, Idempotenzschlüsseln und klaren Fehlercodes." },
      { t: "Ehrliche Abrechnung", d: "Guthaben wird beim Senden reserviert und erst bei bestätigter Zustellung belastet. Unklare Ergebnisse werden abgeglichen, nie blind erneut gesendet." },
      { t: "Gegen Missbrauch gebaut", d: "Codes werden als Hashes gespeichert, Versuche sind begrenzt, Anfragen sperren nach wiederholten Fehleingaben und Empfänger sind ratenbegrenzt." },
    ],
    faqTitle: "Klare Antworten",
    faq: [
      { q: "Kann ich heute echte Nachrichten senden?", a: "Noch nicht. Die Sandbox funktioniert komplett, ohne etwas zu senden oder abzurechnen. Echter Versand wird nach Provider-Einrichtung und Prüfung aktiviert." },
      { q: "Ist die Zustellung über WhatsApp garantiert?", a: "Nein. WhatsApp-OTP läuft im QR-Geräte-Modus, den WhatsApp einschränken oder sperren kann, und bietet keine Zustellgarantie. Nutzen Sie Email-OTP, wenn Zuverlässigkeit zählt." },
      { q: "Wie wird abgerechnet?", a: "Aus einem Prepaid-USD-Guthaben und nur bei bestätigter Zustellung. Die Tarife legt der Plattformadministrator fest." },
      { q: "Wer kann mein Guthaben ändern?", a: "Nur ein Administrator, nachdem er unabhängig geprüft hat, dass Ihre Zahlung eingegangen ist. Der Support kann weder Einzahlungen freigeben noch Guthaben ändern." },
    ],
  },
  products: {
    h1: "Zwei Kanäle, ehrlich beschrieben",
    intro: "OTPProvider unterstützt genau zwei Dienste.",
    email: { t: "Email-OTP", d: "Codes über eine verifizierte Absenderdomain, Zustellereignisse fließen in die Abrechnung ein.", points: ["Zustell-, Bounce- und Beschwerdeereignisse werden erfasst", "Die Sperrliste schützt Ihre Absenderreputation", "Abrechnung nur bei bestätigter Zustellung"] },
    wa: { t: "WhatsApp-OTP", d: "Zustellung über ein verknüpftes WhatsApp-Gerät (QR-Kopplung). Der Kanal ist von jedem künftigen offiziellen Anbieter getrennt.", points: ["Standardmäßig für jedes Projekt deaktiviert", "Keine Zustellgarantie", "Unterliegt WhatsApp-Limits und Kontobeschränkungen"], warn: "Die Zustellung über WhatsApp hängt von den Richtlinien und Limits von WhatsApp ab. Nutzen Sie E-Mail-OTP als Hauptkanal für kritische Abläufe." },
  },
  developers: {
    h1: "Schnellstart", intro: "Erstellen Sie in der Konsole ein Projekt und dann einen Testschlüssel. Testschlüssel beginnen mit otp_test_ und senden nie echte Nachrichten.",
    s1: "1. Code senden", s2: "2. Code prüfen", s3: "3. Sicher wiederholen",
    idem: "Senden Sie den Header Idempotency-Key. Derselbe Schlüssel mit demselben Body liefert die ursprüngliche Anfrage zurück statt doppelt zu senden; derselbe Schlüssel mit anderem Empfänger wird abgelehnt.",
    sandboxNote: "Im Sandbox-Modus enthält die Antwort den Code zum Testen. In Statusantworten erscheint er nie, und echte Antworten enthalten ihn niemals.",
  },
  pricing: {
    h1: "Preise und Abrechnung", intro: "Preise sind noch nicht veröffentlicht. Der Plattformadministrator legt die Tarife fest; sie erscheinen hier nach der Konfiguration.",
    points: ["Prepaid-Guthaben in US-Dollar", "Guthaben wird beim Senden reserviert und nur bei bestätigter Zustellung belastet", "Fehlgeschlagene oder unbestätigte Sendungen geben die Reservierung frei", "Aufladungen erfolgen manuell: Ein Administrator schreibt Ihr Guthaben gut, nachdem er den Zahlungseingang unabhängig geprüft hat"],
  },
  security: {
    h1: "Sicherheitsmaßnahmen", intro: "Diese Maßnahmen sind heute im Produkt umgesetzt.",
    points: ["Passwörter werden mit Argon2id gehasht", "API-Schlüssel werden nur als Hash gespeichert und einmal angezeigt", "Das Guthaben-Hauptbuch ist Append-only und kann nicht geändert oder gelöscht werden", "Mitarbeiterkonten müssen Multi-Faktor-Authentifizierung nutzen", "Der Support kann keine Einzahlungen freigeben, Guthaben ändern oder Geheimnisse sehen", "Sensible Aktionen werden in einem Audit-Log protokolliert"],
    note: "Wir behaupten keine Zertifizierung und kein Penetrationstest-Ergebnis. Eine unabhängige Prüfung ist vor dem Live-Start geplant.",
  },
  legal: {
    banner: "Vorlage. Vor der Verwendung von qualifizierter Rechtsberatung prüfen lassen.",
    terms: { title: "Nutzungsbedingungen", body: ["Diese Bedingungen sind ein Platzhalter. Ersetzen Sie sie durch von qualifizierter Rechtsberatung geprüfte Bedingungen.", "Sie sollten zulässige Nutzung, Abrechnung und Erstattungen, Leistungsgrenzen, Haftung und Kündigung abdecken.", "Rechtlicher Name des Betreibers, Anschrift und anwendbares Recht müssen ergänzt werden."] },
    privacy: { title: "Datenschutzerklärung", body: ["Diese Erklärung ist ein Platzhalter. Ersetzen Sie sie durch eine von qualifizierter Rechtsberatung geprüfte Erklärung.", "Sie sollte beschreiben, welche personenbezogenen Daten erhoben werden, warum, wie lange sie gespeichert werden und wer Zugriff hat.", "Für die OTP-Zustellung genutzte Kontaktdaten der Empfänger werden verschlüsselt gespeichert und maskiert angezeigt."] },
  },
};
export default de;
