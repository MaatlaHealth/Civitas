/**
 * Lightweight lexical similarity for short incident descriptions.
 *
 * This is deliberately simple and deterministic: tokens are lower-cased,
 * stop words are removed, a few common suffixes are stripped, and the
 * Jaccard index of the two token sets is returned. It measures shared
 * vocabulary, not meaning, which is why it carries the lowest weight in the
 * duplicate score.
 */

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from", "has", "have",
  "in", "is", "it", "its", "near", "of", "on", "or", "our", "that", "the", "there", "this", "to",
  "was", "were", "with", "very", "please", "next", "outside", "front", "since", "now",
]);

const MIN_TOKEN_LENGTH = 3;

function stem(token: string): string {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize("NFKD")
    // Drop combining marks first so "résumé" folds to "resume" instead of splitting.
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(token))
    .map(stem);
  return new Set(tokens);
}

/** Jaccard similarity of the token sets, in [0, 1]. Returns 0 if either text is empty. */
export function descriptionSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const token of tokensA) if (tokensB.has(token)) shared += 1;
  return shared / (tokensA.size + tokensB.size - shared);
}
