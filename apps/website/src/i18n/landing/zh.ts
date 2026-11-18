import type { Landing } from "./en";
const zh: Landing = {
  header: { login: "登录", start: "立即开始", language: "语言" },
  hero: {
    badge: "沙盒已开放：测试密钥免费",
    h1: "通过 WhatsApp 和邮件的快速、安全 OTP 验证",
    sub: "用 REST API 发送并校验一次性验证码。创建测试密钥，几分钟内发出第一条验证码。",
    cta1: "免费开始", cta2: "查看 API 文档",
    window: "发送验证码", chatName: "OTPProvider", chatNow: "刚刚", sms: "您的验证码是", chatTyping: "正在输入…", chatOnline: "在线", chatExpire: "验证码 5 分钟内有效。", chatShare: "请勿向任何人透露此验证码。",
  },
  strip: {
    title: "OTP 流程所需的一切",
    items: ["邮件 OTP", "WhatsApp OTP", "REST API", "签名 Webhook", "幂等键", "预付钱包", "审计日志", "员工 MFA"],
  },
  why: {
    title: "为什么选择 OTPProvider？",
    sub: "可追溯的验证：每一次发送、扣费和余额变动都有记录。",
    items: [
      { t: "两个渠道，一套 API", d: "用同一个请求通过邮件或 WhatsApp 发送验证码，每次调用自行选择渠道。" },
      { t: "确认送达才计费", d: "发送时先冻结资金，只有在确认送达后才扣费。" },
      { t: "签名 Webhook", d: "验证码一经校验，即向您的服务器推送带签名的事件。" },
      { t: "内置防滥用保护", d: "验证码以哈希存储，限制尝试次数，超限锁定，并对每个收件人限速。" },
    ],
  },
  plans: {
    title: "简单透明的套餐",
    sub: "为钱包充值，仅为已确认送达的消息付费。",
    unit: "钱包充值", custom: "定制", popular: "最受欢迎",
    items: [
      { name: "入门版", blurb: "适合试用和小型应用。", features: ["测试密钥与沙盒", "邮件 OTP", "从钱包按量付费", "支持工单"], cta: "立即开始" },
      { name: "成长版", blurb: "适合有真实注册流量的产品。", features: ["包含入门版全部内容", "签名 Webhook", "审核后开通 WhatsApp OTP", "用量与钱包仪表盘"], cta: "立即开始" },
      { name: "企业版", blurb: "适合大规模和特殊需求。", features: ["定制用量", "书面约定的费率", "专属接入支持", "协助安全评审"], cta: "联系我们" },
    ],
    note: "管理员核实您的付款后才会入账。每条消息的费率可在控制台查看。",
  },
  dev: {
    title: "由开发者打造，为开发者服务",
    sub: "可预测的 JSON、幂等键和清晰的错误码。测试密钥不会发送真实消息。",
    points: ["发送、校验、重发与取消", "通过 Idempotency-Key 安全重试", "沙盒会返回验证码，方便测试"],
    docs: "阅读快速入门",
  },
  cta: { title: "今天就开始发送 OTP", sub: "为您的平台提供安全验证，几分钟即可接入。", signup: "立即注册", docs: "阅读文档" },
  footer: {
    blurb: "通过邮件和 WhatsApp 发送一次性验证码，以准确为本。",
    platform: "平台", resources: "资源", company: "公司", account: "开始使用",
    quickstart: "快速入门", products: "产品", pricing: "价格", security: "安全",
    terms: "服务条款", privacy: "隐私政策", contact: "联系我们",
    signup: "创建账户", login: "登录", forgot: "忘记密码", keys: "API 密钥",
    services: "服务", servicesList: "邮件 OTP、WhatsApp OTP、REST API、Webhook",
    address: "地址", language: "语言", rights: "保留所有权利。",
    status: "真实发送在审核后按账户开通。",
    badges: ["Argon2id 哈希", "仅追加账本", "员工 MFA", "审计日志"],
    templateNote: "法律页面仅为模板，使用前须经合格律师审核。",
  },
  faqTitle: "直接回答",
  faq: [
    { q: "今天可以发送真实消息吗？", a: "您现在就可以在沙盒中完整测试，不会发送任何内容，也不会计费。真实发送在完成配置和审核后按账户开通。" },
    { q: "支持哪些渠道？", a: "邮件 OTP 和 WhatsApp OTP。邮件是默认渠道；WhatsApp 在审核后按项目开通。" },
    { q: "如何计费？", a: "从美元预付钱包扣费，且仅在确认送达后。费率由平台管理员设定。" },
    { q: "谁可以修改我的余额？", a: "只有管理员，并且是在独立核实您的付款到账之后。客服人员无法批准充值或修改余额。" },
  ],
};
export default zh;
