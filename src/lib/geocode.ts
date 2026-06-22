export type Coords = { lat: number; lng: number };

/**
 * Looks up coordinates for a free-text address via Nominatim. Returns null
 * on no match or network failure — callers must not invent fallback
 * coordinates; show an error and let the user retry or enter coordinates
 * manually instead.
 */
export async function geocodeAddress(query: string): Promise<Coords | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=au,nz`,
      { headers: { "User-Agent": "slsc-irb-v2 (surf club app)" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { lat: string; lon: string }[];
    if (!data?.[0]) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!isValidLat(lat) || !isValidLng(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export function isValidLat(v: number): boolean {
  return Number.isFinite(v) && v >= -90 && v <= 90;
}

export function isValidLng(v: number): boolean {
  return Number.isFinite(v) && v >= -180 && v <= 180;
}
