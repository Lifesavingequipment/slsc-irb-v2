// Display-name helpers for member lists.
// Rule: show first name only; if two people share the first name,
// disambiguate with a last initial; if still ambiguous, show full name.
// Lists should be sorted alphabetically by the resulting display name.

export type NamedPerson = { id: string; full_name?: string | null };

const parts = (full: string | null | undefined) => {
  const tokens = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first: "", last: "", full: "" };
  return {
    first: tokens[0],
    last: tokens.length > 1 ? tokens[tokens.length - 1] : "",
    full: tokens.join(" "),
  };
};

/**
 * Build id -> display-name map honoring the disambiguation rules above.
 * Pass every person whose name might appear in the same visible list so
 * collisions can be detected.
 */
export function buildNameMap<T extends NamedPerson>(
  people: T[],
  fallback = "Member",
): Record<string, string> {
  // Group by lowercase first name
  const byFirst: Record<string, T[]> = {};
  for (const p of people) {
    const f = parts(p.full_name).first.toLowerCase() || fallback.toLowerCase();
    (byFirst[f] ||= []).push(p);
  }
  const out: Record<string, string> = {};
  for (const group of Object.values(byFirst)) {
    if (group.length === 1) {
      const p = group[0];
      out[p.id] = parts(p.full_name).first || fallback;
      continue;
    }
    // Try first name + last initial
    const byFirstAndInitial: Record<string, T[]> = {};
    for (const p of group) {
      const { first, last } = parts(p.full_name);
      const key = `${first.toLowerCase()}|${(last[0] ?? "").toLowerCase()}`;
      (byFirstAndInitial[key] ||= []).push(p);
    }
    for (const sub of Object.values(byFirstAndInitial)) {
      if (sub.length === 1) {
        const p = sub[0];
        const { first, last } = parts(p.full_name);
        out[p.id] = last ? `${first} ${last[0]}.` : first || fallback;
      } else {
        // Still ambiguous — use full name
        for (const p of sub) {
          out[p.id] = parts(p.full_name).full || fallback;
        }
      }
    }
  }
  return out;
}

/** Alphabetical sort comparator using a precomputed name map. */
export function sortByDisplayName<T extends { id: string }>(
  map: Record<string, string>,
): (a: T, b: T) => number {
  return (a, b) => (map[a.id] ?? "").localeCompare(map[b.id] ?? "");
}

/** Convenience: given a full list, return [sortedList, nameMap]. */
export function withDisplayNames<T extends NamedPerson>(
  people: T[],
  fallback = "Member",
): { sorted: T[]; names: Record<string, string> } {
  const names = buildNameMap(people, fallback);
  const sorted = [...people].sort((a, b) =>
    (names[a.id] ?? "").localeCompare(names[b.id] ?? ""),
  );
  return { sorted, names };
}
