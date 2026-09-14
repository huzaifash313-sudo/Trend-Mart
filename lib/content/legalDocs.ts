import type { LocaleCode } from "@/lib/i18n/dictionaries";

export type Bilingual = { en: string; ur: string };

export type LegalBullet =
  | Bilingual
  | {
      strong: Bilingual;
      text: Bilingual;
    };

export interface LegalDocLink {
  href: string;
  label: Bilingual;
  /** Text before the link, e.g. "Also see " */
  prefix?: Bilingual;
  /** Text after the link, e.g. "." */
  suffix?: Bilingual;
}

export interface LegalDocSection {
  heading: Bilingual;
  paragraphs?: Bilingual[];
  bullets?: LegalBullet[];
  links?: LegalDocLink[];
}

export interface LegalDoc {
  icon: string;
  lastUpdated: string;
  href: string;
  title: Bilingual;
  sections: LegalDocSection[];
}

export type LegalDocKey =
  | "terms"
  | "privacy"
  | "reviews"
  | "refund-policy"
  | "merchant-guidelines";

function pick(locale: LocaleCode, text: Bilingual): string {
  return locale === "ur" ? text.ur : text.en;
}

export function pickLocale(locale: LocaleCode, text: Bilingual): string {
  return pick(locale, text);
}

export const LEGAL_DOCS: Record<LegalDocKey, LegalDoc> = {
  terms: {
    icon: "📜",
    lastUpdated: "August 8, 2026",
    href: "/legal/terms",
    title: {
      en: "Terms & Conditions",
      ur: "شرائط و ضوابط",
    },
    sections: [
      {
        heading: {
          en: "1. Acceptance of Terms",
          ur: "۱۔ شرائط کی قبولیت",
        },
        paragraphs: [
          {
            en: 'By creating an account, browsing shops, placing an order, or registering a store on TrendsMart ("the Platform"), you agree to be bound by these Terms & Conditions. If you do not agree, please do not use the Platform.',
            ur: "TrendsMart (\"پلیٹ فارم\") پر اکاؤنٹ بنانے، دکانیں دیکھنے، آرڈر کرنے یا سٹور رجسٹر کرنے سے آپ ان شرائط و ضوابط سے پابند ہونے پر راضی ہوتے ہیں۔ اگر آپ متفق نہیں، پلیٹ فارم استعمال نہ کریں۔",
          },
        ],
      },
      {
        heading: {
          en: "2. What TrendsMart Is",
          ur: "۲۔ TrendsMart کیا ہے",
        },
        paragraphs: [
          {
            en: 'TrendsMart is a hyper-local multi-vendor marketplace that connects customers with independent merchants ("Sellers") in their area. TrendsMart provides the technology — storefronts, product listings, search, cart, and WhatsApp-based order routing — but each Seller is solely responsible for the products or services they list, their pricing, stock availability, order fulfillment, and delivery.',
            ur: "TrendsMart ایک ہائپر لوکل ملٹی وینڈر مارکیٹ پلیس ہے جو گاہکوں کو ان کے علاقے کے آزاد مرچنٹس (\"فروخت کنندگان\") سے جوڑتا ہے۔ TrendsMart ٹیکنالوجی فراہم کرتا ہے — سٹور فرنٹ، پروڈکٹ لسٹنگ، سرچ، کارٹ اور WhatsApp پر آرڈر بھیجنا — مگر ہر فروخت کنندہ اپنی فہرست کردہ مصنوعات/خدمات، قیمت، دستیابی، آرڈر کی تکمیل اور ڈیلیوری کا خود ذمہ دار ہے۔",
          },
        ],
      },
      {
        heading: {
          en: "3. Accounts & Roles",
          ur: "۳۔ اکاؤنٹس اور کردار",
        },
        bullets: [
          {
            strong: { en: "Guests", ur: "مہمان" },
            text: {
              en: "may browse shops, categories, and products, and build a cart without creating an account.",
              ur: "بغیر اکاؤنٹ کے دکانیں، کیٹگریز اور مصنوعات دیکھ سکتے ہیں اور کارٹ بنا سکتے ہیں۔",
            },
          },
          {
            strong: { en: "Customers", ur: "گاہک" },
            text: {
              en: "must create an account with their full name and phone number, and verify their email before an order is placed. Phone numbers are required contact/delivery details. Phone SMS OTP verification is not enabled at this time (email OTP only).",
              ur: "آرڈر سے پہلے پورا نام اور فون نمبر والا اکاؤنٹ بنائیں اور ای میل تصدیق کریں۔ فون نمبر رابطہ/ڈیلیوری کے لیے ضروری ہے۔ اس وقت فون SMS OTP فعال نہیں (صرف ای میل OTP)۔",
            },
          },
          {
            strong: { en: "Merchants", ur: "مرچنٹس" },
            text: {
              en: "must complete store registration with business name and WhatsApp/phone number. New stores go live immediately after email verification (auto-approved). TrendsMart may later introduce a Super-Admin approval queue and may still suspend stores that violate these Terms.",
              ur: "کاروباری نام اور WhatsApp/فون کے ساتھ سٹور رجسٹریشن مکمل کریں۔ ای میل تصدیق کے بعد نئے سٹور فوراً لائیو ہو جاتے ہیں (خودکار منظوری)۔ بعد میں Super-Admin منظوری قطار آ سکتی ہے، اور شرائط کی خلاف ورزی پر سٹور معطل بھی ہو سکتے ہیں۔",
            },
          },
        ],
        paragraphs: [
          {
            en: "You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.",
            ur: "اپنے اکاؤنٹ کی اسناد محفوظ رکھنا اور اس اکاؤنٹ کے تحت ہونے والی تمام سرگرمیوں کی ذمہ داری آپ پر ہے۔",
          },
        ],
      },
      {
        heading: {
          en: "4. Orders & Payments",
          ur: "۴۔ آرڈرز اور ادائیگیاں",
        },
        paragraphs: [
          {
            en: "Orders placed through TrendsMart are compiled and sent to the relevant merchant (via WhatsApp and/or the in-app order system). Payment terms (cash on delivery, bank transfer, or other methods) are agreed directly between the customer and the merchant unless stated otherwise on the storefront. TrendsMart is not a party to the sale contract between buyer and seller and does not guarantee product quality, availability, or delivery timelines. TrendsMart does not process product-order payments between customer and merchant.",
            ur: "TrendsMart پر دیے گئے آرڈر مرتب ہو کر متعلقہ مرچنٹ کو بھیجے جاتے ہیں (WhatsApp اور/یا ایپ کے آرڈر سسٹم سے)۔ ادائیگی کی شرائط (کیش آن ڈیلیوری، بینک ٹرانسفر یا دیگر طریقے) گاہک اور مرچنٹ کے درمیان براہِ راست طے ہوتی ہیں، جب تک سٹور فرنٹ پر کچھ اور نہ لکھا ہو۔ TrendsMart خریدار اور فروخت کنندہ کے درمیان فروخت کے معاہدے کا فریق نہیں، اور معیار، دستیابی یا ڈیلیوری وقت کی ضمانت نہیں دیتا۔ گاہک اور مرچنٹ کے درمیان پروڈکٹ آرڈر کی ادائیگی TrendsMart پروسیس نہیں کرتا۔",
          },
        ],
      },
      {
        heading: {
          en: "5. Merchant Obligations",
          ur: "۵۔ مرچنٹ کی ذمہ داریاں",
        },
        paragraphs: [
          {
            en: "Merchants agree to list accurate product information and pricing, honor the availability status shown to customers, fulfill accepted orders in good faith, and comply with the Merchant Security Guidelines at all times. TrendsMart reserves the right to suspend or remove any store that violates these Terms, engages in fraudulent activity, or receives repeated verified complaints.",
            ur: "مرچنٹس درست پروڈکٹ معلومات اور قیمتیں لگانے، گاہکوں کو دکھائی گئی دستیابی کا احترام کرنے، قبول شدہ آرڈرز نیک نیتی سے مکمل کرنے، اور ہر وقت مرچنٹ سیکیورٹی ہدایات پر عمل کرنے پر راضی ہیں۔ TrendsMart ان شرائط کی خلاف ورزی، فراڈ، یا بار بار تصدیق شدہ شکایات پر کسی بھی سٹور کو معطل یا ہٹانے کا حق رکھتا ہے۔",
          },
        ],
        links: [
          {
            href: "/legal/merchant-guidelines",
            label: {
              en: "Merchant Security Guidelines",
              ur: "مرچنٹ سیکیورٹی ہدایات",
            },
            prefix: {
              en: "Read the full ",
              ur: "مکمل ",
            },
            suffix: { en: ".", ur: " پڑھیں۔" },
          },
        ],
      },
      {
        heading: {
          en: "6. Prohibited Use",
          ur: "۶۔ ممنوعہ استعمال",
        },
        bullets: [
          {
            en: "Listing counterfeit, stolen, illegal, or prohibited goods.",
            ur: "جعلی، چوری شدہ، غیر قانونی یا ممنوعہ سامان کی فہرست۔",
          },
          {
            en: "Manipulating reviews, ratings, or analytics (see our Review & Rating Policy).",
            ur: "ریویوز، ریٹنگز یا تجزیات میں ہیرا پھیری (ریویو اور ریٹنگ پالیسی دیکھیں)۔",
          },
          {
            en: "Scraping, reverse-engineering, or attacking Platform infrastructure.",
            ur: "پلیٹ فارم انفراسٹرکچر کو سکریپ، ریورس انجینئر یا حملہ کرنا۔",
          },
          {
            en: "Impersonating another person, shop, or the TrendsMart team.",
            ur: "کسی اور شخص، دکان یا TrendsMart ٹیم کا بہروپ۔",
          },
        ],
        links: [
          {
            href: "/legal/reviews",
            label: {
              en: "Review & Rating Policy",
              ur: "ریویو اور ریٹنگ پالیسی",
            },
            prefix: {
              en: "Full rules for product and store ratings: ",
              ur: "پروڈکٹ اور سٹور ریٹنگ کے مکمل قواعد: ",
            },
            suffix: { en: ".", ur: "۔" },
          },
        ],
      },
      {
        heading: {
          en: "7. Limitation of Liability",
          ur: "۷۔ ذمہ داری کی حد",
        },
        paragraphs: [
          {
            en: 'TrendsMart is provided on an "as is" and "as available" basis. To the maximum extent permitted by law, TrendsMart is not liable for indirect, incidental, or consequential damages arising from your use of the Platform, transactions with merchants, or third-party services (e.g., WhatsApp, payment providers, delivery riders).',
            ur: "TrendsMart \"جیسا ہے\" اور \"جیسا دستیاب ہے\" کی بنیاد پر فراہم کیا جاتا ہے۔ قانون کی اجازت کی حد تک، پلیٹ فارم کے استعمال، مرچنٹس کے ساتھ لین دین، یا تیسری پارٹی سروسز (جیسے WhatsApp، ادائیگی فراہم کنندگان، ڈیلیوری رائیڈرز) سے پیدا ہونے والے بالواسطہ یا نتیجہ خیز نقصانات کا TrendsMart ذمہ دار نہیں۔",
          },
        ],
      },
      {
        heading: {
          en: "8. Changes to These Terms",
          ur: "۸۔ ان شرائط میں تبدیلیاں",
        },
        paragraphs: [
          {
            en: 'We may update these Terms from time to time. Continued use of the Platform after changes are posted constitutes acceptance of the revised Terms. Material changes will be highlighted on this page with an updated "Last updated" date.',
            ur: "ہم وقتاً فوقتاً ان شرائط کو اپڈیٹ کر سکتے ہیں۔ تبدیلیاں شائع ہونے کے بعد پلیٹ فارم کا مسلسل استعمال نظرِ ثانی شدہ شرائط کی قبولیت سمجھا جائے گا۔ اہم تبدیلیاں اس صفحے پر تازہ \"آخری اپڈیٹ\" تاریخ کے ساتھ نمایاں ہوں گی۔",
          },
        ],
      },
      {
        heading: {
          en: "9. Contact",
          ur: "۹۔ رابطہ",
        },
        paragraphs: [
          {
            en: "Questions about these Terms? Reach out via our Support Desk.",
            ur: "ان شرائط کے بارے میں سوال؟ ہمارے سپورٹ ڈیسک سے رابطہ کریں۔",
          },
        ],
        links: [
          {
            href: "/support",
            label: { en: "Support Desk", ur: "سپورٹ ڈیسک" },
            prefix: { en: "Visit the ", ur: "" },
            suffix: { en: ".", ur: " پر جائیں۔" },
          },
        ],
      },
    ],
  },

  privacy: {
    icon: "🔒",
    lastUpdated: "August 8, 2026",
    href: "/legal/privacy",
    title: {
      en: "Privacy Policy",
      ur: "پرائیویسی پالیسی",
    },
    sections: [
      {
        heading: {
          en: "1. Information We Collect",
          ur: "۱۔ ہم کون سی معلومات جمع کرتے ہیں",
        },
        bullets: [
          {
            strong: { en: "Account data", ur: "اکاؤنٹ ڈیٹا" },
            text: {
              en: ": email address, phone number (for orders/delivery), and authentication metadata when you sign up or verify via email OTP.",
              ur: ": ای میل، فون نمبر (آرڈر/ڈیلیوری کے لیے)، اور سائن اپ یا ای میل OTP تصدیق کے وقت تصدیقی میٹا ڈیٹا۔",
            },
          },
          {
            strong: { en: "Order data", ur: "آرڈر ڈیٹا" },
            text: {
              en: ": name, phone number, delivery address, and order contents needed to fulfill an order.",
              ur: ": نام، فون، ڈیلیوری پتہ، اور آرڈر مکمل کرنے کے لیے ضروری مواد۔",
            },
          },
          {
            strong: { en: "Location data", ur: "لوکیشن ڈیٹا" },
            text: {
              en: ": GPS coordinates or manually selected city/area, used only to show nearby shops and enforce merchant delivery radii — never sold to third parties.",
              ur: ": GPS کوآرڈینیٹس یا منتخب شہر/علاقہ — صرف قریبی دکانیں دکھانے اور مرچنٹ ڈیلیوری ریڈیئس نافذ کرنے کے لیے؛ کبھی تیسرے فریق کو نہیں بیچا جاتا۔",
            },
          },
          {
            strong: { en: "Merchant data", ur: "مرچنٹ ڈیٹا" },
            text: {
              en: ": shop details, product listings, and uploaded images/logos/banners.",
              ur: ": دکان کی تفصیل، پروڈکٹ لسٹنگ، اور اپ لوڈ شدہ تصاویر/لوگو/بینرز۔",
            },
          },
          {
            strong: { en: "Usage data", ur: "استعمال کا ڈیٹا" },
            text: {
              en: ': pages viewed, product clicks, and search queries, used to power analytics and the "For You" recommendation sorting.',
              ur: ": دیکھی گئی صفحات، پروڈکٹ کلکس اور سرچ — تجزیات اور \"آپ کے لیے\" سفارشات کے لیے۔",
            },
          },
        ],
      },
      {
        heading: {
          en: "2. How We Use Your Information",
          ur: "۲۔ معلومات کا استعمال",
        },
        bullets: [
          {
            en: "To operate the marketplace: matching customers with nearby shops, processing orders, and enabling WhatsApp-based order routing.",
            ur: "مارکیٹ پلیس چلانا: گاہکوں کو قریبی دکانوں سے ملانا، آرڈرز سنبھالنا، اور WhatsApp آرڈر بھیجنا۔",
          },
          {
            en: "To verify identity via email OTP at account creation and before checkout.",
            ur: "اکاؤنٹ بناتے اور چیک آؤٹ سے پہلے ای میل OTP سے شناخت کی تصدیق۔",
          },
          {
            en: "To personalize search results, sorting, and recommendations.",
            ur: "سرچ نتائج، ترتیب اور سفارشات ذاتی بنانا۔",
          },
          {
            en: "To detect fraud, abuse, and violations of our Terms & Conditions.",
            ur: "فراڈ، غلط استعمال اور شرائط کی خلاف ورزی کا پتہ لگانا۔",
          },
          {
            en: "To send transactional communications (order confirmations, status updates, and email OTP codes). SMS OTP is not currently used.",
            ur: "ٹرانزیکشنل پیغامات (آرڈر تصدیق، اسٹیٹس اپڈیٹ، ای میل OTP)۔ اس وقت SMS OTP استعمال نہیں ہوتا۔",
          },
        ],
      },
      {
        heading: {
          en: "3. Data Sharing",
          ur: "۳۔ ڈیٹا شیئرنگ",
        },
        paragraphs: [
          {
            en: "We share the minimum necessary order details (name, phone, delivery address, order contents) with the merchant fulfilling your order. We do not sell your personal data to third parties. We may share data with service providers strictly to operate the Platform (e.g., Supabase for database/auth hosting, Cloudinary for image storage, and our transactional email provider) under contractual confidentiality obligations.",
            ur: "ہم آپ کے آرڈر کے لیے ضروری کم از کم تفصیلات (نام، فون، پتہ، مواد) صرف متعلقہ مرچنٹ سے شیئر کرتے ہیں۔ ذاتی ڈیٹا تیسرے فریق کو نہیں بیچتے۔ پلیٹ فارم چلانے کے لیے سروس فراہم کنندگان (جیسے ڈیٹا بیس/آتھ کے لیے Supabase، تصاویر کے لیے Cloudinary، اور ٹرانزیکشنل ای میل) کے ساتھ معاہدہ رازداری کے تحت ڈیٹا شیئر ہو سکتا ہے۔",
          },
        ],
      },
      {
        heading: {
          en: "4. Data Retention",
          ur: "۴۔ ڈیٹا برقرار رکھنا",
        },
        paragraphs: [
          {
            en: "We retain account and order data for as long as your account is active or as needed to comply with legal obligations, resolve disputes, and enforce our agreements. You may request deletion of your account and associated personal data via the Support Desk, subject to any records we are legally required to keep.",
            ur: "اکاؤنٹ اور آرڈر ڈیٹا اس وقت تک رکھا جاتا ہے جب تک اکاؤنٹ فعال ہو یا قانونی ذمہ داری، تنازعات حل کرنے اور معاہدے نافذ کرنے کے لیے ضروری ہو۔ سپورٹ ڈیسک سے اکاؤنٹ اور متعلقہ ذاتی ڈیٹا حذف کرنے کی درخواست کر سکتے ہیں — قانونی طور پر رکھے جانے والے ریکارڈز کے علاوہ۔",
          },
        ],
      },
      {
        heading: {
          en: "5. Your Rights",
          ur: "۵۔ آپ کے حقوق",
        },
        bullets: [
          {
            en: "Access the personal data we hold about you.",
            ur: "آپ کے بارے میں ہمارے پاس موجود ذاتی ڈیٹا تک رسائی۔",
          },
          {
            en: "Correct inaccurate data via your account settings.",
            ur: "اکاؤنٹ سیٹنگز سے غلط ڈیٹا درست کرنا۔",
          },
          {
            en: "Request deletion of your account and data.",
            ur: "اکاؤنٹ اور ڈیٹا حذف کرنے کی درخواست۔",
          },
          {
            en: "Withdraw location permission at any time via your device/browser settings.",
            ur: "ڈیوائس/براؤزر سیٹنگز سے کسی بھی وقت لوکیشن اجازت واپس لینا۔",
          },
        ],
      },
      {
        heading: {
          en: "6. Cookies & Local Storage",
          ur: "۶۔ کوکیز اور لوکل اسٹوریج",
        },
        paragraphs: [
          {
            en: "TrendsMart uses local storage/session storage to persist your cart, theme preference, and location selection between visits. These are functional, not third-party advertising cookies.",
            ur: "TrendsMart کارٹ، تھیم اور لوکیشن پسندیدگی محفوظ رکھنے کے لیے لوکل/سیشن اسٹوریج استعمال کرتا ہے۔ یہ فنکشنل ہیں — تیسری پارٹی اشتہاری کوکیز نہیں۔",
          },
        ],
      },
      {
        heading: {
          en: "7. Security",
          ur: "۷۔ سیکیورٹی",
        },
        paragraphs: [
          {
            en: "We apply industry-standard safeguards — encrypted connections (HTTPS), Row Level Security on our database, and rate limiting on sensitive endpoints — to protect your data. No method of transmission or storage is 100% secure, and we encourage you to use a strong, unique password.",
            ur: "ہم معیاری حفاظتی اقدامات استعمال کرتے ہیں — انکرپٹڈ کنکشن (HTTPS)، ڈیٹا بیس پر Row Level Security، اور حساس اینڈ پوائنٹس پر ریٹ لمٹنگ۔ کوئی بھی طریقہ ۱۰۰٪ محفوظ نہیں؛ مضبوط، منفرد پاس ورڈ استعمال کریں۔",
          },
        ],
      },
      {
        heading: {
          en: "8. Contact",
          ur: "۸۔ رابطہ",
        },
        paragraphs: [
          {
            en: "For privacy questions or data requests, contact us via our Support Desk.",
            ur: "پرائیویسی سوالات یا ڈیٹا درخواستوں کے لیے سپورٹ ڈیسک سے رابطہ کریں۔",
          },
        ],
        links: [
          {
            href: "/support",
            label: { en: "Support Desk", ur: "سپورٹ ڈیسک" },
            prefix: { en: "Open the ", ur: "" },
            suffix: { en: ".", ur: " کھولیں۔" },
          },
        ],
      },
    ],
  },

  reviews: {
    icon: "⭐",
    lastUpdated: "September 13, 2026",
    href: "/legal/reviews",
    title: {
      en: "Review & Rating Policy",
      ur: "ریویو اور ریٹنگ پالیسی",
    },
    sections: [
      {
        heading: { en: "1. Purpose", ur: "۱۔ مقصد" },
        paragraphs: [
          {
            en: "Reviews help neighbours choose trustworthy local shops and products. TrendsMart only allows verified purchase feedback so ratings stay useful and fair.",
            ur: "ریویوز پڑوسیوں کو قابلِ اعتماد مقامی دکانیں اور مصنوعات چننے میں مدد دیتے ہیں۔ TrendsMart صرف تصدیق شدہ خریداری کی رائے قبول کرتا ہے تاکہ ریٹنگز مفید اور منصفانہ رہیں۔",
          },
        ],
      },
      {
        heading: {
          en: "2. What you can review",
          ur: "۲۔ آپ کیا ریویو کر سکتے ہیں",
        },
        bullets: [
          {
            strong: { en: "Product reviews", ur: "پروڈکٹ ریویوز" },
            text: {
              en: " — rate a specific item you received. These appear on the product page and also count toward the shop's overall score.",
              ur: " — موصول آئٹم کی ریٹنگ۔ پروڈکٹ صفحے پر دکھتے ہیں اور دکان کے مجموعی اسکور میں بھی شمار ہوتے ہیں۔",
            },
          },
          {
            strong: { en: "Store reviews", ur: "سٹور ریویوز" },
            text: {
              en: " — optional overall experience review for the shop (delivery, service, packaging). Separate from product ratings.",
              ur: " — دکان کے مجموعی تجربے کا اختیاری ریویو (ڈیلیوری، سروس، پیکجنگ)۔ پروڈکٹ ریٹنگ سے الگ۔",
            },
          },
        ],
      },
      {
        heading: { en: "3. Eligibility", ur: "۳۔ اہلیت" },
        bullets: [
          {
            en: "You must be signed in with the same account that placed the order.",
            ur: "اسی اکاؤنٹ سے سائن ان ہوں جس سے آرڈر کیا تھا۔",
          },
          {
            en: "The order must be marked Delivered before you can submit.",
            ur: "جمع کرانے سے پہلے آرڈر Delivered نشان زد ہونا چاہیے۔",
          },
          {
            en: "For product reviews, that delivered order must include the product.",
            ur: "پروڈکٹ ریویو کے لیے ڈیلیورڈ آرڈر میں وہ پروڈکٹ شامل ہونا ضروری ہے۔",
          },
          {
            en: "Shop owners cannot review their own store or products.",
            ur: "دکان مالک اپنی دکان یا مصنوعات کا ریویو نہیں کر سکتے۔",
          },
          {
            en: "One product review per product per account; one overall shop review per account.",
            ur: "فی اکاؤنٹ فی پروڈکٹ ایک ریویو؛ فی اکاؤنٹ ایک مجموعی شاپ ریویو۔",
          },
        ],
      },
      {
        heading: {
          en: "4. Honesty & prohibited conduct",
          ur: "۴۔ ایمانداری اور ممنوعہ رویہ",
        },
        bullets: [
          {
            en: "Only verified buyers with a Delivered order can leave a review.",
            ur: "صرف Delivered آرڈر والے تصدیق شدہ خریدار ریویو دے سکتے ہیں۔",
          },
          {
            en: "One review per product (and one overall shop review) per account.",
            ur: "فی اکاؤنٹ فی پروڈکٹ ایک ریویو (اور ایک مجموعی شاپ ریویو)۔",
          },
          {
            en: "Your display name is locked to your account — no fake names.",
            ur: "ڈسپلے نام اکاؤنٹ سے جڑا ہے — جعلی نام نہیں۔",
          },
          {
            en: "Reviews must be honest; spam, abuse, or fake ratings may be removed.",
            ur: "ریویو ایماندار ہوں؛ اسپام، بدسلوکی یا جعلی ریٹنگ ہٹائی جا سکتی ہے۔",
          },
          {
            en: "Shop owners may reply but cannot rate their own store or products.",
            ur: "دکان مالک جواب دے سکتے ہیں مگر اپنی دکان/مصنوعات ریٹ نہیں کر سکتے۔",
          },
          {
            en: "You may delete your own review; ratings then recalculate automatically.",
            ur: "اپنا ریویو حذف کر سکتے ہیں؛ پھر ریٹنگز خود دوبارہ حساب ہوتی ہیں۔",
          },
          {
            en: "Buying, selling, or coercing reviews is prohibited and may lead to account or store suspension.",
            ur: "ریویوز خریدنا، بیچنا یا مجبور کرنا ممنوع ہے — اکاؤنٹ یا سٹور معطل ہو سکتا ہے۔",
          },
          {
            en: "Hate speech, threats, personal data dumps, and spam will be removed.",
            ur: "نفرت انگیز کلام، دھمکیاں، ذاتی ڈیٹا اور اسپام ہٹا دیے جائیں گے۔",
          },
        ],
      },
      {
        heading: {
          en: "5. Merchant replies",
          ur: "۵۔ مرچنٹ کے جوابات",
        },
        paragraphs: [
          {
            en: "Store owners may post one public reply per review to address feedback professionally. Replies must not harass customers or include private contact details beyond what is needed to resolve the issue.",
            ur: "دکان مالک فی ریویو ایک عوامی جواب دے سکتے ہیں۔ جواب میں گاہک کو ہراساں نہ کریں اور مسئلہ حل کرنے سے زیادہ نجی رابطہ تفصیل شامل نہ کریں۔",
          },
        ],
      },
      {
        heading: {
          en: "6. Editing & deletion",
          ur: "۶۔ ترمیم اور حذف",
        },
        paragraphs: [
          {
            en: "Authors may delete their own review. Deleted reviews are removed from public lists and rating averages recalculate automatically. TrendsMart may also remove reviews that violate this policy or applicable law.",
            ur: "مصنف اپنا ریویو حذف کر سکتے ہیں۔ حذف شدہ ریویوز عوامی فہرست سے ہٹ جاتے ہیں اور اوسط ریٹنگ خود دوبارہ حساب ہوتی ہے۔ پالیسی یا قانون کی خلاف ورزی پر TrendsMart بھی ریویو ہٹا سکتا ہے۔",
          },
        ],
      },
      {
        heading: { en: "7. Contact", ur: "۷۔ رابطہ" },
        paragraphs: [
          {
            en: "Report abuse via our Support Desk. Also see Terms & Conditions.",
            ur: "غلط استعمال کی اطلاع سپورٹ ڈیسک سے دیں۔ شرائط و ضوابط بھی دیکھیں۔",
          },
        ],
        links: [
          {
            href: "/support",
            label: { en: "Support Desk", ur: "سپورٹ ڈیسک" },
            prefix: { en: "Report via ", ur: "" },
            suffix: { en: ". ", ur: " سے اطلاع دیں۔ " },
          },
          {
            href: "/legal/terms",
            label: { en: "Terms & Conditions", ur: "شرائط و ضوابط" },
            prefix: { en: "Also see ", ur: "نیز دیکھیں: " },
            suffix: { en: ".", ur: "۔" },
          },
        ],
      },
    ],
  },

  "refund-policy": {
    icon: "↩️",
    lastUpdated: "August 8, 2026",
    href: "/legal/refund-policy",
    title: {
      en: "Refund & Order Policy",
      ur: "رقم واپسی اور آرڈر پالیسی",
    },
    sections: [
      {
        heading: {
          en: "1. Order Cancellation",
          ur: "۱۔ آرڈر منسوخ کرنا",
        },
        paragraphs: [
          {
            en: "Orders can typically be cancelled while in the Pending status, before the merchant begins processing. Once an order moves to Processing or later, cancellation is at the merchant's discretion — contact the merchant directly (via the WhatsApp thread from your order) as soon as possible.",
            ur: "آرڈر عام طور پر Pending اسٹیٹس میں، مرچنٹ کے پروسیس شروع کرنے سے پہلے، منسوخ ہو سکتا ہے۔ Processing یا اس کے بعد منسوخ کرنا مرچنٹ کی مرضی پر ہے — جلد از جلد آرڈر کے WhatsApp تھریڈ سے مرچنٹ سے رابطہ کریں۔",
          },
        ],
      },
      {
        heading: { en: "2. Refunds", ur: "۲۔ رقم واپسی" },
        paragraphs: [
          {
            en: "Because payment is arranged directly between the customer and the merchant (e.g., cash on delivery or bank transfer), refunds are processed by the merchant according to their own store policy. TrendsMart facilitates dispute resolution but does not hold customer funds and cannot directly issue refunds on a merchant's behalf. TrendsMart does not process product-order payments.",
            ur: "چونکہ ادائیگی گاہک اور مرچنٹ کے درمیان براہِ راست ہوتی ہے (جیسے کیش آن ڈیلیوری یا بینک ٹرانسفر)، رقم واپسی مرچنٹ اپنی سٹور پالیسی کے مطابق کرتا ہے۔ TrendsMart تنازعہ حل میں مدد کر سکتا ہے مگر گاہک کے فنڈز نہیں رکھتا اور مرچنٹ کی طرف سے براہِ راست ریفنڈ نہیں دے سکتا۔ پروڈکٹ آرڈر کی ادائیگی TrendsMart پروسیس نہیں کرتا۔",
          },
        ],
      },
      {
        heading: {
          en: "3. Damaged, Wrong, or Missing Items",
          ur: "۳۔ خراب، غلط یا گم شدہ آئٹمز",
        },
        bullets: [
          {
            en: "Inspect your order upon delivery whenever possible.",
            ur: "جہاں ممکن ہو، ڈیلیوری پر آرڈر چیک کریں۔",
          },
          {
            en: "Contact the merchant within 24 hours of delivery for damaged, incorrect, or missing items, including photos where relevant.",
            ur: "خراب، غلط یا گم آئٹمز کے لیے ڈیلیوری کے ۲۴ گھنٹوں میں مرچنٹ سے رابطہ کریں — جہاں مناسب ہو تصاویر بھی بھیجیں۔",
          },
          {
            en: "If the merchant is unresponsive after 48 hours, escalate the issue to TrendsMart Support with your order details.",
            ur: "۴۸ گھنٹے بعد بھی مرچنٹ جواب نہ دے تو آرڈر تفصیل کے ساتھ TrendsMart Support تک لے جائیں۔",
          },
        ],
      },
      {
        heading: {
          en: "4. Non-Returnable Categories",
          ur: "۴۔ غیر واپسی کیٹگریز",
        },
        paragraphs: [
          {
            en: "Perishable goods, made-to-order items, and personal-care products are generally non-returnable unless defective on arrival, subject to the specific merchant's storefront policy.",
            ur: "خراب ہونے والی اشیاء، آرڈر پر بننے والی چیزیں اور ذاتی نگہداشت کی مصنوعات عام طور پر واپس نہیں ہوتیں جب تک ڈیلیوری پر عیب نہ ہو — متعلقہ مرچنٹ کی سٹور فرنٹ پالیسی کے مطابق۔",
          },
        ],
      },
      {
        heading: {
          en: "5. Delivery Fees & Minimum Order Amounts",
          ur: "۵۔ ڈیلیوری فیس اور کم از کم آرڈر",
        },
        paragraphs: [
          {
            en: "Each merchant may set their own minimum order amount and delivery fee slabs (including free delivery above a threshold, and distance-based charges for orders placed near the edge of their delivery radius). These are shown at checkout before you confirm your order.",
            ur: "ہر مرچنٹ اپنا کم از کم آرڈر اور ڈیلیوری فیس سلیب سیٹ کر سکتا ہے (حد سے اوپر مفت ڈیلیوری، اور ریڈیئس کے کنارے پر فاصلے کی فیس)۔ یہ سب چیک آؤٹ پر تصدیق سے پہلے دکھائی دیتے ہیں۔",
          },
        ],
      },
      {
        heading: {
          en: "6. Dispute Escalation",
          ur: "۶۔ تنازعہ بڑھانا",
        },
        paragraphs: [
          {
            en: "If a merchant does not resolve your issue satisfactorily, submit a ticket via our Support Desk with your order ID, and our team will review the case and may take action on the merchant's account per our Merchant Security Guidelines.",
            ur: "اگر مرچنٹ مسئلہ مناسب طور پر حل نہ کرے تو سپورٹ ڈیسک پر آرڈر ID کے ساتھ ٹکٹ دیں — ہم کیس دیکھیں گے اور مرچنٹ سیکیورٹی ہدایات کے تحت اکاؤنٹ پر کارروائی کر سکتے ہیں۔",
          },
        ],
        links: [
          {
            href: "/support",
            label: { en: "Support Desk", ur: "سپورٹ ڈیسک" },
            prefix: { en: "Open ", ur: "" },
            suffix: { en: ". ", ur: " کھولیں۔ " },
          },
          {
            href: "/legal/merchant-guidelines",
            label: {
              en: "Merchant Security Guidelines",
              ur: "مرچنٹ سیکیورٹی ہدایات",
            },
            prefix: { en: "See also ", ur: "نیز دیکھیں: " },
            suffix: { en: ".", ur: "۔" },
          },
        ],
      },
    ],
  },

  "merchant-guidelines": {
    icon: "🛡️",
    lastUpdated: "August 8, 2026",
    href: "/legal/merchant-guidelines",
    title: {
      en: "Merchant Security Guidelines",
      ur: "مرچنٹ سیکیورٹی ہدایات",
    },
    sections: [
      {
        heading: { en: "1. Going Live", ur: "۱۔ لائیو ہونا" },
        paragraphs: [
          {
            en: "When you register a store with a verified email, it goes live on the marketplace immediately — there is no Super-Admin approval wait. Keep your store details accurate (name, category, WhatsApp, logo). TrendsMart may still suspend stores that violate these guidelines without notice.",
            ur: "تصدیق شدہ ای میل کے ساتھ سٹور رجسٹر کرنے پر وہ فوراً مارکیٹ پلیس پر لائیو ہو جاتا ہے — Super-Admin منظوری کا انتظار نہیں۔ سٹور تفصیلات درست رکھیں (نام، کیٹگری، WhatsApp، لوگو)۔ ان ہدایات کی خلاف ورزی پر TrendsMart بغیر نوٹس سٹور معطل کر سکتا ہے۔",
          },
        ],
      },
      {
        heading: {
          en: "2. Account Security",
          ur: "۲۔ اکاؤنٹ سیکیورٹی",
        },
        bullets: [
          {
            en: "Use a strong, unique password for your merchant account and never share your login credentials.",
            ur: "مرچنٹ اکاؤنٹ کے لیے مضبوط، منفرد پاس ورڈ رکھیں اور لاگ اِن معلومات شیئر نہ کریں۔",
          },
          {
            en: "Keep your registered WhatsApp number active and monitored — this is how customer orders reach you.",
            ur: "رجسٹرڈ WhatsApp نمبر فعال اور چیک کرتے رہیں — گاہک کے آرڈر یہیں پہنچتے ہیں۔",
          },
          {
            en: "Report any suspicious activity on your account (e.g., products you didn't list) to Support immediately.",
            ur: "اکاؤنٹ پر مشکوک سرگرمی (جیسے وہ پروڈکٹ جو آپ نے نہیں لگائی) فوراً Support کو بتائیں۔",
          },
        ],
      },
      {
        heading: {
          en: "3. Product Listing Integrity",
          ur: "۳۔ پروڈکٹ لسٹنگ کی دیانت",
        },
        bullets: [
          {
            en: "List only products/services you can actually fulfill. Keep the availability toggle accurate — mark items Out of Stock instead of leaving them listed as available.",
            ur: "صرف وہی مصنوعات/خدمات لگائیں جو آپ پوری کر سکیں۔ دستیابی ٹوگل درست رکھیں — دستیاب دکھانے کے بجائے Out of Stock کریں۔",
          },
          {
            en: 'Original/markdown pricing ("% OFF" badges) must reflect a genuine prior price, not an inflated "before" price used to fake a discount.',
            ur: "اصل/مارک ڈاؤن قیمت (\"% OFF\" بیج) حقیقی پچھلی قیمت دکھائے — جعلی ڈسکاؤنٹ کے لیے بڑھا ہوا \"پہلے\" نہ لگائیں۔",
          },
          {
            en: "Do not list counterfeit, stolen, hazardous, or platform-prohibited goods.",
            ur: "جعلی، چوری شدہ، خطرناک یا پلیٹ فارم پر ممنوع سامان نہ لگائیں۔",
          },
          {
            en: "Upload real product photos. Do not use misleading stock photos for physical goods you sell.",
            ur: "اصل پروڈکٹ فوٹوز اپ لوڈ کریں۔ جسمانی سامان کے لیے گمراہ کن اسٹاک فوٹوز نہ لگائیں۔",
          },
        ],
      },
      {
        heading: {
          en: "4. Delivery & Service Radius",
          ur: "۴۔ ڈیلیوری اور سروس ریڈیئس",
        },
        paragraphs: [
          {
            en: "Set your delivery/service radius honestly to reflect the area you can realistically serve. Repeatedly accepting orders you cannot fulfill within your stated radius, minimum order amount, or delivery slabs may result in a suspension.",
            ur: "ڈیلیوری/سروس ریڈیئس ایمانداری سے سیٹ کریں جو آپ واقعی سروس کر سکیں۔ بتائے ہوئے ریڈیئس، کم از کم آرڈر یا ڈیلیوری سلیب کے اندر پورا نہ کر سکنے والے آرڈرز بار بار قبول کرنے پر معطل ہو سکتا ہے۔",
          },
        ],
      },
      {
        heading: {
          en: "5. Customer Communication",
          ur: "۵۔ گاہک سے رابطہ",
        },
        bullets: [
          {
            en: "Respond to customer inquiries and orders promptly and professionally.",
            ur: "گاہک کے سوالات اور آرڈرز کا فوری اور پیشہ ورانہ جواب دیں۔",
          },
          {
            en: "Do not use customer contact information obtained through TrendsMart for unsolicited marketing outside the platform.",
            ur: "TrendsMart سے ملنے والی گاہک رابطہ معلومات پلیٹ فارم سے باہر بلا اجازت مارکیٹنگ کے لیے استعمال نہ کریں۔",
          },
          {
            en: "Update order status (Pending → Processing → Dispatched → Delivered) promptly so customers can track their order.",
            ur: "آرڈر اسٹیٹس (Pending → Processing → Dispatched → Delivered) جلدی اپڈیٹ کریں تاکہ گاہک ٹریک کر سکیں۔",
          },
        ],
      },
      {
        heading: {
          en: "6. Data & Image Uploads",
          ur: "۶۔ ڈیٹا اور تصویر اپ لوڈ",
        },
        paragraphs: [
          {
            en: "Only upload images you own the rights to. Uploaded media is automatically compressed and converted to WebP for storage efficiency — do not attempt to bypass or abuse the upload pipeline (e.g., uploading non-product files, excessively large files, or scripts).",
            ur: "صرف وہ تصاویر اپ لوڈ کریں جن کے حقوق آپ کے پاس ہوں۔ میڈیا خود کمپریس ہو کر WebP بن جاتی ہے — اپ لوڈ پائپ لائن کو بائی پاس یا غلط استعمال نہ کریں (غیر پروڈکٹ فائلیں، بہت بڑی فائلیں، یا اسکرپٹس)۔",
          },
        ],
      },
      {
        heading: { en: "7. Enforcement", ur: "۷۔ نفاذ" },
        paragraphs: [
          {
            en: "Violations of these guidelines may result in a warning, temporary suspension (store hidden from customers), or permanent removal from the Platform, at TrendsMart's sole discretion. Serious violations (fraud, counterfeit goods, harassment) may be reported to relevant authorities.",
            ur: "ان ہدایات کی خلاف ورزی پر تنبیہ، عارضی معطلی (گاہکوں سے سٹور چھپانا)، یا پلیٹ فارم سے مستقل ہٹانا ممکن ہے — TrendsMart کی صوابدید پر۔ سنگین خلاف ورزیاں (فراڈ، جعلی سامان، ہراساں کرنا) متعلقہ حکام کو رپورٹ ہو سکتی ہیں۔",
          },
        ],
      },
      {
        heading: { en: "8. Questions", ur: "۸۔ سوالات" },
        paragraphs: [
          {
            en: "Need help setting up your store correctly? See our New Merchant Guide & FAQ or reach out via Support.",
            ur: "سٹور درست سیٹ اپ میں مدد چاہیے؟ نیا مرچنٹ گائیڈ اور FAQ دیکھیں یا Support سے رابطہ کریں۔",
          },
        ],
        links: [
          {
            href: "/faq",
            label: {
              en: "New Merchant Guide & FAQ",
              ur: "نیا مرچنٹ گائیڈ اور FAQ",
            },
            prefix: { en: "See our ", ur: "" },
            suffix: { en: " or ", ur: " دیکھیں یا " },
          },
          {
            href: "/support",
            label: { en: "Support", ur: "سپورٹ" },
            prefix: { en: "", ur: "" },
            suffix: { en: ".", ur: " سے رابطہ کریں۔" },
          },
        ],
      },
    ],
  },
};

export function getLegalDoc(key: LegalDocKey): LegalDoc {
  return LEGAL_DOCS[key];
}
