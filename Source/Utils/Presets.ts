export interface PresetImage {
  id: string;
  name: string;
  stops: [string, string, string];
  glow: string;
}

export const PresetImages: PresetImage[] = [
  { id: "dusk", name: "Crepúsculo", stops: ["#2b1055", "#7597de", "#e0567a"], glow: "#ffb37a" },
  { id: "aurora", name: "Aurora", stops: ["#0b1d3a", "#1fa2a6", "#8ef0b0"], glow: "#c8fff0" },
  { id: "ocean", name: "Océano", stops: ["#03122e", "#0a4f9c", "#39b8ff"], glow: "#d3f1ff" },
  { id: "sunset", name: "Atardecer", stops: ["#3a1c71", "#d76d77", "#ffaf7b"], glow: "#fff0b3" },
  { id: "glacier", name: "Glaciar", stops: ["#12324f", "#5aa9d6", "#e8f8ff"], glow: "#ffffff" },
  { id: "nebula", name: "Nebulosa", stops: ["#1a0b3d", "#6a2bd9", "#ff4fa3"], glow: "#ffd0f0" },
  { id: "horizon", name: "Horizonte", stops: ["#101a3a", "#3b56c9", "#f4a261"], glow: "#ffe0b0" },
  { id: "bloom", name: "Floración", stops: ["#3d0d3c", "#c23b8a", "#ffb5d8"], glow: "#fff0f7" },
  { id: "lagoon", name: "Laguna", stops: ["#062925", "#0f7a6c", "#5eead4"], glow: "#d5fff6" },
  { id: "meadow", name: "Pradera", stops: ["#132a13", "#4f772d", "#d9ed92"], glow: "#faffd6" }
];

export function presetDataUrl(preset: PresetImage): string {
  const [a, b, c] = preset.stops;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><radialGradient id="r" cx="0.5" cy="0.62" r="0.45"><stop offset="0" stop-color="${preset.glow}" stop-opacity="0.85"/><stop offset="1" stop-color="${preset.glow}" stop-opacity="0"/></radialGradient></defs><rect width="800" height="1200" fill="url(#g)"/><circle cx="400" cy="740" r="340" fill="url(#r)"/><path d="M0 900 C160 820 300 960 460 880 S700 800 800 860 V1200 H0Z" fill="${a}" opacity="0.55"/><path d="M0 1000 C200 930 320 1050 520 990 S720 940 800 980 V1200 H0Z" fill="${a}" opacity="0.8"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function findPreset(id: string | undefined): PresetImage | null {
  return PresetImages.find((preset) => preset.id === id) ?? null;
}
