import { describe, expect, it } from "vitest";
import { pickBestFavicon } from "../../src/main/panel-manager";

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
