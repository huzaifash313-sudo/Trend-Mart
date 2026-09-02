import AiAssistantChat from "@/components/ai/AiAssistantChat";

export const metadata = {
  title: "AI Shopping Assistant | TrendsMart",
  description: "Free AI assistant — product links, deals, shops. Try: best mobile ka link do.",
};

export default function PublicAssistantPage() {
  return (
    <AiAssistantChat
      role="customer"
      title="AI Shopping Assistant"
      subtitle="Product links, deals & shop finder — no sign-in required."
      accentClass="from-violet-600 to-indigo-600"
      backHref="/"
      backLabel="← Home"
    />
  );
}
