/* -------------------------------------------------------------------------- */
/*  TrendsMart — Type Guards & Schema Validation Tests (Prompt 3)               */
/*  Tests Zod schemas, runtime type guards, and input validation              */
/* -------------------------------------------------------------------------- */

import {
  productSchema,
  cartItemSchema,
  validateProduct,
  validateShop,
  validateOrder,
  validateCartItem,
  validateArray,
  validateMerchantSettings,
  isProduct,
  isNotNullish,
  isSafeInteger,
  isNonEmptyString,
  isRecord,
} from "@/lib/typeGuards";

// ─── Primitives ────────────────────────────────────────────────────────────────

describe("Type Guards - Primitives", () => {
  describe("isNotNullish", () => {
    it("returns false for null", () => {
      expect(isNotNullish(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isNotNullish(undefined)).toBe(false);
    });

    it("returns true for a value", () => {
      expect(isNotNullish("hello")).toBe(true);
    });

    it("returns true for 0", () => {
      expect(isNotNullish(0)).toBe(true);
    });

    it("returns true for false", () => {
      expect(isNotNullish(false)).toBe(true);
    });

    it("filters an array correctly", () => {
      const arr = [1, null, 2, undefined, 3];
      const filtered = arr.filter(isNotNullish);
      expect(filtered).toEqual([1, 2, 3]);
    });
  });

  describe("isSafeInteger", () => {
    it("returns true for a safe integer", () => {
      expect(isSafeInteger(42)).toBe(true);
    });

    it("returns false for a float", () => {
      expect(isSafeInteger(3.14)).toBe(false);
    });

    it("returns false for a string", () => {
      expect(isSafeInteger("42")).toBe(false);
    });

    it("returns false for Infinity", () => {
      expect(isSafeInteger(Infinity)).toBe(false);
    });

    it("returns false for NaN", () => {
      expect(isSafeInteger(NaN)).toBe(false);
    });
  });

  describe("isNonEmptyString", () => {
    it("returns true for a non-empty string", () => {
      expect(isNonEmptyString("hello")).toBe(true);
    });

    it("returns false for an empty string", () => {
      expect(isNonEmptyString("")).toBe(false);
    });

    it("returns false for whitespace-only string", () => {
      expect(isNonEmptyString("   ")).toBe(false);
    });

    it("returns false for a number", () => {
      expect(isNonEmptyString(123)).toBe(false);
    });
  });

  describe("isRecord", () => {
    it("returns true for a plain object", () => {
      expect(isRecord({ a: 1 })).toBe(true);
    });

    it("returns false for an array", () => {
      expect(isRecord([1, 2, 3])).toBe(false);
    });

    it("returns false for null", () => {
      expect(isRecord(null)).toBe(false);
    });

    it("returns false for a string", () => {
      expect(isRecord("hello")).toBe(false);
    });
  });
});

// ─── Product Schema ────────────────────────────────────────────────────────────

describe("Product Schema Validation", () => {
  const validProduct = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    shop_id: "123e4567-e89b-12d3-a456-426614174001",
    name: "Test Product",
    description: "A great product",
    price: 99.99,
    currency: "PKR",
    is_available: true,
  };

  it("validates a correct product", () => {
    const result = validateProduct(validProduct);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Test Product");
      expect(result.data.price).toBe(99.99);
    }
  });

  it("rejects a product with missing name", () => {
    const result = validateProduct({ ...validProduct, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("name");
    }
  });

  it("rejects a product with negative price", () => {
    const result = validateProduct({ ...validProduct, price: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("non-negative");
    }
  });

  it("rejects a product with invalid UUID", () => {
    const result = validateProduct({ ...validProduct, id: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("UUID");
    }
  });

  it("rejects HTML in product name", () => {
    const result = validateProduct({ ...validProduct, name: "<script>alert('xss')</script>" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("HTML");
    }
  });

  it("coerces null optional fields to undefined", () => {
    const result = validateProduct({ ...validProduct, original_price: null, sub_category_id: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.original_price).toBeUndefined();
      expect(result.data.sub_category_id).toBeUndefined();
    }
  });

  it("validates a product with variants", () => {
    const result = validateProduct({
      ...validProduct,
      variants: [
        {
          name: "Size",
          options: [
            { label: "S", price_adj: 0 },
            { label: "M", price_adj: 50 },
            { label: "L", price_adj: 100, stock: 5 },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.variants) {
      expect(result.data.variants).toHaveLength(1);
      expect(result.data.variants[0].options).toHaveLength(3);
    }
  });

  it("rejects more than 5 variant groups", () => {
    const result = validateProduct({
      ...validProduct,
      variants: Array.from({ length: 6 }, (_, i) => ({
        name: `Variant ${i}`,
        options: [{ label: "X" }],
      })),
    });
    expect(result.success).toBe(false);
  });

  describe("isProduct type guard", () => {
    it("returns true for a valid product shape", () => {
      expect(isProduct(validProduct)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isProduct(null)).toBe(false);
    });

    it("returns false for an incomplete object", () => {
      expect(isProduct({ id: "x", name: "y" })).toBe(false);
    });
  });
});

// ─── Shop Schema ───────────────────────────────────────────────────────────────

describe("Shop Schema Validation", () => {
  const validShop = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    name: "Test Shop",
    category: "Fashion & Apparel",
    is_live: true,
  };

  it("validates a correct shop", () => {
    const result = validateShop(validShop);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Test Shop");
    }
  });

  it("rejects a shop with name too short", () => {
    const result = validateShop({ ...validShop, name: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects a shop with invalid hex color", () => {
    const result = validateShop({ ...validShop, accent_color: "not-a-color" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid hex color", () => {
    const result = validateShop({ ...validShop, accent_color: "#10b981" });
    expect(result.success).toBe(true);
  });

  it("defaults shop_type to retail", () => {
    const result = validateShop(validShop);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shop_type).toBe("retail");
    }
  });

  it("accepts service shop_type", () => {
    const result = validateShop({ ...validShop, shop_type: "service" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.shop_type).toBe("service");
    }
  });
});

// ─── Order Schema ──────────────────────────────────────────────────────────────

describe("Order Schema Validation", () => {
  const validOrder = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    shop_id: "123e4567-e89b-12d3-a456-426614174001",
    customer_name: "John Doe",
    customer_phone: "923001234567",
    items_json: [
      {
        product_id: "123e4567-e89b-12d3-a456-426614174002",
        name: "Item 1",
        price: 100,
        quantity: 2,
      },
    ],
    total_amount: 200,
    status: "Pending" as const,
    created_at: "2025-01-01T00:00:00.000Z",
  };

  it("validates a correct order", () => {
    const result = validateOrder(validOrder);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items_json).toHaveLength(1);
      expect(result.data.total_amount).toBe(200);
    }
  });

  it("rejects an order with no items", () => {
    const result = validateOrder({ ...validOrder, items_json: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an order with more than 50 items", () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      product_id: `123e4567-e89b-12d3-a456-426614174${String(i).padStart(3, "0")}`,
      name: `Item ${i}`,
      price: 10,
      quantity: 1,
    }));
    const result = validateOrder({ ...validOrder, items_json: items });
    expect(result.success).toBe(false);
  });

  it("rejects invalid order status", () => {
    const result = validateOrder({ ...validOrder, status: "InvalidStatus" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid order statuses", () => {
    const statuses = ["Pending", "Processing", "Dispatched", "Delivered", "Cancelled"];
    for (const status of statuses) {
      const result = validateOrder({ ...validOrder, status: status as typeof validOrder.status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an order with invalid phone number", () => {
    const result = validateOrder({ ...validOrder, customer_phone: "123" });
    expect(result.success).toBe(false);
  });
});

// ─── Cart Item Schema ──────────────────────────────────────────────────────────

describe("Cart Item Schema Validation", () => {
  const validCartItem = {
    id: "product-123",
    productId: "123e4567-e89b-12d3-a456-426614174000",
    shopId: "123e4567-e89b-12d3-a456-426614174001",
    shopName: "Test Shop",
    shopWhatsapp: "923001234567",
    name: "Test Product",
    price: 99.99,
    quantity: 1,
  };

  it("validates a correct cart item", () => {
    const result = validateCartItem(validCartItem);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Test Product");
    }
  });

  it("rejects quantity of 0", () => {
    const result = validateCartItem({ ...validCartItem, quantity: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects quantity over 99", () => {
    const result = validateCartItem({ ...validCartItem, quantity: 100 });
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = validateCartItem({ ...validCartItem, price: -10 });
    expect(result.success).toBe(false);
  });

  it("accepts a cart item with variant", () => {
    const result = validateCartItem({ ...validCartItem, variant: "Size: M" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variant).toBe("Size: M");
    }
  });
});

// ─── Bulk Validation Helper ────────────────────────────────────────────────────

describe("validateArray (Bulk Validation)", () => {
  it("separates valid and invalid items", () => {
    const schema = productSchema;
    const input = [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        shop_id: "123e4567-e89b-12d3-a456-426614174001",
        name: "Valid Product",
        description: "ok",
        price: 100,
        is_available: true,
      },
      {
        // Invalid: missing name
        id: "123e4567-e89b-12d3-a456-426614174002",
        shop_id: "123e4567-e89b-12d3-a456-426614174001",
        name: "",
        price: 100,
        is_available: true,
      },
    ];

    const { valid, errors } = validateArray(schema, input);
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].index).toBe(1);
    expect(errors[0].message).toContain("name");
  });

  it("returns all valid for clean data", () => {
    const schema = cartItemSchema;
    const input = [
      {
        id: "item-1",
        productId: "123e4567-e89b-12d3-a456-426614174000",
        shopId: "123e4567-e89b-12d3-a456-426614174001",
        shopName: "Shop",
        shopWhatsapp: "923001234567",
        name: "Product 1",
        price: 50,
        quantity: 1,
      },
      {
        id: "item-2",
        productId: "123e4567-e89b-12d3-a456-426614174002",
        shopId: "123e4567-e89b-12d3-a456-426614174001",
        shopName: "Shop",
        shopWhatsapp: "923001234567",
        name: "Product 2",
        price: 75,
        quantity: 3,
      },
    ];

    const { valid, errors } = validateArray(schema, input);
    expect(valid).toHaveLength(2);
    expect(errors).toHaveLength(0);
  });
});

// ─── Merchant Settings Schema ──────────────────────────────────────────────────

describe("Merchant Settings Validation", () => {
  const validSettings = {
    shop_id: "123e4567-e89b-12d3-a456-426614174000",
    name: "My Store",
    category: "Fashion & Apparel",
    is_live: true,
    emergency_available: false,
    shop_type: "retail",
  };

  it("validates correct merchant settings", () => {
    const result = validateMerchantSettings(validSettings);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My Store");
    }
  });

  it("rejects missing required fields", () => {
    const result = validateMerchantSettings({ shop_id: "123e4567-e89b-12d3-a456-426614174000" });
    expect(result.success).toBe(false);
  });

  it("provides defaults for optional fields", () => {
    const result = validateMerchantSettings(validSettings);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.announcement).toBe("");
      expect(result.data.secondary_phone).toBe("");
    }
  });
});