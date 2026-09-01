export interface FaqItem {
  q: string;
  a: string;
}

export const CUSTOMER_FAQS: FaqItem[] = [
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

export const MERCHANT_FAQS: FaqItem[] = [
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

export const ALL_FAQS: FaqItem[] = [...CUSTOMER_FAQS, ...MERCHANT_FAQS];
