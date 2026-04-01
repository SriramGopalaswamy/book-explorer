const DEFAULT_CHART_PALETTE = [
  "#3B82F6", // blue
  "#EF4444", // red
  "#22C55E", // green
  "#F59E0B", // amber
  "#8B5CF6", // purple
  "#14B8A6", // teal
  "#EC4899", // pink
  "#6366F1", // indigo
];

export const getStableColorByKey = (key: string, fallbackIndex = 0, palette = DEFAULT_CHART_PALETTE) => {
  const normalized = (key || "").trim().toLowerCase();
  if (!normalized) return palette[fallbackIndex % palette.length];

  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }

  return palette[hash % palette.length];
};

export const getDistinctColorByIndex = (index: number) => {
  const hue = Math.round((index * 137.508) % 360); // golden-angle distribution
  return `hsl(${hue} 72% 48%)`;
};

