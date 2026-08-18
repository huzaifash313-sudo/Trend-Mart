/* -------------------------------------------------------------------------- */
/*  RouteErrorBoundary — auto-recovers on client navigation                     */
/* -------------------------------------------------------------------------- */

import { render } from "@testing-library/react";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

import { usePathname } from "next/navigation";

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("boom");
  return <div data-testid="content">Route content</div>;
}

describe("RouteErrorBoundary", () => {
  let consoleErr: jest.SpyInstance;

  beforeEach(() => {
    // React logs caught boundary errors to console.error — silence the noise.
    consoleErr = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErr.mockRestore();
    jest.clearAllMocks();
  });

  it("shows the error fallback when the current route throws", () => {
    (usePathname as jest.Mock).mockReturnValue("/a");
    const { queryByTestId } = render(
      <RouteErrorBoundary name="Main">
        <Boom shouldThrow />
      </RouteErrorBoundary>,
    );
    expect(queryByTestId("content")).toBeNull();
  });

  it("recovers automatically when navigating to a different route", () => {
    (usePathname as jest.Mock).mockReturnValue("/a");
    const { rerender, queryByTestId, getByTestId } = render(
      <RouteErrorBoundary name="Main">
        <Boom shouldThrow />
      </RouteErrorBoundary>,
    );
    // Broken route → fallback, content not rendered.
    expect(queryByTestId("content")).toBeNull();

    // Client navigation to a healthy route changes the pathname key → the
    // boundary remounts fresh and the new route renders (no manual refresh).
    (usePathname as jest.Mock).mockReturnValue("/b");
    rerender(
      <RouteErrorBoundary name="Main">
        <Boom shouldThrow={false} />
      </RouteErrorBoundary>,
    );
    expect(getByTestId("content")).toBeInTheDocument();
  });

  it("stays broken WITHOUT the pathname changing (proves the key drives recovery)", () => {
    (usePathname as jest.Mock).mockReturnValue("/a");
    const { rerender, queryByTestId } = render(
      <RouteErrorBoundary name="Main">
        <Boom shouldThrow />
      </RouteErrorBoundary>,
    );
    expect(queryByTestId("content")).toBeNull();

    // Same route, child stops throwing — a class boundary does NOT self-heal,
    // so without a key change the content is still hidden (the old bug).
    rerender(
      <RouteErrorBoundary name="Main">
        <Boom shouldThrow={false} />
      </RouteErrorBoundary>,
    );
    expect(queryByTestId("content")).toBeNull();
  });
});
