import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../i18n/config";
import { getDict } from "../../../i18n";
import { Crumbs, Shell } from "../../../components/Shell";
import { JsonLd } from "../../../components/JsonLd";
import { breadcrumbLd, pageMetadata } from "../../../lib/seo";

type P = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getDict(locale).meta.developers;
  return pageMetadata(locale, "/developers", m.title, m.description);
}

const SEND = `curl -X POST https://api.example.com/v1/otp/send \\
  -H "Authorization: Bearer otp_test_YOUR_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{"channel":"email","to":"user@example.com"}'`;
const VERIFY = `curl -X POST https://api.example.com/v1/otp/verify \\
  -H "Authorization: Bearer otp_test_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"REQUEST_ID","code":"123456"}'`;
const RETRY = `# same key + same body → the original request is returned, nothing is sent twice
# same key + different recipient → rejected (422)`;

export default async function Developers({ params }: P) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDict(locale);
  const crumbs = [{ name: t.nav.developers, path: "/developers" }];
  return (
    <Shell locale={locale} t={t} path="/developers">
      <JsonLd data={breadcrumbLd(locale, [{ name: t.site.name, path: "" }, ...crumbs])} />
      <div className="wrap section narrow">
        <Crumbs locale={locale} t={t} items={crumbs} />
        <h1>{t.developers.h1}</h1>
        <p className="lead">{t.developers.intro}</p>
        <h2>{t.developers.s1}</h2>
        <pre className="code" dir="ltr"><code>{SEND}</code></pre>
        <p className="muted">{t.developers.sandboxNote}</p>
        <h2>{t.developers.s2}</h2>
        <pre className="code" dir="ltr"><code>{VERIFY}</code></pre>
        <h2>{t.developers.s3}</h2>
        <p>{t.developers.idem}</p>
        <pre className="code" dir="ltr"><code>{RETRY}</code></pre>
      </div>
    </Shell>
  );
}
