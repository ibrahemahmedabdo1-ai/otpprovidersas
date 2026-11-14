import type { Dict } from "./en";
const zh: Dict = {
  site: { name: "OTPProvider", tagline: "邮件与 WhatsApp 一次性验证码 API" },
  common: { skip: "跳到内容", language: "语言", console: "打开控制台", docs: "开发者快速入门", rights: "保留所有权利。", templateNote: "法律页面仅为模板，使用前需由合格律师审核。", sandbox: "仅限沙盒。真实发送尚未启用。" },
  nav: { products: "产品", developers: "开发者", pricing: "价格", security: "安全", legal: "法律" },
  meta: {
    home: { title: "OTPProvider：面向开发者的邮件与 WhatsApp OTP API", description: "通过简单的 REST API、美元预付钱包和不可篡改的账本，发送并验证邮件与 WhatsApp 一次性验证码。沙盒现已可用。" },
    products: { title: "邮件 OTP 与 WhatsApp OTP 产品 | OTPProvider", description: "通过已验证发送域名的邮件 OTP，以及二维码关联设备模式的 WhatsApp OTP，并明确说明限制与风险。" },
    developers: { title: "OTP API 快速入门：发送并验证验证码 | OTPProvider", description: "创建测试密钥，用 POST /v1/otp/send 发送验证码，用 POST /v1/otp/verify 验证，并安全使用 Idempotency-Key。" },
    pricing: { title: "价格与计费模式 | OTPProvider", description: "美元预付钱包，仅在确认送达后计费，充值由管理员人工核实。费率配置完成后公布。" },
    security: { title: "安全措施 | OTPProvider", description: "Argon2id 密码哈希、API 密钥哈希存储、仅追加账本、员工强制多因素认证、暴力破解锁定以及管理员操作审计。" },
    legalTerms: { title: "服务条款（模板） | OTPProvider", description: "OTPProvider 服务条款模板。此占位文本在使用前需由合格律师审核，请勿直接作为正式条款发布。" },
    legalPrivacy: { title: "隐私政策（模板） | OTPProvider", description: "OTPProvider 隐私政策模板。此占位文本在使用前需由合格律师审核，请勿直接作为正式政策发布。" },
  },
  home: {
    badge: "沙盒现已可用",
    h1: "通过邮件和 WhatsApp 发送一次性验证码，以正确性为先。",
    sub: "用于发送和验证 OTP 的 REST API、美元预付钱包和不可篡改的账本。您只需为已确认送达的消息付费。",
    cta1: "打开控制台", cta2: "阅读快速入门",
    featuresTitle: "您将获得",
    features: [
      { t: "简洁的 REST API", d: "发送、验证、重发和取消，JSON 结构可预期，支持幂等键和清晰的错误码。" },
      { t: "诚实的计费", d: "发送时预留资金，仅在确认送达后扣费。结果未知的消息会被对账，绝不盲目重发。" },
      { t: "为抵御滥用而设计", d: "验证码以哈希存储，尝试次数受限，多次猜错后请求被锁定，并对每个收件人限速。" },
    ],
    faqTitle: "直接回答",
    faq: [
      { q: "今天可以发送真实消息吗？", a: "暂时不行。沙盒可完整运行，但不会发送任何内容，也不会向您收费。真实发送将在服务商配置和审核后开启。" },
      { q: "WhatsApp 送达有保证吗？", a: "没有。WhatsApp OTP 运行在二维码关联设备模式下，可能被 WhatsApp 限制或封禁，且不保证送达。对可靠性要求高的场景请使用邮件 OTP。" },
      { q: "如何计费？", a: "从美元预付钱包扣费，且仅在确认送达后。费率由平台管理员设定。" },
      { q: "谁能修改我的余额？", a: "只有管理员，并且需在独立核实您的付款到账之后。客服人员无法批准充值或修改余额。" },
    ],
  },
  products: {
    h1: "两个渠道，如实说明",
    intro: "OTPProvider 仅支持两项服务。",
    email: { t: "邮件 OTP", d: "通过已验证的发送域名投递，送达事件会反馈到计费中。", points: ["跟踪送达、退信和投诉事件", "抑制名单保护发件人信誉", "仅在确认送达后计费"] },
    wa: { t: "WhatsApp OTP", d: "通过已关联的 WhatsApp 设备（二维码配对）投递，与未来任何官方服务商相互隔离。", points: ["每个项目默认关闭", "不保证送达", "受 WhatsApp 频率限制和账号限制约束"], warn: "关联设备模式不是官方商业渠道。WhatsApp 可能随时限制或封禁已关联的号码。请勿将其用于关键流程。" },
  },
  developers: {
    h1: "快速入门", intro: "在控制台创建项目，然后创建测试密钥。测试密钥以 otp_test_ 开头，绝不会发送真实消息。",
    s1: "1. 发送验证码", s2: "2. 验证验证码", s3: "3. 安全重试",
    idem: "请发送 Idempotency-Key 请求头。使用相同的密钥和请求体重复请求将返回原请求而不会再次发送；相同密钥配不同收件人会被拒绝。",
    sandboxNote: "沙盒模式下响应会包含验证码以便测试。它不会出现在状态响应中，真实响应也永远不会包含它。",
  },
  pricing: {
    h1: "价格与计费", intro: "价格尚未公布。费率由平台管理员设定，配置完成后将在此显示。",
    points: ["以美元计价的预付钱包", "发送时预留资金，仅在确认送达后扣费", "发送失败或未确认时释放预留", "充值为人工操作：管理员在独立核实付款到账后为您的钱包入账"],
  },
  security: {
    h1: "安全措施", intro: "以下措施目前已在产品中实现。",
    points: ["密码使用 Argon2id 哈希", "API 密钥仅以哈希存储，并且只显示一次", "钱包账本仅可追加，不能修改或删除", "员工账号必须使用多因素认证", "客服人员无法批准充值、修改余额或查看机密", "敏感操作会写入审计日志"],
    note: "我们不声称拥有任何认证或渗透测试结果。计划在正式上线前进行独立审查。",
  },
  legal: {
    banner: "模板。使用前需由合格律师审核。",
    terms: { title: "服务条款", body: ["本条款仅为占位文本。请替换为经合格律师审核的条款。", "应涵盖可接受的使用、计费与退款、服务限制、责任和终止。", "必须补充运营方的法定名称、地址和适用法律。"] },
    privacy: { title: "隐私政策", body: ["本政策仅为占位文本。请替换为经合格律师审核的政策。", "应说明收集哪些个人数据、原因、保存期限以及谁可以访问。", "用于 OTP 投递的收件人联系方式以加密形式存储，并以掩码形式显示。"] },
  },
};
export default zh;
