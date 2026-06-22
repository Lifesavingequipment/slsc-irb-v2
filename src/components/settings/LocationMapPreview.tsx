import { cn } from "@/lib/utils";
import type { Coords } from "@/lib/geocode";

type Props = {
  coords: Coords;
  className?: string;
};

/** Lightweight pinned map preview using OpenStreetMap's embed view — no API key, no extra bundle weight. */
export function LocationMapPreview({ coords, className }: Props) {
  const delta = 0.006;
  const bbox = [
    coords.lng - delta,
    coords.lat - delta,
    coords.lng + delta,
    coords.lat + delta,
  ].join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${coords.lat}%2C${coords.lng}`;

  return (
    <iframe
      title="Map preview"
      src={src}
      className={cn("h-40 w-full rounded-xl border", className)}
      loading="lazy"
    />
  );
}
