import type { LocaleCode } from "@/lib/i18n/dictionaries";

export interface FaqItem {
  q: string;
  a: string;
}

const CUSTOMER_FAQS_EN: FaqItem[] = [
  {
    q: "Do I need an account to browse shops?",
    a: "No — you can freely browse shops, categories, and products, and even build a cart, without signing up. To place an order you need an account with your full name, phone number, and a verified email. Phone SMS OTP is not required right now.",
  },
  {
    q: "How do I place an order?",
    a: "Create an account and verify your email, add items to your cart, tap Checkout, enter your delivery details, share your live location (required for the rider), and confirm. TrendsMart saves the order, then you tap Open WhatsApp to send it to the shop. The shop only sees the WhatsApp message after that tap. Each item includes a TrendsMart link so the shop can open the exact product.",
  },
  {
    q: "Why can't I see a shop that I know exists nearby?",
    a: "Merchants set a delivery/service radius. If you're outside that radius, or the shop's location hasn't been pinned yet, it won't appear in your nearby results. Try widening your search radius from the filter.",
  },
  {
    q: "How does delivery pricing work?",
    a: "Each merchant sets their own minimum order amount and delivery fee slabs — for example, free delivery above a spending threshold, or a small fee that increases with distance. These are shown clearly at checkout before you confirm.",
  },
  {
    q: "Can I cancel or return an order?",
    a: "Orders can usually be cancelled while still Pending. For returns, damaged items, or disputes, see our Refund & Order Policy — most issues are resolved directly with the merchant via WhatsApp.",
  },
  {
    q: "How do I track my order?",
    a: "Visit Orders → Track Order. Status stays Pending until the shop updates it in their dashboard (Processing → Dispatched → Delivered). This is not live GPS tracking, and we do not send automatic status notifications.",
  },
];

const CUSTOMER_FAQS_UR: FaqItem[] = [
  {
    q: "کیا دکان دیکھنے کے لیے اکاؤنٹ ضروری ہے؟",
    a: "نہیں — آپ بغیر سائن اپ کے دکانیں، کیٹگریز اور مصنوعات دیکھ سکتے ہیں، اور کارٹ بھی بنا سکتے ہیں۔ آرڈر کرنے کے لیے پورا نام، فون نمبر اور تصدیق شدہ ای میل والا اکاؤنٹ چاہیے۔ اس وقت فون SMS OTP ضروری نہیں۔",
  },
  {
    q: "آرڈر کیسے کروں؟",
    a: "اکاؤنٹ بنائیں اور ای میل تصدیق کریں، کارٹ میں آئٹمز ڈالیں، Checkout دبائیں، ڈیلیوری تفصیلات لکھیں، لائیو لوکیشن شیئر کریں (رائیڈر کے لیے ضروری)، پھر تصدیق کریں۔ TrendsMart آرڈر محفوظ کر لیتا ہے — پھر آپ Open WhatsApp دبا کر دکان کو بھیجتے ہیں۔ دکان کو وہی میسج تب نظر آتا ہے جب آپ یہ بٹن دبائیں۔ ہر آئٹم کے ساتھ TrendsMart لنک ہوتا ہے تاکہ دکان صحیح پروڈکٹ کھول سکے۔",
  },
  {
    q: "قریب کی دکان کیوں نہیں دکھ رہی جو مجھے معلوم ہے؟",
    a: "مرچنٹ اپنا ڈیلیوری/سروس ریڈیئس سیٹ کرتے ہیں۔ اگر آپ اس دائرے سے باہر ہیں، یا دکان کا لوکیشن پن ابھی نہیں لگا، تو قریبی نتائج میں نہیں آئے گی۔ فلٹر سے سرچ ریڈیئس بڑھا کر دیکھیں۔",
  },
  {
    q: "ڈیلیوری چارجز کیسے لگتے ہیں؟",
    a: "ہر مرچنٹ اپنا کم از کم آرڈر اور ڈیلیوری فیس سلیب خود سیٹ کرتا ہے — مثلاً ایک حد سے اوپر مفت ڈیلیوری، یا فاصلے کے ساتھ فیس بڑھنا۔ یہ سب چیک آؤٹ پر تصدیق سے پہلے واضح دکھائی دیتے ہیں۔",
  },
  {
    q: "کیا آرڈر منسوخ یا واپس کر سکتا ہوں؟",
    a: "جب تک اسٹیٹس Pending ہو، عام طور پر منسوخ ہو سکتا ہے۔ واپسی، خراب سامان یا تنازعے کے لیے Refund & Order Policy دیکھیں — زیادہ تر مسائل مرچنٹ سے WhatsApp پر ہی حل ہو جاتے ہیں۔",
  },
  {
    q: "اپنا آرڈر کیسے ٹریک کروں؟",
    a: "Orders → Track Order پر جائیں۔ اسٹیٹس Pending رہتا ہے جب تک دکان اپنے ڈیش بورڈ سے اپڈیٹ نہ کرے (Processing → Dispatched → Delivered)۔ یہ لائیو GPS ٹریکنگ نہیں، اور خودکار نوٹیفکیشن بھی نہیں بھیجتے۔",
  },
];

const MERCHANT_FAQS_EN: FaqItem[] = [
  {
    q: "How do I register my store?",
    a: "Sign up, verify your email, then open Dashboard and fill in your store (name, category, phone, logo, banner). There is no approval queue — once your email is verified and the shop details are complete, the store can go live.",
  },
  {
    q: "How fast can I list a product?",
    a: "Use the 4-field Quick Add form on your dashboard: Name, Category, Price, and Image. That's it — your product is live. You can always add a description, discount price, or mark it unavailable later.",
  },
  {
    q: "How do I pause a product without deleting it?",
    a: "Each product has an In Stock / Out of Stock (or Not available) toggle. TrendsMart does not track unit counts — merchants sell both in-store and online, so quantity would be wrong. Toggle off to pause selling without deleting the item.",
  },
  {
    q: "How do I control which customers can order from me?",
    a: "Set your shop's pinned location and delivery radius once from Dashboard → Settings → Delivery area. That pin stays fixed (orders leave from the dukaan). Only change it there if the shop moves. Customers still use their own live GPS for nearby distance.",
  },
  {
    q: "How do I show a discount badge on a product?",
    a: "When adding or editing a product, expand \"optional details\" and set an Original Price higher than your selling Price. TrendsMart automatically calculates and displays a \"% OFF\" badge.",
  },
  {
    q: "How do I get a QR code for my shop?",
    a: "Your unique shop QR code is auto-generated in Dashboard → Settings. Download it and print it for your counter or storefront — scanning it takes customers straight to your store page.",
  },
  {
    q: "How will I receive orders?",
    a: "Saved orders appear in your Dashboard. The customer still has to tap Open WhatsApp to send you the compiled message — WhatsApp does not send itself. Keep an eye on Dashboard and WhatsApp.",
  },
  {
    q: "How do I mark my shop Closed for today?",
    a: "Use the Open / Closed switch on Dashboard or Store settings. That switch is what customers see. Business hours text is only a label (for example Mon–Sat 9 AM–10 PM) and does not open or close the shop by itself.",
  },
];

const MERCHANT_FAQS_UR: FaqItem[] = [
  {
    q: "اپنا سٹور کیسے رجسٹر کروں؟",
    a: "سائن اپ کریں، ای میل تصدیق کریں، پھر Dashboard کھول کر سٹور کی تفصیل بھریں (نام، کیٹگری، فون، لوگو، بینر)۔ کوئی منظوری قطار نہیں — ای میل تصدیق اور مکمل تفصیلات کے بعد سٹور لائیو ہو سکتا ہے۔",
  },
  {
    q: "پروڈکٹ کتنی جلدی لگا سکتا ہوں؟",
    a: "ڈیش بورڈ پر Quick Add کے چار فیلڈز استعمال کریں: نام، کیٹگری، قیمت اور تصویر۔ بس — پروڈکٹ لائیو۔ بعد میں تفصیل، ڈسکاؤنٹ قیمت یا unavailable بھی لگا سکتے ہیں۔",
  },
  {
    q: "پروڈکٹ حذف کیے بغیر کیسے روکوں؟",
    a: "ہر پروڈکٹ پر In Stock / Out of Stock (یا Not available) ٹوگل ہے۔ TrendsMart یونٹ کاؤنٹ نہیں رکھتا — دکاندار دکان اور آن لائن دونوں بیچتے ہیں، اس لیے مقدار غلط ہو جاتی۔ بیچنا روکنے کے لیے ٹوگل آف کریں، آئٹم حذف نہ کریں۔",
  },
  {
    q: "کون سے گاہک مجھ سے آرڈر کر سکیں، یہ کیسے کنٹرول کروں؟",
    a: "Dashboard → Settings → Delivery area سے ایک بار دکان کا پن اور ڈیلیوری ریڈیئس سیٹ کریں۔ یہ پن فکس رہتا ہے (آرڈر دکان سے نکلتے ہیں)۔ صرف دکان منتقل ہو تو وہیں بدلیں۔ گاہک قریبی فاصلے کے لیے اپنا لائیو GPS استعمال کرتے رہتے ہیں۔",
  },
  {
    q: "پروڈکٹ پر ڈسکاؤنٹ بیج کیسے دکھائے؟",
    a: "پروڈکٹ شامل یا ایڈٹ کرتے وقت \"optional details\" کھولیں اور Original Price اپنی بیچنے والی Price سے زیادہ رکھیں۔ TrendsMart خود \"% OFF\" بیج حساب کر کے دکھاتا ہے۔",
  },
  {
    q: "اپنی دکان کا QR کوڈ کیسے حاصل کروں؟",
    a: "آپ کا منفرد شاپ QR کوڈ Dashboard → Settings میں خود بن جاتا ہے۔ ڈاؤن لوڈ کر کے کاؤنٹر یا سٹور فرنٹ پر پرنٹ کریں — اسکین کرنے پر گاہک سیدھا آپ کے سٹور صفحے پر پہنچ جاتا ہے۔",
  },
  {
    q: "آرڈر مجھے کیسے ملیں گے؟",
    a: "محفوظ آرڈرز آپ کے Dashboard میں نظر آتے ہیں۔ گاہک کو پھر بھی Open WhatsApp دبا کر مرتب میسج بھیجنا ہوتا ہے — WhatsApp خود سے نہیں بھیجتا۔ Dashboard اور WhatsApp دونوں دیکھتے رہیں۔",
  },
  {
    q: "آج کے لیے دکان Closed کیسے کروں؟",
    a: "Dashboard یا Store settings پر Open / Closed سوئچ استعمال کریں — گاہک یہی دیکھتے ہیں۔ کاروباری اوقات کا متن صرف لیبل ہے (جیسے پیر–ہفتہ صبح ۹ سے رات ۱۰)، خود دکان کھولتا یا بند نہیں کرتا۔",
  },
];

/** English customer FAQs (SEO / AI knowledge). */
export const CUSTOMER_FAQS: FaqItem[] = CUSTOMER_FAQS_EN;

/** English merchant FAQs (SEO / AI knowledge). */
export const MERCHANT_FAQS: FaqItem[] = MERCHANT_FAQS_EN;

export const ALL_FAQS: FaqItem[] = [...CUSTOMER_FAQS_EN, ...MERCHANT_FAQS_EN];

export function getCustomerFaqs(locale: LocaleCode): FaqItem[] {
  return locale === "ur" ? CUSTOMER_FAQS_UR : CUSTOMER_FAQS_EN;
}

export function getMerchantFaqs(locale: LocaleCode): FaqItem[] {
  return locale === "ur" ? MERCHANT_FAQS_UR : MERCHANT_FAQS_EN;
}
