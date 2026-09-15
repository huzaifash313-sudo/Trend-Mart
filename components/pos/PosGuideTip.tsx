"use client";

/** Short plain-language tip strip for POS / merchant screens. */
export default function PosGuideTip({
  title,
  steps,
  className = "",
}: {
  title?: string;
  steps: string[];
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-sky-200/80 bg-sky-50/90 px-2.5 py-2 dark:border-sky-900/50 dark:bg-sky-950/30 ${className}`}
    >
      {title ? (
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-sky-800 dark:text-sky-200">
          {title}
        </p>
      ) : null}
      <ol className={`space-y-0.5 ${title ? "mt-1" : ""}`}>
        {steps.map((step, i) => (
          <li
            key={step}
            className="flex gap-1.5 text-[11px] leading-snug text-sky-950/90 dark:text-sky-100/90"
          >
            <span className="shrink-0 font-extrabold text-sky-600 dark:text-sky-400">
              {i + 1}.
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
