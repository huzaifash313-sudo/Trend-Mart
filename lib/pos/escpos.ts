/**
 * Minimal ESC/POS encoder for 58mm / 80mm shop thermal printers.
 * Outputs raw bytes suitable for Web Bluetooth / Web Serial write.
 */

const ESC = 0x1b;
const GS = 0x1d;

function encodeText(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // Basic Latin + common punctuation; replace other chars with ?
    if (c === 0x0a) {
      out.push(0x0a);
    } else if (c >= 0x20 && c <= 0x7e) {
      out.push(c);
    } else if (c === 0x20ac) {
      // euro — skip
      out.push(0x3f);
    } else {
      // Rough CP437-ish fallback for digits already ASCII; keep ?
      out.push(c < 256 ? c : 0x3f);
    }
  }
  return out;
}

function line(text: string, width = 32): string {
  const t = text.replace(/\r/g, "");
  if (t.length <= width) return t;
  return t.slice(0, width);
}

function padRow(left: string, right: string, width = 32): string {
  const gap = Math.max(1, width - left.length - right.length);
  return `${left}${" ".repeat(gap)}${right}`.slice(0, width);
}

export interface EscPosReceiptInput {
  shopName: string;
  address?: string;
  phone?: string;
  invoiceNo: string;
  dateLabel: string;
  typeLabel: string;
  cashier?: string;
  customerName?: string;
  customerPhone?: string;
  items: Array<{ name: string; qty: number; rate: number; amount: number; variant?: string }>;
  itemCount: number;
  subtotal: number;
  discount?: number;
  deliveryFee?: number;
  total: number;
  paymentLabel: string;
  footerNote?: string;
  /** 32 ≈ 58mm, 42 ≈ 80mm */
  cols?: 32 | 42;
}

/** Build ESC/POS bytes for a counter receipt. */
export function buildEscPosReceipt(input: EscPosReceiptInput): Uint8Array {
  const cols = input.cols ?? 32;
  const bytes: number[] = [];

  const push = (...n: number[]) => bytes.push(...n);
  const text = (s: string) => push(...encodeText(s));
  const nl = () => push(0x0a);

  // Init
  push(ESC, 0x40);
  // Align center
  push(ESC, 0x61, 0x01);
  // Emphasized / double height for shop name
  push(ESC, 0x21, 0x30);
  text(line(input.shopName.toUpperCase(), cols));
  nl();
  push(ESC, 0x21, 0x00);
  if (input.address) {
    text(line(input.address, cols));
    nl();
  }
  if (input.phone) {
    text(line(`Tel: ${input.phone}`, cols));
    nl();
  }
  text(line("SALE INVOICE", cols));
  nl();
  text("=".repeat(cols));
  nl();

  // Left align
  push(ESC, 0x61, 0x00);
  text(padRow("Invoice #", input.invoiceNo, cols));
  nl();
  text(padRow("Date", input.dateLabel, cols));
  nl();
  text(padRow("Type", input.typeLabel, cols));
  nl();
  if (input.cashier) {
    text(padRow("Cashier", input.cashier, cols));
    nl();
  }
  text(padRow("Customer", input.customerName || "Walk-in", cols));
  nl();
  if (input.customerPhone) {
    text(padRow("Phone", input.customerPhone, cols));
    nl();
  }
  text("-".repeat(cols));
  nl();

  for (const it of input.items) {
    text(line(it.name, cols));
    nl();
    if (it.variant) {
      text(line(`  ${it.variant}`, cols));
      nl();
    }
    text(
      padRow(
        `  ${it.qty} x ${Math.round(it.rate)}`,
        String(Math.round(it.amount)),
        cols,
      ),
    );
    nl();
  }

  text("-".repeat(cols));
  nl();
  text(padRow("Items", String(input.itemCount), cols));
  nl();
  text(padRow("Subtotal", `Rs ${Math.round(input.subtotal)}`, cols));
  nl();
  if (input.discount && input.discount > 0) {
    text(padRow("Discount", `-Rs ${Math.round(input.discount)}`, cols));
    nl();
  }
  if (input.deliveryFee && input.deliveryFee > 0) {
    text(padRow("Delivery", `Rs ${Math.round(input.deliveryFee)}`, cols));
    nl();
  }
  push(ESC, 0x21, 0x10);
  text(padRow("TOTAL", `Rs ${Math.round(input.total)}`, cols));
  nl();
  push(ESC, 0x21, 0x00);
  text(padRow("Payment", input.paymentLabel, cols));
  nl();
  text("=".repeat(cols));
  nl();

  push(ESC, 0x61, 0x01);
  text(line(input.footerNote || "Thank you!", cols));
  nl();
  text(line("Powered by TrendsMart", cols));
  nl();
  nl();
  nl();
  // Partial cut if supported
  push(GS, 0x56, 0x00);

  return new Uint8Array(bytes);
}
