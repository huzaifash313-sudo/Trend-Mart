/* -------------------------------------------------------------------------- */
/*  TrendsMart — Jest Setup (Prompt 3)                                          */
/*  Global test environment configuration for React Testing Library            */
/* -------------------------------------------------------------------------- */

import "@testing-library/jest-dom";

// ─── Mock next/navigation ──────────────────────────────────────────────────────

jest.mock("next/navigation", () => ({
  useRouter: (): Record<string, jest.Mock | string | Record<string, never>> => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
    refresh: jest.fn(),
    pathname: "/",
    query: {},
  }),
  usePathname: (): string => "/",
  useSearchParams: (): URLSearchParams => new URLSearchParams(),
  useParams: (): Record<string, never> => ({}),
}));

// ─── Mock next/image ───────────────────────────────────────────────────────────

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>): string => `[Image: ${props.alt || ""}]`,
}));

// ─── Mock next/link ────────────────────────────────────────────────────────────

jest.mock("next/link", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>): string => `[Link: ${props.href}]`,
}));

// ─── Mock @supabase/supabase-js ────────────────────────────────────────────────

const mockSupabaseFrom = jest.fn().mockReturnValue({
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  gt: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lt: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  like: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  contains: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis(),
  head: jest.fn().mockReturnThis(),
  filter: jest.fn().mockReturnThis(),
  match: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  onConflict: jest.fn().mockReturnThis(),
  ignoreDuplicates: jest.fn().mockReturnThis(),
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      verifyOtp: jest.fn(),
      resend: jest.fn(),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: mockSupabaseFrom,
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    }),
    removeChannel: jest.fn(),
  })),
}));

// ─── Mock lib/supabase/client ──────────────────────────────────────────────────

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
    from: mockSupabaseFrom,
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    }),
  })),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    from: mockSupabaseFrom,
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  })),
}));

// ─── Mock framer-motion ────────────────────────────────────────────────────────

jest.mock("framer-motion", () => ({
  motion: {
    div: "div",
    span: "span",
    button: "button",
    section: "section",
    nav: "nav",
    ul: "ul",
    li: "li",
    img: "img",
    p: "p",
    h1: "h1",
    h2: "h2",
    h3: "h3",
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  useAnimation: () => ({
    start: jest.fn(),
    stop: jest.fn(),
  }),
  useInView: () => true,
  useScroll: () => ({ scrollY: 0, scrollYProgress: { current: 0 } }),
  useTransform: () => 0,
}));

// ─── Mock recharts ─────────────────────────────────────────────────────────────

jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
  BarChart: ({ children }: { children: React.ReactNode }) => children,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => children,
  Line: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => children,
  Pie: () => null,
  Cell: () => null,
  Legend: () => null,
}));

// ─── Mock IntersectionObserver ─────────────────────────────────────────────────

class MockIntersectionObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  root: Element | null = null;
  rootMargin = "0px";
  thresholds: ReadonlyArray<number> = [0];
  takeRecords = jest.fn(() => []);
}

Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: MockIntersectionObserver,
});

// ─── Mock matchMedia ───────────────────────────────────────────────────────────

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// ─── Mock localStorage ─────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

// ─── Mock crypto.randomUUID ────────────────────────────────────────────────────

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      randomUUID: () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }),
    },
    writable: true,
  });
}

// ─── Silence console in tests (optional: remove for debugging) ─────────────────

const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      (args[0].includes("inside a test was not wrapped in act") ||
        args[0].includes("Error: Uncaught"))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// ─── Clean up mocks between tests ──────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

// ─── Mock global fetch ─────────────────────────────────────────────────────────

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
    blob: () => Promise.resolve(new Blob()),
    headers: new Headers(),
  } as Response),
);

// ─── Re-export for convenience ─────────────────────────────────────────────────

export { mockSupabaseFrom };