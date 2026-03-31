import { describe, expect, it } from "vitest";
import {
  pickBestFavicon,
  sanitizeBrowserUrl,
  sanitizeFaviconUrl,
} from "../../src/main/panel-manager";

describe("pickBestFavicon", () => {
  it("returns null for empty array", () => {
    expect(pickBestFavicon([])).toBeNull();
  });

  it("prefers SVG over other formats", () => {
    expect(
      pickBestFavicon([
        "https://example.com/favicon.png",
        "https://example.com/favicon.svg",
        "https://example.com/favicon.ico",
      ]),
    ).toBe("https://example.com/favicon.svg");
  });

  it("prefers SVG with query string", () => {
    expect(
      pickBestFavicon(["https://example.com/favicon.png", "https://example.com/favicon.svg?v=2"]),
    ).toBe("https://example.com/favicon.svg?v=2");
  });

  it("prefers SVG over 16x16", () => {
    expect(
      pickBestFavicon(["https://example.com/favicon-16x16.png", "https://example.com/favicon.svg"]),
    ).toBe("https://example.com/favicon.svg");
  });

  it("prefers 16x16 when no SVG available", () => {
    expect(
      pickBestFavicon([
        "https://example.com/favicon-32x32.png",
        "https://example.com/favicon-16x16.png",
      ]),
    ).toBe("https://example.com/favicon-16x16.png");
  });

  it("prefers 32x32 over unknown size", () => {
    expect(
      pickBestFavicon(["https://example.com/favicon.png", "https://example.com/favicon-32x32.png"]),
    ).toBe("https://example.com/favicon-32x32.png");
  });

  it("falls back to first URL when no hints match", () => {
    expect(
      pickBestFavicon(["https://example.com/favicon.ico", "https://example.com/favicon.png"]),
    ).toBe("https://example.com/favicon.ico");
  });

  it("returns the only URL when array has one element", () => {
    expect(pickBestFavicon(["https://example.com/favicon.ico"])).toBe(
      "https://example.com/favicon.ico",
    );
  });
});

describe("sanitizeFaviconUrl", () => {
  it("allows https URLs", () => {
    expect(sanitizeFaviconUrl("https://example.com/favicon.png")).toBe(
      "https://example.com/favicon.png",
    );
  });

  it("allows http URLs", () => {
    expect(sanitizeFaviconUrl("http://localhost/favicon.ico")).toBe("http://localhost/favicon.ico");
  });

  it("rejects data: URIs", () => {
    expect(sanitizeFaviconUrl("data:image/png;base64,abc123")).toBeNull();
  });

  it("rejects javascript: URLs", () => {
    expect(sanitizeFaviconUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects blob: URLs", () => {
    expect(sanitizeFaviconUrl("blob:https://example.com/abc")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(sanitizeFaviconUrl(null)).toBeNull();
  });
});

describe("sanitizeBrowserUrl", () => {
  it("allows https URLs", () => {
    expect(sanitizeBrowserUrl("https://example.com/docs")).toBe("https://example.com/docs");
  });

  it("allows http URLs", () => {
    expect(sanitizeBrowserUrl("http://localhost:3000/")).toBe("http://localhost:3000/");
  });

  it("allows about:blank", () => {
    expect(sanitizeBrowserUrl("about:blank")).toBe("about:blank");
  });

  it("rejects other about URLs", () => {
    expect(sanitizeBrowserUrl("about:srcdoc")).toBeNull();
  });

  it("rejects file URLs", () => {
    expect(sanitizeBrowserUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects javascript URLs", () => {
    expect(sanitizeBrowserUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects data URLs", () => {
    expect(sanitizeBrowserUrl("data:text/html,<h1>hi</h1>")).toBeNull();
  });

  it("rejects invalid URLs", () => {
    expect(sanitizeBrowserUrl("not a url")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(sanitizeBrowserUrl(null)).toBeNull();
  });
});
