"use client";

interface WhatsAppFloatButtonProps {
  phone: string;
  shopName?: string;
}

function normalizeWaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `92${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("3")) return `92${digits}`;
  return digits;
}

export default function WhatsAppFloatButton({
  phone,
  shopName,
}: WhatsAppFloatButtonProps) {
  const wa = normalizeWaPhone(phone);
  if (!wa) return null;

  const text = encodeURIComponent(
    shopName
      ? `Hi! I'm interested in ${shopName} on TrendMart.`
      : "Hi! I found you on TrendMart.",
  );
  const href = `https://wa.me/${wa}?text=${text}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-emerald-900/20 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 md:bottom-8 dark:shadow-emerald-500/20"
    >
      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-4.835-1.301L.885 21.15l1.671-4.741A9.825 9.825 0 0 1 1.146 11.9C1.146 6.343 5.585 1.95 11.244 1.95c2.637 0 5.112 1.027 6.988 2.9a9.678 9.678 0 0 1 2.903 6.994c-.003 5.555-4.442 9.94-9.984 9.941" />
      </svg>
    </a>
  );
}
