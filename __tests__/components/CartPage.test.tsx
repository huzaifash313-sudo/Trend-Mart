/* -------------------------------------------------------------------------- */
/*  /cart page — renders the localStorage cart, grouped per shop, editable      */
/* -------------------------------------------------------------------------- */

import { render, screen, fireEvent, within } from "@testing-library/react";
import CartPage from "@/app/cart/page";
import { useCartStore, type CartItem } from "@/store/cartStore";

// ── Mocks: keep the page self-contained (no router / heavy checkout modal) ──
jest.mock("next/navigation", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("@/components/ConfirmProvider", () => ({
  useConfirm: () => ({ confirm: jest.fn().mockResolvedValue(true) }),
}));
jest.mock("@/services/shopService", () => ({
  fetchShopById: jest.fn().mockResolvedValue({ success: false }),
}));
jest.mock("@/components/WhatsAppCheckoutModal", () => ({
  __esModule: true,
  default: () => null,
}));
// next/link needs the App Router context to render its children in jsdom —
// stub it with a plain anchor so link text/roles are queryable.
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

function makeItem(over: Partial<CartItem>): CartItem {
  return {
    id: over.id ?? "p1",
    productId: over.productId ?? "p1",
    shopId: over.shopId ?? "shop-1",
    shopName: over.shopName ?? "Fresh Bites",
    shopWhatsapp: over.shopWhatsapp ?? "923001234567",
    name: over.name ?? "Chicken Burger",
    price: over.price ?? 500,
    quantity: over.quantity ?? 1,
    originalPrice: over.originalPrice ?? null,
    imageUrl: over.imageUrl ?? null,
    variant: over.variant,
    notes: over.notes,
    currency: over.currency,
    shortCode: over.shortCode ?? null,
  };
}

function seedCart(items: CartItem[]) {
  useCartStore.setState({ items });
}

describe("CartPage", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
  });

  it("shows an empty state with a shopping CTA when the cart is empty", () => {
    render(<CartPage />);
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start shopping/i })).toBeInTheDocument();
  });

  it("renders items, quantity and totals for a single shop", () => {
    seedCart([
      makeItem({ id: "a", name: "Burger", price: 500, quantity: 2 }),
      makeItem({ id: "b", name: "Fries", price: 200, quantity: 1 }),
    ]);
    render(<CartPage />);

    expect(screen.getByText("Burger")).toBeInTheDocument();
    expect(screen.getByText("Fries")).toBeInTheDocument();
    // Header count + grand total (2*500 + 1*200 = 1200).
    expect(screen.getByRole("heading", { name: /your cart \(3\)/i })).toBeInTheDocument();
    expect(screen.getByText(/total \(3 items\)/i)).toBeInTheDocument();
  });

  it("groups items from different shops into separate sections", () => {
    seedCart([
      makeItem({ id: "a", shopId: "shop-1", shopName: "Fresh Bites", name: "Burger" }),
      makeItem({ id: "b", shopId: "shop-2", shopName: "Sweet Treats", name: "Cake" }),
    ]);
    render(<CartPage />);
    expect(screen.getByText("Fresh Bites")).toBeInTheDocument();
    expect(screen.getByText("Sweet Treats")).toBeInTheDocument();
    expect(screen.getByText(/2 shops/i)).toBeInTheDocument();
  });

  it("increments quantity via the + button", () => {
    seedCart([makeItem({ id: "a", name: "Burger", price: 500, quantity: 1 })]);
    render(<CartPage />);

    fireEvent.click(screen.getByRole("button", { name: /increase burger/i }));
    // Store now has quantity 2 → header reflects total item count.
    expect(useCartStore.getState().items[0]!.quantity).toBe(2);
    expect(screen.getByRole("heading", { name: /your cart \(2\)/i })).toBeInTheDocument();
  });

  it("removes an item when its quantity is 1 and the trash button is pressed", () => {
    seedCart([makeItem({ id: "a", name: "Burger", quantity: 1 })]);
    render(<CartPage />);

    fireEvent.click(screen.getByRole("button", { name: /remove burger/i }));
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
  });

  it("edits a per-item note", () => {
    seedCart([makeItem({ id: "a", name: "Burger" })]);
    render(<CartPage />);

    const note = screen.getByLabelText(/note for burger/i);
    fireEvent.change(note, { target: { value: "extra spicy" } });
    expect(useCartStore.getState().items[0]!.notes).toBe("extra spicy");
  });

  it("exposes a per-shop 'Order via WhatsApp' checkout button", () => {
    seedCart([makeItem({ id: "a", shopName: "Fresh Bites" })]);
    render(<CartPage />);
    const section = screen.getByText("Fresh Bites").closest("section")!;
    expect(
      within(section).getByRole("button", { name: /order via whatsapp/i }),
    ).toBeInTheDocument();
  });
});
