import type { ReactNode } from "react";
import { generateFaqJsonLd, generateFaqMetadata } from "@/lib/metadata";

export const metadata = generateFaqMetadata();

const FAQ_SCHEMA_ITEMS = [
  {
    question: "Do I need an account to browse shops?",
    answer:
      "No — you can freely browse shops, categories, and products, and even build a cart, without signing up. To place an order you need an account with your full name, phone number, and a verified email.",
  },
  {
    question: "How do I place an order?",
    answer:
      "Add items to your cart, proceed to checkout, and confirm your delivery details. Your order is compiled into a WhatsApp message sent directly to the merchant for confirmation.",
  },
  {
    question: "How do I register my store on Trends Mart?",
    answer:
      "Tap Register Store, fill in your business name, category, phone, and logo. Your store goes live after email verification and admin approval.",
  },
  {
    question: "What cities does Trends Mart serve?",
    answer:
      "Trends Mart is a hyper-local marketplace serving Pakistan, with strong coverage in Gujranwala, Lahore, Islamabad, Karachi, and Faisalabad.",
  },
];

const FAQ_JSON_LD = generateFaqJsonLd(FAQ_SCHEMA_ITEMS);

export default function FaqLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />
      {children}
    </>
  );
}
