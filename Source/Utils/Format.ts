export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function parseSongName(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const separator = base.indexOf(" - ");
  if (separator > 0 && separator < base.length - 3) {
    return { artist: base.slice(0, separator).trim(), title: base.slice(separator + 3).trim() };
  }
  return { title: base.length > 0 ? base : "Sin título", artist: "" };
}

export function decodeHtml(value: string): string {
  const area = document.createElement("textarea");
  area.innerHTML = value;
  return area.value;
}
