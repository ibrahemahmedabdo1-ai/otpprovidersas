import type { Dict } from "./en";
const es: Dict = {
  site: { name: "OTPProvider", tagline: "API de códigos de un solo uso por correo y WhatsApp" },
  common: { skip: "Saltar al contenido", language: "Idioma", console: "Abrir la consola", docs: "Guía rápida para desarrolladores", rights: "Todos los derechos reservados.", templateNote: "Las páginas legales son plantillas y requieren revisión de un abogado cualificado antes de usarse.", sandbox: "Solo entorno de pruebas. El envío real aún no está activado." },
  nav: { products: "Productos", developers: "Desarrolladores", pricing: "Precios", security: "Seguridad", legal: "Legal" },
  meta: {
    home: { title: "OTPProvider: API de OTP por correo y WhatsApp para desarrolladores", description: "Envía y verifica códigos de un solo uso por correo y WhatsApp con una API REST sencilla, un monedero prepago en USD y un libro contable inmutable. Entorno de pruebas disponible ahora." },
    products: { title: "Productos Email OTP y WhatsApp OTP | OTPProvider", description: "Email OTP mediante un dominio de envío verificado y WhatsApp OTP en modo de dispositivo vinculado por QR, con límites y riesgos claramente indicados." },
    developers: { title: "Guía rápida de la API OTP: enviar y verificar códigos | OTPProvider", description: "Crea una clave de prueba, envía un código con POST /v1/otp/send, verifícalo con POST /v1/otp/verify y usa Idempotency-Key con seguridad." },
    pricing: { title: "Precios y modelo de facturación | OTPProvider", description: "Monedero prepago en USD, cobro solo con entrega confirmada y depósitos manuales verificados por un administrador. Las tarifas se publican cuando se configuren." },
    security: { title: "Controles de seguridad | OTPProvider", description: "Contraseñas con Argon2id, claves API con hash, libro contable solo de adición, MFA obligatoria para el personal, bloqueo por fuerza bruta y acciones de administración auditadas." },
    legalTerms: { title: "Términos del servicio (plantilla) | OTPProvider", description: "Plantilla de términos del servicio. Requiere revisión legal antes de usarse." },
    legalPrivacy: { title: "Política de privacidad (plantilla) | OTPProvider", description: "Plantilla de política de privacidad. Requiere revisión legal antes de usarse." },
  },
  home: {
    badge: "Entorno de pruebas disponible ahora",
    h1: "Códigos de un solo uso por correo y WhatsApp, diseñados para ser correctos.",
    sub: "Una API REST para enviar y verificar OTP, un monedero prepago en USD y un libro contable inmutable. Solo pagas las entregas confirmadas.",
    cta1: "Abrir la consola", cta2: "Leer la guía rápida",
    featuresTitle: "Qué obtienes",
    features: [
      { t: "API REST sencilla", d: "Envía, verifica, reenvía y cancela con JSON predecible, claves de idempotencia y códigos de error claros." },
      { t: "Facturación honesta", d: "Los fondos se reservan al enviar y se cobran solo cuando se confirma la entrega. Los resultados desconocidos se concilian, nunca se reenvían a ciegas." },
      { t: "Pensada contra el abuso", d: "Los códigos se guardan como hashes, los intentos están limitados, la solicitud se bloquea tras varios errores y los destinatarios tienen límites de frecuencia." },
    ],
    faqTitle: "Respuestas directas",
    faq: [
      { q: "¿Puedo enviar mensajes reales hoy?", a: "Todavía no. El entorno de pruebas funciona de principio a fin sin enviar nada ni cobrarte. El envío real se activa tras configurar proveedores y revisarlo." },
      { q: "¿Está garantizada la entrega por WhatsApp?", a: "No. WhatsApp OTP funciona en modo de dispositivo vinculado (QR), que WhatsApp puede limitar o bloquear y no ofrece garantía de entrega. Usa Email OTP cuando importe la fiabilidad." },
      { q: "¿Cómo se factura?", a: "Desde un monedero prepago en USD y solo cuando la entrega está confirmada. Las tarifas las fija el administrador de la plataforma." },
      { q: "¿Quién puede cambiar mi saldo?", a: "Solo un administrador, tras verificar de forma independiente que tu pago llegó. El personal de soporte no puede aprobar depósitos ni editar saldos." },
    ],
  },
  products: {
    h1: "Dos canales, descritos con honestidad",
    intro: "OTPProvider admite exactamente dos servicios.",
    email: { t: "Email OTP", d: "Códigos entregados mediante un dominio de envío verificado, con eventos de entrega que alimentan la facturación.", points: ["Se registran eventos de entrega, rebote y queja", "La lista de supresión protege la reputación del remitente", "Se cobra solo con entrega confirmada"] },
    wa: { t: "WhatsApp OTP", d: "Entregado mediante un dispositivo de WhatsApp vinculado (emparejamiento por QR). Está aislado de cualquier futuro proveedor oficial.", points: ["Desactivado por defecto en cada proyecto", "Sin garantía de entrega", "Sujeto a los límites de WhatsApp y restricciones de la cuenta"], warn: "La entrega por WhatsApp depende de las políticas y límites de WhatsApp. Usa el OTP por correo como canal principal en flujos críticos." },
  },
  developers: {
    h1: "Guía rápida", intro: "Crea un proyecto en la consola y luego una clave de prueba. Las claves de prueba empiezan por otp_test_ y nunca envían mensajes reales.",
    s1: "1. Envía un código", s2: "2. Verifica el código", s3: "3. Reintenta con seguridad",
    idem: "Envía la cabecera Idempotency-Key. Repetir la misma clave y cuerpo devuelve la solicitud original en lugar de enviar dos veces; la misma clave con otro destinatario se rechaza.",
    sandboxNote: "En el entorno de pruebas la respuesta incluye el código para que puedas probar. Nunca aparece en las respuestas de estado, y las respuestas reales jamás lo incluirán.",
  },
  pricing: {
    h1: "Precios y facturación", intro: "Los precios aún no están publicados. El administrador de la plataforma fija las tarifas y aparecerán aquí cuando se configuren.",
    points: ["Monedero prepago en dólares estadounidenses", "Los fondos se reservan al enviar y se cobran solo con entrega confirmada", "Los envíos fallidos o no confirmados liberan la reserva", "Las recargas son manuales: un administrador abona tu monedero tras verificar de forma independiente que el pago llegó"],
  },
  security: {
    h1: "Controles de seguridad", intro: "Estos controles están implementados hoy en el producto.",
    points: ["Las contraseñas se almacenan con Argon2id", "Las claves API se guardan solo como hash y se muestran una vez", "El libro contable es de solo adición y no puede editarse ni borrarse", "Las cuentas del personal deben usar autenticación multifactor", "El soporte no puede aprobar depósitos, cambiar saldos ni ver secretos", "Las acciones sensibles se registran en un log de auditoría"],
    note: "No afirmamos ninguna certificación ni resultado de pruebas de penetración. Se prevé una revisión independiente antes del lanzamiento real.",
  },
  legal: {
    banner: "Plantilla. Requiere revisión de un abogado cualificado antes de usarse.",
    terms: { title: "Términos del servicio", body: ["Estos términos son un marcador. Sustitúyelos por términos revisados por un abogado cualificado.", "Deben cubrir uso aceptable, facturación y reembolsos, límites del servicio, responsabilidad y terminación.", "Debe añadirse la razón social del operador, su dirección y la ley aplicable."] },
    privacy: { title: "Política de privacidad", body: ["Esta política es un marcador. Sustitúyela por una política revisada por un abogado cualificado.", "Debe describir qué datos personales se recogen, para qué, cuánto tiempo se conservan y quién puede acceder.", "Los datos de contacto del destinatario usados para entregar OTP se almacenan cifrados y se muestran enmascarados."] },
  },
};
export default es;
