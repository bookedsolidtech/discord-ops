/**
 * Fuzzy name resolution for channels, roles, and members.
 * Resolution order: exact ID → exact name → normalized → substring.
 */

export interface Named {
  id: string;
  name: string;
}

export interface FuzzyMatch<T extends Named> {
  item: T;
  score: number;
  matchType: "exact_id" | "exact_name" | "normalized" | "substring";
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_ ]/g, "");
}

export function fuzzyFind<T extends Named>(
  items: T[],
  query: string,
  threshold: number = 0.75,
): FuzzyMatch<T> | undefined {
  // 1. Exact ID match
  const byId = items.find((item) => item.id === query);
  if (byId) return { item: byId, score: 1, matchType: "exact_id" };

  const lowerQuery = query.toLowerCase();

  // 2. Exact name match (case-insensitive)
  const byName = items.find((item) => item.name.toLowerCase() === lowerQuery);
  if (byName) return { item: byName, score: 1, matchType: "exact_name" };

  // 3. Normalized match (strip separators)
  const normalizedQuery = normalize(query);
  const byNormalized = items.find((item) => normalize(item.name) === normalizedQuery);
  if (byNormalized) return { item: byNormalized, score: 0.9, matchType: "normalized" };

  // 4. Substring containment with score
  const substringMatches: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const normalName = normalize(item.name);
    if (normalName.includes(normalizedQuery) || normalizedQuery.includes(normalName)) {
      const shorter = Math.min(normalName.length, normalizedQuery.length);
      const longer = Math.max(normalName.length, normalizedQuery.length);
      const score = shorter / longer;
      if (score >= threshold) {
        substringMatches.push({ item, score, matchType: "substring" });
      }
    }
  }

  if (substringMatches.length > 0) {
    substringMatches.sort((a, b) => b.score - a.score);
    return substringMatches[0];
  }

  return undefined;
}
