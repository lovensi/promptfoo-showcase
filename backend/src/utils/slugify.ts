/**
 * Converts arbitrary text into a URL-friendly slug.
 *
 *   slugify("Hello World!")        -> "hello-world"
 *   slugify("  Crème brûlée  ")    -> "creme-brulee"
 *   slugify("a -- b")              -> "a-b"
 *   slugify("Straße")              -> "strasse"
 */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss") // NFKD does not decompose ß (or ẞ, lowercased above)
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
