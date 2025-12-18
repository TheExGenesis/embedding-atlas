// Copyright (c) 2025 Apple Inc. Licensed under MIT License.

import { hcl, rgb } from "d3-color";
import { interpolateTurbo } from "d3-scale-chromatic";

const category10 = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
];

const category20 = [
  "#1f77b4",
  "#aec7e8",
  "#ff7f0e",
  "#ffbb78",
  "#2ca02c",
  "#98df8a",
  "#d62728",
  "#ff9896",
  "#9467bd",
  "#c5b0d5",
  "#8c564b",
  "#c49c94",
  "#e377c2",
  "#f7b6d2",
  "#7f7f7f",
  "#c7c7c7",
  "#bcbd22",
  "#dbdb8d",
  "#17becf",
  "#9edae5",
];

export function defaultCategoryColors(count: number): string[] {
  if (count < 1) {
    count = 1;
  }
  if (count <= category10.length) {
    return category10.slice(0, count);
  } else if (count <= category20.length) {
    return category20.slice(0, count);
  } else {
    // For more than 20 categories, generate colors using HSL with evenly distributed hues
    let colors: string[] = [...category20];
    for (let i = category20.length; i < count; i++) {
      // Generate hue evenly distributed around the color wheel
      const hue = (i * 360 / count) % 360;
      // Alternate between high and medium saturation for variety
      const saturation = i % 2 === 0 ? 70 : 85;
      // Alternate lightness to create visual distinction
      const lightness = 45 + (i % 3) * 10;
      colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
    return colors;
  }
}

/**
 * Generate colors for categories based on their spatial positions in the embedding space.
 * Nearby clusters will have similar colors (similar hue), creating a natural spatial color gradient.
 * Inspired by datamapplot's palette generation algorithm.
 *
 * @param categoryCount - Number of categories
 * @param categoryPositions - Array of [x, y] positions for each category (e.g., cluster centroids)
 * @param options - Optional configuration
 * @returns Array of color hex strings
 */
export function spatialCategoryColors(
  categoryCount: number,
  categoryPositions: Array<[number, number]>,
  options: {
    hueShift?: number;
    minLightness?: number;
    radiusWeightPower?: number;
  } = {},
): string[] {
  const { hueShift = 0, minLightness = 10, radiusWeightPower = 1.0 } = options;

  if (categoryCount === 0 || categoryPositions.length === 0) {
    return [];
  }

  // Find center of all positions
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of categoryPositions) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const centerX = minX + (maxX - minX) / 2;
  const centerY = minY + (maxY - minY) / 2;

  // Convert to polar coordinates
  const polarCoords = categoryPositions.map(([x, y]) => {
    const dx = x - centerX;
    const dy = y - centerY;
    const radius = Math.sqrt(dx * dx + dy * dy);
    const theta = Math.atan2(dy, dx);
    return { radius, theta, x, y };
  });

  // Sort by theta and calculate cumulative weights for hue distribution
  const sorted = [...polarCoords].sort((a, b) => a.theta - b.theta);
  const weights = sorted.map((p) => Math.pow(p.radius, radiusWeightPower));
  let cumSum = 0;
  const cumulativeWeights = weights.map((w) => {
    cumSum += w;
    return cumSum;
  });
  const totalWeight = cumSum;

  // Assign colors using circular colormap based on angular position
  const colors: string[] = [];
  const maxRadius = Math.max(...polarCoords.map((p) => p.radius), 0.0001); // Avoid division by zero

  for (const coord of polarCoords) {
    // Find position in sorted array
    const sortedIndex = sorted.findIndex((s) => s.theta === coord.theta && s.radius === coord.radius);
    const normalizedWeight = sortedIndex >= 0 ? cumulativeWeights[sortedIndex] / totalWeight : 0;

    // Use turbo colormap for base color (circular around the color wheel)
    let t = normalizedWeight + hueShift / 360;
    t = t % 1.0;
    if (t < 0) t += 1.0;

    // Get base color from turbo colormap
    const baseColor = interpolateTurbo(t);
    const baseHcl = hcl(baseColor);

    // Normalize radius to 0-1 range
    const normalizedRadius = coord.radius / maxRadius;

    // Vary chroma (saturation) based on distance - outer clusters more saturated
    const chroma = baseHcl.c * (0.5 + 0.5 * normalizedRadius); // Range: 50-100% of base chroma

    // Vary lightness based on distance - outer clusters slightly darker
    const lightness = baseHcl.l * (1.0 - 0.3 * normalizedRadius); // Range: 70-100% of base lightness
    const clampedLightness = Math.max(lightness, minLightness);

    // Create HCL color and convert to hex
    const color = hcl(baseHcl.h, chroma, clampedLightness);
    colors.push(color.formatHex());
  }

  return colors;
}

/** Parse color string into normalized sRGB values (all between 0 and 1). */
export function parseColorNormalizedRgb(str: string): { r: number; g: number; b: number; a: number } {
  let { r, g, b, opacity } = rgb(str);
  return { r: r / 255.0, g: g / 255.0, b: b / 255.0, a: opacity };
}
