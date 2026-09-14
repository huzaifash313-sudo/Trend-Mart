/**
 * Zero-dep multi-page PDF for TrendsMart expansion plan (WhatsApp / mobile).
 * Run: node docs/make-plan-pdf.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "TrendsMart-Industry-Expansion-Plan.pdf");

const lines = [
  "TRENDSMART ROADMAP",
  "Industry-Level Local Commerce OS",
  "",
  "Sirf delivery app nahi — qareebi business ka full OS:",
  "order, visit, sit, book, experience.",
  "Har category apni business logic ke mutabiq.",
  "Tagline: Har qareebi business — order, visit, sit, book.",
  "",
  "1. VISION",
  "Aaj: Hyper-local multi-vendor + WhatsApp orders.",
  "Kal: Local Commerce OS — delivery, pickup, sitting,",
  "store info, booking, experience — ek hi app.",
  "- Customer order (delivery / pickup)",
  "- Baith ke khaye (sitting / table QR)",
  "- Info / discovery (hours, menu, map)",
  "- Experience (cafe, salon, repair, watching)",
  "- Merchant = category-specific modules",
  "Principle: Platform = rails. Category = pack.",
  "",
  "2. SHOP CAPABILITY MODES",
  "Delivery — ghar pe | radius, fees, slabs",
  "Pickup — counter | ready-in-X, slots",
  "Sitting — table order | QR tables, kitchen",
  "Info — hours/menu/map | rich profile",
  "Book/Visit — appointment | slots, packages",
  "Experience — sit/watch/event | capacity, cover",
  "",
  "3. PHASE 0 — FOUNDATION (PEHLE)",
  "- Category themes align (old names -> new)",
  "- Modes = source of truth",
  "- Service shops auto shop_type=service",
  "- Sitting expand (Bakery / cafe)",
  "- One schedule engine (all channels)",
  "- Register: Products / Food / Services / Venue",
  "",
  "4. UNIVERSAL RAILS (HAR CATEGORY)",
  "1) Mode chips: Delivery/Pickup/Sitting/Book/Open",
  "2) Trust: verified, license, hygiene/warranty",
  "3) Digital passport: shop/table/deal QR",
  "4) Live hours + emergency close + busy/quiet",
  "5) Order: Pending>Confirmed>Preparing>Done",
  "6) SME / city analytics (later)",
  "7) Urdu-first + large fonts + low bandwidth",
  "8) TrendBot grounded on real catalog",
  "9) Safety: report shop, Rx, underage blocks",
  "10) PWA offline menu/hours",
  "",
  "5. CATEGORY BUSINESS PACKS",
  "",
  "A. Daily essentials",
  "(Grocery, Fruits, Bakery, Pharmacy)",
  "- Units kg/dozen, substitutes, Rx upload",
  "- Freshness, morning-bake slots",
  "- Wow: rashta list, cold-chain, expiry alerts",
  "",
  "B. Food & hospitality",
  "(Fast Food & Restaurants, later Cafe)",
  "- Sitting + kitchen KDS + table QR + combos",
  "- Wow: wait time, hygiene score, festival thali",
  "",
  "C. Fashion & lifestyle",
  "(Fashion, Beauty, Handmade, Toys, Sports)",
  "- Size/color, exchange, lookbook, salon book",
  "- Wow: same-day mall pickup, tailor card",
  "",
  "D. Hard goods",
  "(Electronics, Home, Books, Automotive)",
  "- Warranty, IMEI, install add-on, specs",
  "- Wow: genuine parts, nearby repair link",
  "",
  "E. Field services",
  "(Maintenance, CCTV, Tech IT, Personal)",
  "- Job tickets, photos, call-out, service radius",
  "- Wow: tech ETA, survey checklist, salon queue",
  "",
  "F. Later verticals",
  "Cafe, Banquet, Coaching, Gym,",
  "Entertainment/Watching, Agri/Dairy",
  "Watching = Experience mode (screening cafe),",
  "NOT the CCTV security category.",
  "",
  "6. AWARD / GOVT DIFFERENTIATORS",
  "1) SME Digitalization Index",
  "2) Structured WhatsApp commerce (PK-fit)",
  "3) Hyperlocal GPS + radius + channel hours",
  "4) Multi-modal one shop",
  "5) Category OS packs (plumber != pharmacy)",
  "6) Citizen safety + verified shops",
  "7) Youth employment layer (later)",
  "8) Open-hours city map",
  "9) Urdu AI shop assistant (grounded)",
  "10) PWA without Play Store",
  "",
  "7. ROADMAP PHASES",
  "Phase 0 Foundation — pehle",
  "Phase 1 Soft-launch — 4-6 weeks",
  "  chips, order status, sitting, trust",
  "Phase 2 Packs v1 — 6-14 weeks",
  "  grocery, Rx, variants, tickets, booking",
  "Phase 3 Experience — 3-5 months",
  "  venue/watching, kitchen scale, busy",
  "Phase 4 Institutional — 6-12 months",
  "  payments optional, analytics, licenses",
  "",
  "8. MONETIZATION",
  "- Merchant subscription",
  "- Sponsored ads / spotlight",
  "- Pack upgrades (Kitchen Pro, Booking Pro)",
  "- Verified badge (optional)",
  "- Do NOT force payment escrow yet",
  "",
  "9. SUCCESS METRICS",
  "- % shops with 2+ modes",
  "- Pickup + sitting share vs delivery-only",
  "- Time-to-first-product (new merchant)",
  "- Order completion (WA confirm -> done)",
  "- Active SMEs / city; trust score",
  "",
  "10. NON-GOALS (ABHI)",
  "- Full escrow marketplace payments",
  "- Nation-wide logistics fleet",
  "- Social / reels clone",
  "- Open-domain entertainment AI",
  "",
  "RULE: Pehle Local Commerce OS jeeto,",
  "phir naye verticals add karo.",
  "",
  "TrendsMart — Industry Expansion Plan",
  "Soft-launch -> Industry OS | WhatsApp OK",
];

function escapePdf(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const PAGE_LINES = 42;
const pages = [];
for (let i = 0; i < lines.length; i += PAGE_LINES) {
  pages.push(lines.slice(i, i + PAGE_LINES));
}

const finalObjs = [];
const id = (body) => {
  finalObjs.push(body);
  return finalObjs.length;
};

id("CATALOG_PLACEHOLDER");
const fontObj = id("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

const pageContentIds = [];
pages.forEach((pageLines, pageIndex) => {
  const parts = ["BT", "/F1 10 Tf", "48 802 Td", "13 TL"];
  let first = true;
  pageLines.forEach((line, i) => {
    if (!first) parts.push("T*");
    first = false;
    const isLabel = pageIndex === 0 && i === 0;
    const isTitle = pageIndex === 0 && i === 1;
    const isHead = /^[0-9]+\. /.test(line) || /^(A|B|C|D|E|F)\. /.test(line);
    const t = escapePdf(line);
    if (isLabel) parts.push("/F1 9 Tf", `(${t}) Tj`, "/F1 10 Tf");
    else if (isTitle) parts.push("/F1 14 Tf", `(${t}) Tj`, "/F1 10 Tf");
    else if (isHead) parts.push("/F1 11 Tf", `(${t}) Tj`, "/F1 10 Tf");
    else parts.push(`(${t}) Tj`);
  });
  parts.push("ET");
  const stream = parts.join("\n");
  pageContentIds.push(
    id(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`),
  );
});

const pagesParentGuess = finalObjs.length + pages.length + 1;
const pageIdsFinal = pageContentIds.map((cid) =>
  id(
    `<< /Type /Page /Parent ${pagesParentGuess} 0 R /MediaBox [0 0 595 842] /Contents ${cid} 0 R /Resources << /Font << /F1 ${fontObj} 0 R >> >> >>`,
  ),
);

const kids = pageIdsFinal.map((n) => `${n} 0 R`).join(" ");
const pagesObj = id(`<< /Type /Pages /Kids [${kids}] /Count ${pageIdsFinal.length} >>`);

if (pagesObj !== pagesParentGuess) {
  for (const pageId of pageIdsFinal) {
    finalObjs[pageId - 1] = finalObjs[pageId - 1].replace(
      `/Parent ${pagesParentGuess} 0 R`,
      `/Parent ${pagesObj} 0 R`,
    );
  }
}

finalObjs[0] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;

let pdf = "%PDF-1.4\n";
const offsets = [0];
for (let i = 0; i < finalObjs.length; i++) {
  offsets.push(Buffer.byteLength(pdf, "utf8"));
  pdf += `${i + 1} 0 obj\n${finalObjs[i]}\nendobj\n`;
}
const xrefPos = Buffer.byteLength(pdf, "utf8");
pdf += `xref\n0 ${finalObjs.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (let i = 1; i <= finalObjs.length; i++) {
  pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${finalObjs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

fs.writeFileSync(outPath, pdf);
console.log("Wrote", outPath, Buffer.byteLength(pdf), "bytes,", pages.length, "pages");
