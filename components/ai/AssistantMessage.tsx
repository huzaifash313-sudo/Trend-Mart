"use client";

import Link from "next/link";

/**
 * Renders assistant text with *bold* and [label](path) markdown links.
 */
export function AssistantMessage({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, lineIdx) => (
        <span key={lineIdx}>
          {lineIdx > 0 ? <br /> : null}
          <InlineFormatted text={line} />
        </span>
      ))}
    </>
  );
}

function InlineFormatted({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const [, label, href] = linkMatch;
          const internal = href.startsWith("/");
          const className =
            "font-semibold text-emerald-600 underline underline-offset-2 hover:text-emerald-700 dark:text-emerald-400";

          if (internal) {
            return (
              <Link key={i} href={href} className={className}>
                {label}
              </Link>
            );
          }
          return (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={className}>
              {label}
            </a>
          );
        }

        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(1, -1)}
            </strong>
          );
        }

        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
