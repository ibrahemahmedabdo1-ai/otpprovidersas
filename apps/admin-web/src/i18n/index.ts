export const LOCALES = ["en", "ar", "ru", "es", "de", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const NATIVE_NAMES: Record<Locale, string> = { en: "English", ar: "العربية", ru: "Русский", es: "Español", de: "Deutsch", zh: "中文" };
export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
export const dirOf = (l: Locale): "rtl" | "ltr" => (l === "ar" ? "rtl" : "ltr");

const en = {
  "nav.overview": "Overview", "nav.deposits": "Deposits", "nav.users": "Users", "nav.organizations": "Organizations", "nav.pricing": "Pricing", "nav.coupons": "Coupons",
  "nav.providers": "Providers", "nav.tickets": "Tickets", "nav.webhooks": "Webhooks", "nav.company": "Company", "nav.audit": "Audit log", "nav.reconciliation": "Reconciliation",
  "nav.approvals": "Approvals", "nav.staff": "Staff", "nav.translation": "Translation", "nav.planned": "Not built yet",
  "shell.signOut": "Sign out", "shell.language": "Language", "shell.skip": "Skip to content", "shell.mainNav": "Main navigation",
  "shell.wrongTitle": "Wrong console", "shell.wrongBody": "This account ({role}) is not allowed in the {app} console. Sign out and use the right one.",
  "ov.title": "Overview", "ov.sub": "Every figure is calculated from the live database when you open this page. Nothing is estimated.",
  "ov.customers": "Customers", "ov.money": "Money", "ov.traffic": "OTP traffic, last {n} days", "ov.providers": "Providers and devices", "ov.support": "Support", "ov.shortcuts": "Shortcuts",
  "ov.totalCustomers": "Total customers", "ov.active": "Active", "ov.emailUnverified": "Email not verified", "ov.orgReview": "Organizations awaiting review", "ov.suspended": "Suspended",
  "ov.pendingDeposits": "Pending deposits", "ov.deposits30": "Deposits credited, 30 days", "ov.usage30": "Usage revenue, 30 days", "ov.usageAll": "Usage revenue, all time", "ov.liabilities": "Wallet liabilities",
  "ov.liveRequests": "Live requests", "ov.delivered": "Delivered", "ov.failed": "Failed", "ov.devices": "WhatsApp devices", "ov.openTickets": "Open tickets", "ov.escalated": "Escalated",
  "ov.waitingCustomer": "Waiting for customer", "ov.incidents": "Open incidents",
  "tm.title": "Translation management", "tm.sub": "Automatic translation for the support team. Original messages are always kept.",
  "tm.provider": "Provider", "tm.notConfigured": "Not configured", "tm.system": "Automatic translation", "tm.on": "On", "tm.off": "Off", "tm.enable": "Enable", "tm.disable": "Disable",
  "tm.languages": "Enabled languages", "tm.limit": "Daily character limit", "tm.usedToday": "Used today", "tm.last30": "Last 30 days", "tm.translations": "Translations", "tm.errors": "Errors",
  "tm.chars": "Characters", "tm.test": "Test provider", "tm.testing": "Testing", "tm.agents": "Support staff", "tm.allowed": "Allowed", "tm.save": "Save", "tm.confirm": "I understand that ticket text is sent to the translation provider.",
} as const;
export type Key = keyof typeof en;

const ar: Partial<Record<Key, string>> = {
  "nav.overview": "نظرة عامة", "nav.deposits": "الإيداعات", "nav.users": "المستخدمون", "nav.organizations": "المؤسسات", "nav.pricing": "الأسعار", "nav.coupons": "الكوبونات",
  "nav.providers": "المزوّدون", "nav.tickets": "التذاكر", "nav.webhooks": "الويب هوكس", "nav.company": "الشركة", "nav.audit": "سجل التدقيق", "nav.reconciliation": "المطابقة",
  "nav.approvals": "الموافقات", "nav.staff": "الموظفون", "nav.translation": "الترجمة", "nav.planned": "قيد الإنشاء",
  "shell.signOut": "تسجيل الخروج", "shell.language": "اللغة", "shell.skip": "تخطَّ إلى المحتوى", "shell.mainNav": "التنقل الرئيسي",
  "shell.wrongTitle": "لوحة غير مناسبة", "shell.wrongBody": "هذا الحساب ({role}) غير مسموح له بلوحة {app}. سجّل الخروج واستخدم اللوحة الصحيحة.",
  "ov.title": "نظرة عامة", "ov.sub": "كل رقم يُحسب من قاعدة البيانات الحية عند فتح الصفحة. لا توجد تقديرات.",
  "ov.customers": "العملاء", "ov.money": "الأموال", "ov.traffic": "حركة OTP خلال آخر {n} يومًا", "ov.providers": "المزوّدون والأجهزة", "ov.support": "الدعم", "ov.shortcuts": "اختصارات",
  "ov.totalCustomers": "إجمالي العملاء", "ov.active": "نشط", "ov.emailUnverified": "بريد غير موثّق", "ov.orgReview": "مؤسسات بانتظار المراجعة", "ov.suspended": "موقوف",
  "ov.pendingDeposits": "إيداعات معلّقة", "ov.deposits30": "الإيداعات المعتمدة (30 يومًا)", "ov.usage30": "إيراد الاستخدام (30 يومًا)", "ov.usageAll": "إيراد الاستخدام (الإجمالي)", "ov.liabilities": "التزامات المحافظ",
  "ov.liveRequests": "طلبات فعلية", "ov.delivered": "تم التسليم", "ov.failed": "فشل", "ov.devices": "أجهزة واتساب", "ov.openTickets": "تذاكر مفتوحة", "ov.escalated": "مُصعَّدة",
  "ov.waitingCustomer": "بانتظار العميل", "ov.incidents": "حوادث مفتوحة",
  "tm.title": "إدارة الترجمة", "tm.sub": "ترجمة تلقائية لفريق الدعم. الرسائل الأصلية تُحفظ دائمًا.",
  "tm.provider": "المزوّد", "tm.notConfigured": "غير مُهيّأ", "tm.system": "الترجمة التلقائية", "tm.on": "مفعّلة", "tm.off": "متوقفة", "tm.enable": "تفعيل", "tm.disable": "إيقاف",
  "tm.languages": "اللغات المفعّلة", "tm.limit": "الحد اليومي للأحرف", "tm.usedToday": "المستخدم اليوم", "tm.last30": "آخر 30 يومًا", "tm.translations": "الترجمات", "tm.errors": "الأخطاء",
  "tm.chars": "الأحرف", "tm.test": "اختبار المزوّد", "tm.testing": "جارٍ الاختبار", "tm.agents": "موظفو الدعم", "tm.allowed": "مسموح", "tm.save": "حفظ", "tm.confirm": "أدرك أن نص التذاكر يُرسل إلى مزوّد الترجمة.",
};
const ru: Partial<Record<Key, string>> = {
  "nav.overview": "Обзор", "nav.deposits": "Пополнения", "nav.users": "Пользователи", "nav.organizations": "Организации", "nav.pricing": "Цены", "nav.coupons": "Купоны",
  "nav.providers": "Провайдеры", "nav.tickets": "Тикеты", "nav.webhooks": "Вебхуки", "nav.company": "Компания", "nav.audit": "Журнал аудита", "nav.reconciliation": "Сверка",
  "nav.approvals": "Согласования", "nav.staff": "Сотрудники", "nav.translation": "Перевод", "nav.planned": "Ещё не готово",
  "shell.signOut": "Выйти", "shell.language": "Язык", "shell.skip": "К содержимому", "shell.mainNav": "Основная навигация",
  "shell.wrongTitle": "Не та консоль", "shell.wrongBody": "Этому аккаунту ({role}) нельзя входить в консоль {app}. Выйдите и используйте нужную.",
  "ov.title": "Обзор", "ov.sub": "Все цифры считаются из рабочей базы при открытии страницы. Оценок нет.",
  "ov.customers": "Клиенты", "ov.money": "Деньги", "ov.traffic": "Трафик OTP за {n} дн.", "ov.providers": "Провайдеры и устройства", "ov.support": "Поддержка", "ov.shortcuts": "Быстрые ссылки",
  "ov.totalCustomers": "Всего клиентов", "ov.active": "Активные", "ov.emailUnverified": "Email не подтверждён", "ov.orgReview": "Организации на проверке", "ov.suspended": "Заблокированы",
  "ov.pendingDeposits": "Ожидающие пополнения", "ov.deposits30": "Зачислено за 30 дней", "ov.usage30": "Выручка от использования, 30 дн.", "ov.usageAll": "Выручка от использования, всего", "ov.liabilities": "Обязательства по кошелькам",
  "ov.liveRequests": "Боевые запросы", "ov.delivered": "Доставлено", "ov.failed": "Ошибки", "ov.devices": "Устройства WhatsApp", "ov.openTickets": "Открытые тикеты", "ov.escalated": "Эскалированы",
  "ov.waitingCustomer": "Ждут клиента", "ov.incidents": "Открытые инциденты",
  "tm.title": "Управление переводом", "tm.sub": "Автоматический перевод для поддержки. Оригиналы сообщений всегда сохраняются.",
  "tm.provider": "Провайдер", "tm.notConfigured": "Не настроен", "tm.system": "Автоперевод", "tm.on": "Включён", "tm.off": "Выключен", "tm.enable": "Включить", "tm.disable": "Выключить",
  "tm.languages": "Включённые языки", "tm.limit": "Суточный лимит символов", "tm.usedToday": "Использовано сегодня", "tm.last30": "За 30 дней", "tm.translations": "Переводы", "tm.errors": "Ошибки",
  "tm.chars": "Символы", "tm.test": "Проверить провайдера", "tm.testing": "Проверка", "tm.agents": "Сотрудники поддержки", "tm.allowed": "Разрешено", "tm.save": "Сохранить", "tm.confirm": "Я понимаю, что текст тикетов отправляется провайдеру перевода.",
};
const es: Partial<Record<Key, string>> = {
  "nav.overview": "Resumen", "nav.deposits": "Depósitos", "nav.users": "Usuarios", "nav.organizations": "Organizaciones", "nav.pricing": "Precios", "nav.coupons": "Cupones",
  "nav.providers": "Proveedores", "nav.tickets": "Tickets", "nav.webhooks": "Webhooks", "nav.company": "Empresa", "nav.audit": "Registro de auditoría", "nav.reconciliation": "Conciliación",
  "nav.approvals": "Aprobaciones", "nav.staff": "Personal", "nav.translation": "Traducción", "nav.planned": "Aún no disponible",
  "shell.signOut": "Cerrar sesión", "shell.language": "Idioma", "shell.skip": "Saltar al contenido", "shell.mainNav": "Navegación principal",
  "shell.wrongTitle": "Consola incorrecta", "shell.wrongBody": "Esta cuenta ({role}) no puede usar la consola {app}. Cierra sesión y usa la correcta.",
  "ov.title": "Resumen", "ov.sub": "Cada cifra se calcula con la base de datos real al abrir esta página. No hay estimaciones.",
  "ov.customers": "Clientes", "ov.money": "Dinero", "ov.traffic": "Tráfico OTP, últimos {n} días", "ov.providers": "Proveedores y dispositivos", "ov.support": "Soporte", "ov.shortcuts": "Accesos directos",
  "ov.totalCustomers": "Clientes totales", "ov.active": "Activos", "ov.emailUnverified": "Correo sin verificar", "ov.orgReview": "Organizaciones en revisión", "ov.suspended": "Suspendidos",
  "ov.pendingDeposits": "Depósitos pendientes", "ov.deposits30": "Depósitos acreditados, 30 días", "ov.usage30": "Ingresos por uso, 30 días", "ov.usageAll": "Ingresos por uso, total", "ov.liabilities": "Pasivos de monederos",
  "ov.liveRequests": "Solicitudes reales", "ov.delivered": "Entregados", "ov.failed": "Fallidos", "ov.devices": "Dispositivos de WhatsApp", "ov.openTickets": "Tickets abiertos", "ov.escalated": "Escalados",
  "ov.waitingCustomer": "Esperando al cliente", "ov.incidents": "Incidentes abiertos",
  "tm.title": "Gestión de traducción", "tm.sub": "Traducción automática para el equipo de soporte. Los mensajes originales siempre se conservan.",
  "tm.provider": "Proveedor", "tm.notConfigured": "No configurado", "tm.system": "Traducción automática", "tm.on": "Activada", "tm.off": "Desactivada", "tm.enable": "Activar", "tm.disable": "Desactivar",
  "tm.languages": "Idiomas activados", "tm.limit": "Límite diario de caracteres", "tm.usedToday": "Usado hoy", "tm.last30": "Últimos 30 días", "tm.translations": "Traducciones", "tm.errors": "Errores",
  "tm.chars": "Caracteres", "tm.test": "Probar proveedor", "tm.testing": "Probando", "tm.agents": "Personal de soporte", "tm.allowed": "Permitido", "tm.save": "Guardar", "tm.confirm": "Entiendo que el texto de los tickets se envía al proveedor de traducción.",
};
const de: Partial<Record<Key, string>> = {
  "nav.overview": "Übersicht", "nav.deposits": "Einzahlungen", "nav.users": "Benutzer", "nav.organizations": "Organisationen", "nav.pricing": "Preise", "nav.coupons": "Gutscheine",
  "nav.providers": "Anbieter", "nav.tickets": "Tickets", "nav.webhooks": "Webhooks", "nav.company": "Unternehmen", "nav.audit": "Audit-Protokoll", "nav.reconciliation": "Abgleich",
  "nav.approvals": "Freigaben", "nav.staff": "Mitarbeiter", "nav.translation": "Übersetzung", "nav.planned": "Noch nicht gebaut",
  "shell.signOut": "Abmelden", "shell.language": "Sprache", "shell.skip": "Zum Inhalt springen", "shell.mainNav": "Hauptnavigation",
  "shell.wrongTitle": "Falsche Konsole", "shell.wrongBody": "Dieses Konto ({role}) darf die {app}-Konsole nicht nutzen. Abmelden und die richtige verwenden.",
  "ov.title": "Übersicht", "ov.sub": "Jede Zahl wird beim Öffnen aus der Live-Datenbank berechnet. Nichts ist geschätzt.",
  "ov.customers": "Kunden", "ov.money": "Geld", "ov.traffic": "OTP-Verkehr, letzte {n} Tage", "ov.providers": "Anbieter und Geräte", "ov.support": "Support", "ov.shortcuts": "Schnellzugriffe",
  "ov.totalCustomers": "Kunden gesamt", "ov.active": "Aktiv", "ov.emailUnverified": "E-Mail nicht bestätigt", "ov.orgReview": "Organisationen in Prüfung", "ov.suspended": "Gesperrt",
  "ov.pendingDeposits": "Offene Einzahlungen", "ov.deposits30": "Gutgeschriebene Einzahlungen, 30 Tage", "ov.usage30": "Nutzungsumsatz, 30 Tage", "ov.usageAll": "Nutzungsumsatz, gesamt", "ov.liabilities": "Wallet-Verbindlichkeiten",
  "ov.liveRequests": "Live-Anfragen", "ov.delivered": "Zugestellt", "ov.failed": "Fehlgeschlagen", "ov.devices": "WhatsApp-Geräte", "ov.openTickets": "Offene Tickets", "ov.escalated": "Eskaliert",
  "ov.waitingCustomer": "Wartet auf Kunden", "ov.incidents": "Offene Vorfälle",
  "tm.title": "Übersetzungsverwaltung", "tm.sub": "Automatische Übersetzung für das Support-Team. Originalnachrichten bleiben immer erhalten.",
  "tm.provider": "Anbieter", "tm.notConfigured": "Nicht konfiguriert", "tm.system": "Automatische Übersetzung", "tm.on": "Ein", "tm.off": "Aus", "tm.enable": "Aktivieren", "tm.disable": "Deaktivieren",
  "tm.languages": "Aktivierte Sprachen", "tm.limit": "Tägliches Zeichenlimit", "tm.usedToday": "Heute verbraucht", "tm.last30": "Letzte 30 Tage", "tm.translations": "Übersetzungen", "tm.errors": "Fehler",
  "tm.chars": "Zeichen", "tm.test": "Anbieter testen", "tm.testing": "Teste", "tm.agents": "Support-Mitarbeiter", "tm.allowed": "Erlaubt", "tm.save": "Speichern", "tm.confirm": "Mir ist bewusst, dass Ticket-Text an den Übersetzungsanbieter gesendet wird.",
};
const zh: Partial<Record<Key, string>> = {
  "nav.overview": "概览", "nav.deposits": "充值", "nav.users": "用户", "nav.organizations": "组织", "nav.pricing": "价格", "nav.coupons": "优惠券",
  "nav.providers": "服务商", "nav.tickets": "工单", "nav.webhooks": "Webhooks", "nav.company": "公司", "nav.audit": "审计日志", "nav.reconciliation": "对账",
  "nav.approvals": "审批", "nav.staff": "员工", "nav.translation": "翻译", "nav.planned": "尚未开发",
  "shell.signOut": "退出登录", "shell.language": "语言", "shell.skip": "跳到内容", "shell.mainNav": "主导航",
  "shell.wrongTitle": "控制台不匹配", "shell.wrongBody": "此账号（{role}）不能使用 {app} 控制台。请退出并使用正确的控制台。",
  "ov.title": "概览", "ov.sub": "打开页面时，所有数字都实时从数据库计算，没有任何估算。",
  "ov.customers": "客户", "ov.money": "资金", "ov.traffic": "最近 {n} 天 OTP 流量", "ov.providers": "服务商与设备", "ov.support": "支持", "ov.shortcuts": "快捷入口",
  "ov.totalCustomers": "客户总数", "ov.active": "活跃", "ov.emailUnverified": "邮箱未验证", "ov.orgReview": "待审核组织", "ov.suspended": "已停用",
  "ov.pendingDeposits": "待处理充值", "ov.deposits30": "30 天已入账充值", "ov.usage30": "30 天使用收入", "ov.usageAll": "累计使用收入", "ov.liabilities": "钱包负债",
  "ov.liveRequests": "正式请求", "ov.delivered": "已送达", "ov.failed": "失败", "ov.devices": "WhatsApp 设备", "ov.openTickets": "未结工单", "ov.escalated": "已升级",
  "ov.waitingCustomer": "等待客户", "ov.incidents": "未解决事件",
  "tm.title": "翻译管理", "tm.sub": "为支持团队提供自动翻译。始终保留原始消息。",
  "tm.provider": "服务商", "tm.notConfigured": "未配置", "tm.system": "自动翻译", "tm.on": "已开启", "tm.off": "已关闭", "tm.enable": "开启", "tm.disable": "关闭",
  "tm.languages": "已启用语言", "tm.limit": "每日字符上限", "tm.usedToday": "今日已用", "tm.last30": "最近 30 天", "tm.translations": "翻译数", "tm.errors": "错误数",
  "tm.chars": "字符数", "tm.test": "测试服务商", "tm.testing": "测试中", "tm.agents": "支持人员", "tm.allowed": "允许", "tm.save": "保存", "tm.confirm": "我了解工单文本将发送给翻译服务商。",
};
const dicts: Record<Locale, Partial<Record<Key, string>>> = { en, ar, ru, es, de, zh };

/** Looks up a key in the chosen language and falls back to English, so a missing string never shows a raw key. */
export function translate(l: Locale, key: Key, vars: Record<string, string | number> = {}): string {
  const s = dicts[l][key] ?? en[key];
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
export const EN = en;
