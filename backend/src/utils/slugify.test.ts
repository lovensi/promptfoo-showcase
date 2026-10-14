import { describe, it, expect } from "vitest";
import { slugify } from "./slugify.js";

describe("slugify", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugify("a -- b!!")).toBe("a-b");
  });

  it("removes diacritics", () => {
    expect(slugify("Crème brûlée")).toBe("creme-brulee");
  });

  it("transliterates German sharp s (ß and ẞ) to ss", () => {
    expect(slugify("Straße")).toBe("strasse");
    expect(slugify("GROẞE Straße")).toBe("grosse-strasse");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  --Promptfoo Showcase--  ")).toBe("promptfoo-showcase");
  });

  it("returns an empty string for input with no alphanumerics", () => {
    expect(slugify("!!!")).toBe("");
  });
});
