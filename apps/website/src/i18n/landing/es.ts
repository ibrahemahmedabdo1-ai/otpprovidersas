import type { Landing } from "./en";
const es: Landing = {
  header: { login: "Iniciar sesión", start: "Empezar", language: "Idioma" },
  hero: {
    badge: "Sandbox abierto: las claves de prueba son gratis",
    h1: "Verificación OTP rápida y segura por WhatsApp y correo",
    sub: "Una API REST para enviar y verificar códigos de un solo uso. Crea una clave de prueba y envía tu primer código en minutos.",
    cta1: "Empezar gratis", cta2: "Ver documentación",
    window: "Enviar un código", chatName: "OTPProvider", chatNow: "ahora", sms: "Tu código de verificación es", delivered: "Entregado",
  },
  strip: {
    title: "Todo lo que necesita un flujo OTP",
    items: ["OTP por correo", "OTP por WhatsApp", "API REST", "Webhooks firmados", "Claves de idempotencia", "Monedero prepago", "Registro de auditoría", "MFA para el personal"],
  },
  why: {
    title: "¿Por qué elegir OTPProvider?",
    sub: "Una verificación que puedes auditar: cada envío, cobro y cambio de saldo queda registrado.",
    items: [
      { t: "Dos canales, una API", d: "Envía códigos por correo o WhatsApp con la misma solicitud. Elige el canal en cada llamada." },
      { t: "Paga por entrega confirmada", d: "Los fondos se reservan al enviar y solo se cobran cuando se confirma la entrega." },
      { t: "Webhooks firmados", d: "Recibe eventos firmados en tu servidor en cuanto se verifica un código." },
      { t: "Protección integrada contra abusos", d: "Códigos almacenados como hash, límites de intentos, bloqueos y límite de envíos por destinatario." },
    ],
  },
  plans: {
    title: "Paquetes simples y transparentes",
    sub: "Recarga tu monedero y paga solo por las entregas confirmadas.",
    unit: "recarga del monedero", custom: "A medida", popular: "Más popular",
    items: [
      { name: "Inicial", blurb: "Para probar y para apps pequeñas.", features: ["Claves de prueba y sandbox", "OTP por correo", "Pago por uso desde tu monedero", "Tickets de soporte"], cta: "Empezar" },
      { name: "Crecimiento", blurb: "Para productos con registros reales.", features: ["Todo lo de Inicial", "Webhooks firmados", "OTP por WhatsApp tras la revisión", "Panel de uso y monedero"], cta: "Empezar" },
      { name: "Enterprise", blurb: "Para grandes volúmenes y necesidades especiales.", features: ["Volúmenes a medida", "Tarifas acordadas por escrito", "Incorporación dedicada", "Apoyo en la revisión de seguridad"], cta: "Contáctanos" },
    ],
    note: "El crédito se añade cuando un administrador verifica tu pago. Las tarifas por mensaje se muestran en la consola.",
  },
  dev: {
    title: "Hecho para desarrolladores, por desarrolladores",
    sub: "JSON predecible, claves de idempotencia y códigos de error claros. Las claves de prueba nunca envían mensajes reales.",
    points: ["Enviar, verificar, reenviar y cancelar", "Reintentos seguros con Idempotency-Key", "El sandbox devuelve el código para probar"],
    docs: "Leer la guía de inicio",
  },
  cta: { title: "Empieza a enviar OTP hoy", sub: "Verificación segura para tu plataforma, lista en minutos.", signup: "Regístrate ahora", docs: "Leer la documentación" },
  footer: {
    blurb: "Códigos de un solo uso por correo y WhatsApp, diseñados con precisión.",
    platform: "Plataforma", resources: "Recursos", company: "Empresa", account: "Empezar",
    quickstart: "Guía de inicio", products: "Productos", pricing: "Precios", security: "Seguridad",
    terms: "Términos del servicio", privacy: "Política de privacidad", contact: "Contáctanos",
    signup: "Crear cuenta", login: "Iniciar sesión", forgot: "Olvidé mi contraseña", keys: "Claves API",
    services: "Servicios", servicesList: "OTP por correo, OTP por WhatsApp, API REST, webhooks",
    address: "Dirección", language: "Idioma", rights: "Todos los derechos reservados.",
    status: "El envío real se activa por cuenta tras la revisión.",
    badges: ["Hash Argon2id", "Libro mayor solo de adición", "MFA para el personal", "Registro de auditoría"],
    templateNote: "Las páginas legales son plantillas y requieren revisión de un abogado cualificado.",
  },
  faqTitle: "Respuestas claras",
  faq: [
    { q: "¿Puedo enviar mensajes reales hoy?", a: "Puedes probarlo todo en el sandbox ahora mismo, sin enviar nada ni cobrarte. El envío real se activa por cuenta tras la configuración y la revisión." },
    { q: "¿Qué canales se admiten?", a: "OTP por correo y OTP por WhatsApp. El correo es el canal predeterminado; WhatsApp se activa por proyecto tras la revisión." },
    { q: "¿Cómo se factura?", a: "Desde un monedero prepago en USD y solo cuando se confirma la entrega. Las tarifas las fija el administrador de la plataforma." },
    { q: "¿Quién puede cambiar mi saldo?", a: "Solo un administrador, tras verificar de forma independiente que tu pago llegó. El personal de soporte no puede aprobar depósitos ni editar saldos." },
  ],
};
export default es;
