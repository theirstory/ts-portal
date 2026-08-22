/**
 * Which words of a query are worth highlighting.
 *
 * Shared by the page-image overlay and the page-text panel so the two never disagree about
 * what matched.
 *
 * The length floor exists to keep "the" and "and" from lighting up a page. But a flat floor
 * of four characters silently drops exactly the terms this corpus turns on — DEA, FDA, MME,
 * NAS — so short tokens are kept when the user typed them in capitals, which is how people
 * write acronyms and is not how they write stopwords.
 */
export function queryTerms(query: string): string[] {
  const terms = new Set<string>();

  for (const raw of (query ?? '').split(/\s+/)) {
    const cleaned = raw.replace(/[^\p{L}\p{N}]/gu, '');
    if (!cleaned) continue;

    const isAcronym =
      cleaned.length >= 2 && /\p{Lu}/u.test(cleaned) && cleaned === cleaned.toUpperCase();

    if (cleaned.length > 3 || isAcronym) terms.add(cleaned.toLowerCase());
  }

  return [...terms];
}

/** Normalise a word from the page for comparison against a query term. */
export function normaliseWord(word: string): string {
  return (word ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** True when a page word should be highlighted for one of these query terms. */
export function wordMatchesTerms(word: string, terms: string[]): boolean {
  const normalised = normaliseWord(word);
  if (!normalised) return false;

  return terms.some((term) => {
    // Forward prefix catches inflections: "addiction" matches a query for "addict".
    if (normalised.startsWith(term)) return true;
    // The reverse catches the opposite inflection ("prescribe" for a query of
    // "prescribing"), but only for words long enough to be a real stem. Without that floor,
    // every "a" matches "addiction" and every "it" matches "items".
    return normalised.length >= 4 && term.startsWith(normalised);
  });
}
