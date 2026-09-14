"use client";

import Link from "next/link";
import LegalPageLayout, { LegalList, LegalSection } from "@/components/LegalPageLayout";
import { useLocale } from "@/context/LocaleContext";
import {
  getLegalDoc,
  pickLocale,
  type LegalBullet,
  type LegalDocKey,
} from "@/lib/content/legalDocs";

function renderBullet(locale: "en" | "ur", bullet: LegalBullet) {
  if ("strong" in bullet && bullet.strong) {
    return (
      <>
        <strong>{pickLocale(locale, bullet.strong)}</strong>{" "}
        {pickLocale(locale, bullet.text)}
      </>
    );
  }
  return pickLocale(locale, bullet);
}

export default function LegalDocView({ doc: docKey }: { doc: LegalDocKey }) {
  const { locale } = useLocale();
  const doc = getLegalDoc(docKey);
  const title = pickLocale(locale, doc.title);

  return (
    <LegalPageLayout
      title={title}
      icon={doc.icon}
      lastUpdated={doc.lastUpdated}
      activeHref={doc.href}
    >
      {doc.sections.map((section) => (
        <LegalSection key={section.heading.en} heading={pickLocale(locale, section.heading)}>
          {section.paragraphs?.map((p, i) => (
            <p key={`p-${i}`}>{pickLocale(locale, p)}</p>
          ))}
          {section.bullets && section.bullets.length > 0 ? (
            <LegalList items={section.bullets.map((b) => renderBullet(locale, b))} />
          ) : null}
          {section.links && section.links.length > 0 ? (
            <p className="mt-2">
              {section.links.map((link, i) => (
                <span key={`${link.href}-${i}`}>
                  {link.prefix ? pickLocale(locale, link.prefix) : null}
                  <Link
                    href={link.href}
                    className="font-medium text-emerald-600 underline dark:text-emerald-400"
                  >
                    {pickLocale(locale, link.label)}
                  </Link>
                  {link.suffix ? pickLocale(locale, link.suffix) : null}
                </span>
              ))}
            </p>
          ) : null}
        </LegalSection>
      ))}
    </LegalPageLayout>
  );
}
