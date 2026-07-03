export function floodFillBubble(
  imageData: ImageData,
  startX: number,
  startY: number,
  regionWidth?: number,
  regionHeight?: number,
  avoidPoints?: { x: number; y: number }[]
): { x: number; y: number; width: number; height: number } | null {
  const result = floodFillBubbleDetailed(imageData, startX, startY, regionWidth, regionHeight, avoidPoints);
  if (!result) return null;
  return {
    x: result.x,
    y: result.y,
    width: result.width,
    height: result.height,
  };
}

export interface DetailedBubbleResult {
  x: number;
  y: number;
  width: number;
  height: number;
  contour: number[]; // flat array of coordinates [x1, y1, x2, y2, ...]
  safeTextBounds: { x: number; y: number; width: number; height: number };
}

interface TextCluster {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  pixelCount: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Art-scale factor relative to a ~900px reference manga page.
 * Webtoon strips are effectively unbounded vertically, so page width is the
 * only reliable indicator of glyph/stroke/bubble scale there.
 */
function scaleUnit(width: number, height: number): number {
  const ref = height > width * 2.5 ? width : Math.min(width, height);
  return clamp(ref / 900, 0.7, 2.6);
}

// Redmean approximation for CIE76 to match human vision perfectly
function redmeanDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

// Convert RGB to relative luminance to analyze text-to-background contrast
function getLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * AI Concept: Simple Unsupervised K-Means (K=2) to cluster local pixels
 * into background/foreground, used to accurately separate text and bubble colors.
 * Centroids are seeded from the darkest/brightest samples for stable convergence,
 * and final population counts are returned so callers can tell majority from minority.
 */
function localKMeans2D(samples: RGB[]): { c1: number[]; c2: number[]; n1: number; n2: number } {
  if (samples.length < 2) return { c1: [255, 255, 255], c2: [0, 0, 0], n1: 0, n2: 0 };

  let darkIdx = 0, brightIdx = 0;
  let darkL = Infinity, brightL = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    const l = getLuminance(samples[i].r, samples[i].g, samples[i].b);
    if (l < darkL) { darkL = l; darkIdx = i; }
    if (l > brightL) { brightL = l; brightIdx = i; }
  }

  let m1 = [samples[brightIdx].r, samples[brightIdx].g, samples[brightIdx].b];
  let m2 = [samples[darkIdx].r, samples[darkIdx].g, samples[darkIdx].b];
  let count1 = 0, count2 = 0;

  for (let iter = 0; iter < 6; iter++) {
    let s1R = 0, s1G = 0, s1B = 0;
    let s2R = 0, s2G = 0, s2B = 0;
    count1 = 0;
    count2 = 0;

    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      const d1 = redmeanDistance(p.r, p.g, p.b, m1[0], m1[1], m1[2]);
      const d2 = redmeanDistance(p.r, p.g, p.b, m2[0], m2[1], m2[2]);
      if (d1 < d2) {
        s1R += p.r; s1G += p.g; s1B += p.b; count1++;
      } else {
        s2R += p.r; s2G += p.g; s2B += p.b; count2++;
      }
    }

    if (count1 > 0) m1 = [s1R / count1, s1G / count1, s1B / count1];
    if (count2 > 0) m2 = [s2R / count2, s2G / count2, s2B / count2];
  }

  return { c1: m1, c2: m2, n1: count1, n2: count2 };
}

/**
 * AI Concept: Online Linear Classifier (Perceptron with Sigmoid Activation)
 * We train this tiny neural network on-the-fly using the clicked location (stable seed)
 * as positive feedback, and ray-probed samples beyond the bubble border as negatives.
 */
class LocalPerceptronClassifier {
  private weights: number[] = [0, 0, 0]; // R, G, B weights
  private bias = 0;

  constructor() {
    // Start with balanced initial state
    this.weights = [0.1, 0.1, 0.1];
    this.bias = -0.5;
  }

  // Sigmoid activation function
  private sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, z))));
  }

  public predict(r: number, g: number, b: number): number {
    // Normalize inputs to [0, 1] for stable neural network performance
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const z = nr * this.weights[0] + ng * this.weights[1] + nb * this.weights[2] + this.bias;
    return this.sigmoid(z);
  }

  // Train the classifier on-the-fly using Stochastic Gradient Descent (SGD)
  public train(
    positives: RGB[],
    negatives: RGB[],
    epochs = 40
  ) {
    const lr = 0.12; // Adaptive learning rate

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Interleave positive and negative samples
      const sampleSize = Math.max(positives.length, negatives.length);
      for (let i = 0; i < sampleSize; i++) {
        if (i < positives.length) {
          const p = positives[i];
          const pred = this.predict(p.r, p.g, p.b);
          const error = 1.0 - pred; // Target is 1.0
          const dZ = error * pred * (1.0 - pred); // derivative of sigmoid
          this.weights[0] += lr * dZ * (p.r / 255);
          this.weights[1] += lr * dZ * (p.g / 255);
          this.weights[2] += lr * dZ * (p.b / 255);
          this.bias += lr * dZ;
        }
        if (i < negatives.length) {
          const n = negatives[i];
          const pred = this.predict(n.r, n.g, n.b);
          const error = 0.0 - pred; // Target is 0.0
          const dZ = error * pred * (1.0 - pred);
          this.weights[0] += lr * dZ * (n.r / 255);
          this.weights[1] += lr * dZ * (n.g / 255);
          this.weights[2] += lr * dZ * (n.b / 255);
          this.bias += lr * dZ;
        }
      }
    }
  }
}

/**
 * Border ray-probing: walk 16 rays out from the seed until each crosses a sharp
 * luminance step that does NOT return to the fill color (i.e. the real bubble
 * border, not a text stroke). Positives are harvested inside the border and
 * negatives just beyond it, so classifier training adapts to any bubble size —
 * the old fixed 10-60px sampling ring landed INSIDE large manhwa bubbles and
 * poisoned the negative set.
 */
function probeRays(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sx: number,
  sy: number,
  maxExtentX: number,
  maxExtentY: number,
  seedR: number,
  seedG: number,
  seedB: number
): { positives: RGB[]; negatives: RGB[] } {
  const positives: RGB[] = [];
  const negatives: RGB[] = [];
  const RAYS = 16;

  for (let k = 0; k < RAYS; k++) {
    const ang = (Math.PI * 2 * k) / RAYS;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let borderR = -1;
    let l1 = -1, l2 = -1; // luminance history at r-1 and r-2
    let r = 2;

    while (true) {
      const px = Math.round(sx + dx * r);
      const py = Math.round(sy + dy * r);
      if (px < 0 || px >= width || py < 0 || py >= height) break;
      if (Math.abs(px - sx) > maxExtentX || Math.abs(py - sy) > maxExtentY) break;
      const idx = (py * width + px) * 4;
      if (data[idx + 3] < 64) break;
      const l = getLuminance(data[idx], data[idx + 1], data[idx + 2]);

      if (l2 >= 0 && Math.abs(l - l2) >= 42) {
        // Sharp step — border candidate. Peek past it: lettering inside the
        // bubble returns to the fill color, a real border does not.
        const bx = Math.round(sx + dx * (r + 5));
        const by = Math.round(sy + dy * (r + 5));
        let confirmed = true;
        if (bx >= 0 && bx < width && by >= 0 && by < height) {
          const bIdx = (by * width + bx) * 4;
          if (
            data[bIdx + 3] >= 64 &&
            redmeanDistance(data[bIdx], data[bIdx + 1], data[bIdx + 2], seedR, seedG, seedB) < 55
          ) {
            confirmed = false; // crossed a text stroke, keep walking
          }
        }
        if (confirmed) {
          borderR = r;
          break;
        }
        r += 6;
        l1 = -1;
        l2 = -1;
        continue;
      }

      l2 = l1;
      l1 = l;
      r++;
    }

    if (borderR > 6) {
      // Interior positives (skip samples that hit lettering)
      const fractions = [0.35, 0.7];
      for (let f = 0; f < fractions.length; f++) {
        const px = Math.round(sx + dx * borderR * fractions[f]);
        const py = Math.round(sy + dy * borderR * fractions[f]);
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        const idx = (py * width + px) * 4;
        if (data[idx + 3] < 64) continue;
        if (redmeanDistance(data[idx], data[idx + 1], data[idx + 2], seedR, seedG, seedB) <= 70) {
          positives.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
        }
      }
      // Negatives: the border ink itself and just beyond it
      const offsets = [3, 6];
      for (let o = 0; o < offsets.length; o++) {
        const px = Math.round(sx + dx * (borderR + offsets[o]));
        const py = Math.round(sy + dy * (borderR + offsets[o]));
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        const idx = (py * width + px) * 4;
        if (data[idx + 3] < 64) continue;
        negatives.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
      }
    }
  }

  return { positives, negatives };
}

/**
 * Moore-Neighbor boundary tracing with Jacob's stopping criterion.
 * The naive "step to the first filled neighbor" variant could dive into the
 * blob interior and loop back to the start after a handful of points, producing
 * a degenerate contour that poisoned the boundary-strength audit (bubbles then
 * failed every tier and fell back to rounded rectangles). The backtrack pointer
 * keeps the scan anchored to the outside of the shape.
 */
function traceContour(visited: Uint8Array, width: number, height: number, startX: number, startY: number): number[] {
  let bx = startX;
  const by = startY;
  while (bx > 0 && visited[by * width + (bx - 1)] === 1) {
    bx--;
  }

  const dx8 = [-1, -1, 0, 1, 1, 1, 0, -1]; // W NW N NE E SE S SW (clockwise)
  const dy8 = [0, -1, -1, -1, 0, 1, 1, 1];
  // After stepping toward direction d, the backtrack points at the background
  // pixel scanned immediately before d was found.
  const nextBacktrack = [6, 6, 0, 0, 2, 2, 4, 4];

  const contourPoints: number[] = [];
  let cx = bx;
  let cy = by;
  let backtrack = 0; // the W neighbor of the leftmost pixel is guaranteed background
  const startCx = cx;
  const startCy = cy;
  const startBacktrack = backtrack;
  const maxSteps = Math.max(1000, Math.round(width * height * 0.1));
  let steps = 0;

  while (steps < maxSteps) {
    contourPoints.push(cx, cy);

    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (backtrack + k) % 8;
      const nx = cx + dx8[d];
      const ny = cy + dy8[d];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && visited[ny * width + nx] === 1) {
        found = d;
        break;
      }
    }
    if (found === -1) break; // isolated single-pixel region

    cx += dx8[found];
    cy += dy8[found];
    backtrack = nextBacktrack[found];
    steps++;

    // Jacob's criterion: stop when the start pixel is re-entered the same way
    if (cx === startCx && cy === startCy && backtrack === startBacktrack) {
      break;
    }
  }

  return contourPoints;
}

// Ramer-Douglas-Peucker polyline simplification to optimize coordinate sizes
function douglasPeucker(points: number[], epsilon: number): number[] {
  const n = points.length / 2;
  if (n < 3) return points.slice();

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [startIdx, endIdx] = stack.pop()!;
    if (endIdx <= startIdx + 1) continue;

    const x1 = points[startIdx * 2];
    const y1 = points[startIdx * 2 + 1];
    const x2 = points[endIdx * 2];
    const y2 = points[endIdx * 2 + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    let maxDist = -1;
    let maxIdx = -1;
    for (let i = startIdx + 1; i < endIdx; i++) {
      const px = points[i * 2];
      const py = points[i * 2 + 1];
      let dist: number;
      if (lenSq === 0) {
        dist = Math.hypot(px - x1, py - y1);
      } else {
        const t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        dist = Math.hypot(px - projX, py - projY);
      }
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon && maxIdx !== -1) {
      keep[maxIdx] = 1;
      stack.push([startIdx, maxIdx]);
      stack.push([maxIdx, endIdx]);
    }
  }

  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) result.push(points[i * 2], points[i * 2 + 1]);
  }
  return result;
}

function simplifyContour(points: number[], targetMax = 180): number[] {
  if (points.length / 2 <= targetMax) return points;
  let simplified = points;
  let epsilon = 1.0;
  for (let i = 0; i < 10 && simplified.length / 2 > targetMax; i++) {
    simplified = douglasPeucker(points, epsilon);
    epsilon *= 1.6;
  }
  return simplified;
}

// Chaikin corner-cutting: organic rounding for synthetic outlines (SFX patches)
// where snake optimization would wrongly pull the contour back onto the lettering.
function chaikinSmooth(points: number[], iterations = 1): number[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    const n = pts.length / 2;
    if (n < 3) return pts;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = pts[i * 2], y1 = pts[i * 2 + 1];
      const x2 = pts[j * 2], y2 = pts[j * 2 + 1];
      out.push(
        x1 * 0.75 + x2 * 0.25, y1 * 0.75 + y2 * 0.25,
        x1 * 0.25 + x2 * 0.75, y1 * 0.25 + y2 * 0.75
      );
    }
    pts = out;
  }
  return pts;
}

/**
 * AI/Computer Vision Concept: Active Contour Model (Snakes)
 * Iteratively deforms the contour to minimize an energy function.
 * This smooths out pixel jaggedness, aligns with physical speech bubble borders,
 * and maintains clean aesthetic shapes on complex manhwa backdrops.
 */
function optimizeContourSnakes(
  points: number[],
  imageData: ImageData,
  alpha = 0.2, // Elasticity (pulls points together)
  beta = 0.35,  // Stiffness (prevents sharp bending)
  gamma = 1.8  // Image force (attracts to strong visual gradients)
): number[] {
  const n = points.length / 2;
  if (n < 6) return points; // Avoid processing extremely small loops

  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // Create a fast gradient magnitude map
  const getGradient = (x: number, y: number): number => {
    const rx = Math.min(width - 1, Math.max(0, Math.round(x)));
    const ry = Math.min(height - 1, Math.max(0, Math.round(y)));
    const idx = (ry * width + rx) * 4;
    const lCenter = getLuminance(data[idx], data[idx + 1], data[idx + 2]);

    // Simple Sobel-like edge contrast
    const idxR = (ry * width + Math.min(width - 1, rx + 1)) * 4;
    const idxD = (Math.min(height - 1, ry + 1) * width + rx) * 4;
    const lR = getLuminance(data[idxR], data[idxR + 1], data[idxR + 2]);
    const lD = getLuminance(data[idxD], data[idxD + 1], data[idxD + 2]);

    return Math.abs(lCenter - lR) + Math.abs(lCenter - lD);
  };

  const refined = points.slice();

  // Run 4 optimization steps for smooth convergence
  for (let step = 0; step < 4; step++) {
    for (let i = 0; i < n; i++) {
      const prevX = refined[((i - 1 + n) % n) * 2];
      const prevY = refined[((i - 1 + n) % n) * 2 + 1];
      const currX = refined[i * 2];
      const currY = refined[i * 2 + 1];
      const nextX = refined[((i + 1) % n) * 2];
      const nextY = refined[((i + 1) % n) * 2 + 1];

      let bestX = currX;
      let bestY = currY;
      let minEnergy = Infinity;

      // Search in local 3x3 window around current point
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = currX + dx;
          const cy = currY + dy;

          if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

          // 1. Elastic Energy: minimize distance to neighbors
          const d1x = cx - prevX;
          const d1y = cy - prevY;
          const d2x = nextX - cx;
          const d2y = nextY - cy;
          const eElastic = d1x * d1x + d1y * d1y + d2x * d2x + d2y * d2y;

          // 2. Stiffness Energy: keep lines straight/smooth
          const sx = prevX - 2 * cx + nextX;
          const sy = prevY - 2 * cy + nextY;
          const eStiffness = sx * sx + sy * sy;

          // 3. Image Force Energy: lower energy at strong contrast lines
          const grad = getGradient(cx, cy);
          const eImage = -grad; // Negative because we want to maximize gradient contrast

          const totalEnergy = alpha * eElastic + beta * eStiffness + gamma * eImage;
          if (totalEnergy < minEnergy) {
            minEnergy = totalEnergy;
            bestX = cx;
            bestY = cy;
          }
        }
      }
      refined[i * 2] = bestX;
      refined[i * 2 + 1] = bestY;
    }
  }

  return refined;
}

// Sweep-line histogram solver to find the largest inscribed rectangle in binary masks
function maximalInscribedRect(mask: Uint8Array, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  if (w <= 0 || h <= 0) return null;

  const heights = new Int32Array(w);
  const stack: number[] = [];
  let best = { area: 0, x: 0, y: 0, w: 0, h: 0 };

  for (let row = 0; row < h; row++) {
    const rowBase = row * w;
    for (let col = 0; col < w; col++) {
      heights[col] = mask[rowBase + col] ? heights[col] + 1 : 0;
    }

    stack.length = 0;
    for (let col = 0; col <= w; col++) {
      const curHeight = col < w ? heights[col] : 0;
      while (stack.length > 0 && heights[stack[stack.length - 1]] >= curHeight) {
        const topIdx = stack.pop()!;
        const height = heights[topIdx];
        const left = stack.length > 0 ? stack[stack.length - 1] + 1 : 0;
        const width = col - left;
        const area = height * width;
        if (area > best.area) {
          best = { area, x: left, y: row - height + 1, w: width, h: height };
        }
      }
      stack.push(col);
    }
  }

  return best.area > 0 ? best : null;
}

// Close mask to eliminate halftone patterns and JPEG noise gaps
function closeMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const dilated = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) { dilated[y * w + x] = 1; continue; }
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        const rowBase = ny * w;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (mask[rowBase + nx]) { found = true; break; }
        }
      }
      dilated[y * w + x] = found ? 1 : 0;
    }
  }

  const closed = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dilated[y * w + x]) { closed[y * w + x] = 0; continue; }
      let allSet = true;
      for (let dy = -radius; dy <= radius && allSet; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) { allSet = false; break; }
        const rowBase = ny * w;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w || !dilated[rowBase + nx]) { allSet = false; break; }
        }
      }
      closed[y * w + x] = allSet ? 1 : 0;
    }
  }
  return closed;
}

/**
 * Two-pass chamfer distance transform (Chebyshev metric). O(area) regardless of
 * the padding radius — lets SFX outlines pad/join letter blobs cheaply where a
 * windowed dilation would be O(area * r^2).
 */
function chebyshevDT(mask: Uint8Array, w: number, h: number): Uint16Array {
  const INF = 60000;
  const d = new Uint16Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) { d[i] = 0; continue; }
      let best = INF;
      if (x > 0 && d[i - 1] + 1 < best) best = d[i - 1] + 1;
      if (y > 0) {
        if (d[i - w] + 1 < best) best = d[i - w] + 1;
        if (x > 0 && d[i - w - 1] + 1 < best) best = d[i - w - 1] + 1;
        if (x < w - 1 && d[i - w + 1] + 1 < best) best = d[i - w + 1] + 1;
      }
      d[i] = best;
    }
  }

  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let best = d[i];
      if (x < w - 1 && d[i + 1] + 1 < best) best = d[i + 1] + 1;
      if (y < h - 1) {
        if (d[i + w] + 1 < best) best = d[i + w] + 1;
        if (x < w - 1 && d[i + w + 1] + 1 < best) best = d[i + w + 1] + 1;
        if (x > 0 && d[i + w - 1] + 1 < best) best = d[i + w - 1] + 1;
      }
      d[i] = best;
    }
  }

  return d;
}

interface MaskComponent {
  id: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
}

// 8-connected component labeling over a local binary mask
function labelComponents(mask: Uint8Array, w: number, h: number): { labels: Int32Array; comps: MaskComponent[] } {
  const labels = new Int32Array(w * h).fill(-1);
  const comps: MaskComponent[] = [];
  const queue: number[] = [];

  for (let start = 0; start < w * h; start++) {
    if (mask[start] === 0 || labels[start] !== -1) continue;

    const id = comps.length;
    const comp: MaskComponent = {
      id,
      minX: start % w,
      minY: Math.floor(start / w),
      maxX: start % w,
      maxY: Math.floor(start / w),
      count: 0
    };

    queue.length = 0;
    queue.push(start);
    labels[start] = id;

    let qHead = 0;
    while (qHead < queue.length) {
      const cur = queue[qHead++];
      const cx = cur % w;
      const cy = (cur - cx) / w;
      comp.count++;
      if (cx < comp.minX) comp.minX = cx;
      if (cx > comp.maxX) comp.maxX = cx;
      if (cy < comp.minY) comp.minY = cy;
      if (cy > comp.maxY) comp.maxY = cy;

      const y0 = Math.max(0, cy - 1), y1 = Math.min(h - 1, cy + 1);
      const x0 = Math.max(0, cx - 1), x1 = Math.min(w - 1, cx + 1);
      for (let ny = y0; ny <= y1; ny++) {
        const rowBase = ny * w;
        for (let nx = x0; nx <= x1; nx++) {
          const ni = rowBase + nx;
          if (mask[ni] === 1 && labels[ni] === -1) {
            labels[ni] = id;
            queue.push(ni);
          }
        }
      }
    }

    comps.push(comp);
  }

  return { labels, comps };
}

// Chebyshev gap between two bounding boxes (0 when overlapping/touching)
function rectGap(
  aMinX: number, aMinY: number, aMaxX: number, aMaxY: number,
  bMinX: number, bMinY: number, bMaxX: number, bMaxY: number
): number {
  const gx = Math.max(0, Math.max(aMinX, bMinX) - Math.min(aMaxX, bMaxX));
  const gy = Math.max(0, Math.max(aMinY, bMinY) - Math.min(aMaxY, bMaxY));
  return Math.max(gx, gy);
}

/**
 * Adaptive stroke-edge threshold: instead of a fixed gradient cutoff (which
 * misses low-contrast manhwa lettering and over-fires on screentone), measure
 * the local gradient distribution and cut at a fraction of its 80th percentile.
 * The low floor is only allowed when gradient pixels are sparse (clean bubble
 * or caption background — the gradients ARE the lettering); on gradient-dense
 * artwork the floor stays high so panel texture never reads as text.
 */
function adaptiveStrokeThreshold(
  data: Uint8ClampedArray,
  width: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  mask?: Uint8Array,
  fallback = 34
): number {
  const hist = new Uint32Array(64);
  let total = 0;
  let considered = 0;

  const getL = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    return getLuminance(data[idx], data[idx + 1], data[idx + 2]);
  };

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      if (mask && mask[y * width + x] === 0) continue;
      considered++;
      const l = getL(x, y);
      const g = Math.max(Math.abs(l - getL(x + 1, y)), Math.abs(l - getL(x, y + 1)));
      if (g > 8) {
        hist[Math.min(63, g >> 2)]++;
        total++;
      }
    }
  }

  if (total < 40 || considered === 0) return fallback;

  const gradFraction = total / considered;
  const floor = gradFraction < 0.06 ? 22 : 34;

  const target = total * 0.8;
  let acc = 0;
  for (let b = 0; b < 64; b++) {
    acc += hist[b];
    if (acc >= target) {
      return clamp(((b << 2) + 2) * 0.55, floor, 46);
    }
  }
  return fallback;
}

/**
 * Scans the interior of the filled mask to locate distinct, cohesive text clusters.
 * Crucial for separating overlapping bubbles and determining auto-recovery strategies.
 */
function discoverTextClustersInMask(
  data: Uint8ClampedArray,
  width: number,
  _height: number,
  mask: Uint8Array,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  unit: number
): TextCluster[] {
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const isEdge = new Uint8Array(w * h);

  const getL = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    return getLuminance(data[idx], data[idx + 1], data[idx + 2]);
  };

  const edgeThreshold = adaptiveStrokeThreshold(data, width, minX, minY, maxX, maxY, mask, 36);

  // Find high-frequency edge strokes inside the filled mask
  for (let y = 0; y < h; y++) {
    const imgY = minY + y;
    for (let x = 0; x < w; x++) {
      const imgX = minX + x;
      if (mask[imgY * width + imgX] === 0) continue;

      const currentL = getL(imgX, imgY);
      let maxGrad = 0;
      if (x < w - 1 && mask[imgY * width + (imgX + 1)] === 1) {
        maxGrad = Math.max(maxGrad, Math.abs(currentL - getL(imgX + 1, imgY)));
      }
      if (y < h - 1 && mask[(imgY + 1) * width + imgX] === 1) {
        maxGrad = Math.max(maxGrad, Math.abs(currentL - getL(imgX, imgY + 1)));
      }

      if (maxGrad > edgeThreshold) {
        isEdge[y * w + x] = 1;
      }
    }
  }

  // BFS grouping of stroke pixels with an adaptive jumping bridge to reconstruct blocks
  const visited = new Uint8Array(w * h);
  const clusters: TextCluster[] = [];
  const jumpX = Math.round(24 * unit);
  const jumpY = Math.round(16 * unit);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isEdge[y * w + x] === 1 && visited[y * w + x] === 0) {
        const queueX: number[] = [x];
        const queueY: number[] = [y];
        let qHead = 0;
        visited[y * w + x] = 1;

        let cMinX = x, cMaxX = x, cMinY = y, cMaxY = y;
        let sumX = 0, sumY = 0;

        while (qHead < queueX.length) {
          const cx = queueX[qHead];
          const cy = queueY[qHead];
          qHead++;

          sumX += cx;
          sumY += cy;

          if (cx < cMinX) cMinX = cx;
          if (cx > cMaxX) cMaxX = cx;
          if (cy < cMinY) cMinY = cy;
          if (cy > cMaxY) cMaxY = cy;

          const x0 = Math.max(0, cx - jumpX);
          const x1 = Math.min(w - 1, cx + jumpX);
          const y0 = Math.max(0, cy - jumpY);
          const y1 = Math.min(h - 1, cy + jumpY);

          for (let ny = y0; ny <= y1; ny++) {
            const rowBase = ny * w;
            for (let nx = x0; nx <= x1; nx++) {
              if (isEdge[rowBase + nx] === 1 && visited[rowBase + nx] === 0) {
                visited[rowBase + nx] = 1;
                queueX.push(nx);
                queueY.push(ny);
              }
            }
          }
        }

        const clusterW = cMaxX - cMinX + 1;
        const clusterH = cMaxY - cMinY + 1;

        // Skip small noise structures
        if (queueX.length >= 6 && clusterW >= 4 && clusterH >= 4) {
          clusters.push({
            x: minX + cMinX,
            y: minY + cMinY,
            width: clusterW,
            height: clusterH,
            centerX: minX + Math.round(sumX / queueX.length),
            centerY: minY + Math.round(sumY / queueX.length),
            pixelCount: queueX.length
          });
        }
      }
    }
  }

  return clusters;
}

function extractTextCluster(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  unit: number,
  searchRadius?: number
): { x: number; y: number; width: number; height: number } | null {
  const radius = searchRadius ?? Math.round(clamp(220 * unit, 180, 460));
  const minX = Math.max(0, startX - radius);
  const maxX = Math.min(width - 1, startX + radius);
  const minY = Math.max(0, startY - radius);
  const maxY = Math.min(height - 1, startY + radius);

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;

  const isEdge = new Uint8Array(w * h);
  const getL = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    return getLuminance(data[idx], data[idx + 1], data[idx + 2]);
  };

  const edgeThreshold = adaptiveStrokeThreshold(data, width, minX, minY, maxX, maxY, undefined, 34);

  for (let y = 0; y < h; y++) {
    const imgY = minY + y;
    for (let x = 0; x < w; x++) {
      const imgX = minX + x;
      const currentL = getL(imgX, imgY);

      let maxGrad = 0;
      if (x < w - 1) maxGrad = Math.max(maxGrad, Math.abs(currentL - getL(imgX + 1, imgY)));
      if (y < h - 1) maxGrad = Math.max(maxGrad, Math.abs(currentL - getL(imgX, imgY + 1)));

      if (maxGrad > edgeThreshold) {
        isEdge[y * w + x] = 1;
      }
    }
  }

  const localStartX = startX - minX;
  const localStartY = startY - minY;
  let seedX = -1, seedY = -1;
  let minDistSq = Infinity;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isEdge[y * w + x]) {
        const dx = x - localStartX;
        const dy = y - localStartY;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) {
          minDistSq = distSq;
          seedX = x;
          seedY = y;
        }
      }
    }
  }

  const snapLimit = Math.round(64 * unit);
  if (seedX === -1 || minDistSq > snapLimit * snapLimit) return null;

  const visited = new Uint8Array(w * h);
  const queueX: number[] = [seedX];
  const queueY: number[] = [seedY];
  let qHead = 0;
  visited[seedY * w + seedX] = 1;

  let cMinX = seedX, cMaxX = seedX, cMinY = seedY, cMaxY = seedY;
  const jumpX = Math.round(20 * unit);
  const jumpY = Math.round(14 * unit);

  while (qHead < queueX.length) {
    const cx = queueX[qHead];
    const cy = queueY[qHead];
    qHead++;

    if (cx < cMinX) cMinX = cx;
    if (cx > cMaxX) cMaxX = cx;
    if (cy < cMinY) cMinY = cy;
    if (cy > cMaxY) cMaxY = cy;

    const x0 = Math.max(0, cx - jumpX);
    const x1 = Math.min(w - 1, cx + jumpX);
    const y0 = Math.max(0, cy - jumpY);
    const y1 = Math.min(h - 1, cy + jumpY);

    for (let ny = y0; ny <= y1; ny++) {
      const rowBase = ny * w;
      for (let nx = x0; nx <= x1; nx++) {
        if (isEdge[rowBase + nx] && !visited[rowBase + nx]) {
          visited[rowBase + nx] = 1;
          queueX.push(nx);
          queueY.push(ny);
        }
      }
    }
  }

  const clusterW = cMaxX - cMinX + 1;
  const clusterH = cMaxY - cMinY + 1;

  if (queueX.length < 8 || clusterW < 5 || clusterH < 5) return null;

  return {
    x: minX + cMinX,
    y: minY + cMinY,
    width: clusterW,
    height: clusterH
  };
}

/**
 * Measures the contrast the fill actually stopped against. Contour points sit
 * on the rejected shell (usually the border ink), so the comparison must be
 * interior-fill vs just-outside — comparing the shell pixel against its own
 * neighbor reads ink-vs-ink and reports a fake zero for cleanly inked bubbles.
 */
function evaluateBoundaryStrength(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  visited: Uint8Array,
  interior: Uint8Array,
  contourPoints: number[]
): number {
  if (contourPoints.length < 4) return 0;

  let totalDiff = 0;
  let samples = 0;
  const dx = [0, 1, 0, -1];
  const dy = [-1, 0, 1, 0];

  for (let i = 0; i < contourPoints.length; i += 6) {
    const cx = contourPoints[i];
    const cy = contourPoints[i + 1];

    let insideL = -1;
    let outsideL = -1;

    if (interior[cy * width + cx] === 1) {
      const baseIdx = (cy * width + cx) * 4;
      insideL = getLuminance(data[baseIdx], data[baseIdx + 1], data[baseIdx + 2]);
    }

    for (let j = 0; j < 4; j++) {
      const nx = cx + dx[j];
      const ny = cy + dy[j];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx1D = ny * width + nx;
      if (insideL < 0 && interior[nIdx1D] === 1) {
        const inIdx = nIdx1D * 4;
        insideL = getLuminance(data[inIdx], data[inIdx + 1], data[inIdx + 2]);
      } else if (outsideL < 0 && visited[nIdx1D] === 0) {
        const outIdx = nIdx1D * 4;
        outsideL = getLuminance(data[outIdx], data[outIdx + 1], data[outIdx + 2]);
      }
      if (insideL >= 0 && outsideL >= 0) break;
    }

    // The shell pixel itself is the stopping barrier: when the fill halted on
    // ink, contrast against that ink is what proves a real boundary exists.
    if (insideL >= 0 && outsideL < 0) {
      const selfIdx = (cy * width + cx) * 4;
      if (interior[cy * width + cx] === 0) {
        outsideL = getLuminance(data[selfIdx], data[selfIdx + 1], data[selfIdx + 2]);
      }
    }

    if (insideL >= 0 && outsideL >= 0) {
      totalDiff += Math.abs(insideL - outsideL);
      samples++;
    }
  }

  return samples > 0 ? totalDiff / samples : 0;
}

/**
 * Self-Audit Engine: Verifies the integrity of the generated mask.
 * Automatically checks for leakages, abnormal ratios, or extremely sparse shapes.
 * Long-strip aware: on webtoon strips the page area is meaningless, so the leak
 * cap is expressed in page-width units instead.
 */
function auditResult(
  x: number,
  y: number,
  w: number,
  h: number,
  interior: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  borderStrength: number,
  hasTextCluster: boolean
): boolean {
  const area = w * h;

  // 1. Check for extreme size anomalies (leaking to whole page / strip)
  const isTallStrip = imageHeight > imageWidth * 2.5;
  const areaCap = isTallStrip
    ? Math.min(imageWidth * imageHeight * 0.45, imageWidth * imageWidth * 2.8)
    : imageWidth * imageHeight * 0.45;
  if (area > areaCap) {
    return false;
  }

  // 2. Check for extreme aspect ratio (likely a leak into long panels)
  const ratio = Math.max(w, 1) / Math.max(h, 1);
  if (ratio > 8 || ratio < 1 / 8) {
    return false;
  }

  // 3. Density Audit: Check if the shape is solid or a thin, leaked thread
  let filled = 0;
  for (let cy = y; cy < y + h; cy++) {
    const rowBase = cy * imageWidth;
    for (let cx = x; cx < x + w; cx++) {
      if (interior[rowBase + cx] === 1) filled++;
    }
  }
  const density = filled / Math.max(1, area);
  if (density < 0.22) {
    return false;
  }

  // 4. Boundary strength Audit (kept permissive enough for borderless
  // manhwa bubbles that are only separated by a soft drop shadow)
  if (hasTextCluster && borderStrength < 15) {
    return false;
  }

  return true;
}

function generateRoundedRectContour(x: number, y: number, w: number, h: number, r: number): number[] {
  const points: number[] = [];
  const steps = 4;
  const corners = [
    { cx: x + w - r, cy: y + r, start: -Math.PI / 2, end: 0 },
    { cx: x + w - r, cy: y + h - r, start: 0, end: Math.PI / 2 },
    { cx: x + r, cy: y + h - r, start: Math.PI / 2, end: Math.PI },
    { cx: x + r, cy: y + r, start: Math.PI, end: (3 * Math.PI) / 2 }
  ];
  for (const c of corners) {
    for (let i = 0; i <= steps; i++) {
      const angle = c.start + (c.end - c.start) * (i / steps);
      points.push(Math.round(c.cx + r * Math.cos(angle)), Math.round(c.cy + r * Math.sin(angle)));
    }
  }
  return points;
}

/**
 * SFX Detector: builds an organic outline hugging stylized lettering drawn
 * directly on the artwork (no enclosing bubble to flood fill).
 *
 * Pipeline:
 *  1. K-means (K=2) split of the click neighborhood → stroke color vs local bg.
 *  2. Color-similarity stroke mask over a scale-aware region of interest.
 *  3. Connected-component labeling + size-compatible agglomeration so the
 *     separate glyphs of one SFX word merge while distant art stays out.
 *  4. Outline-layer absorption (≤ 2 layers): manhwa SFX often carry white or
 *     colored rims — detected via k-means over the mask's 2px shell vs the
 *     page background estimated on the ROI perimeter.
 *  5. Chebyshev distance-transform padding joins glyphs into one patch, then
 *     Moore tracing + Chaikin smoothing produce the final organic contour.
 */
export function detectSfxDetailed(
  imageData: ImageData,
  startX: number,
  startY: number,
  regionWidth?: number,
  regionHeight?: number
): DetailedBubbleResult | null {
  const { width, height, data } = imageData;
  if (width === 0 || height === 0) return null;

  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return null;

  const idxOf = (x: number, y: number) => (y * width + x) * 4;
  if (data[idxOf(sx, sy) + 3] < 64) return null;

  const unit = scaleUnit(width, height);
  const isTallStrip = height > width * 2.5;

  // --- 1. Stroke vs background split around the click
  const collectPatch = (radius: number): RGB[] => {
    const samples: RGB[] = [];
    const x0 = Math.max(0, sx - radius), x1 = Math.min(width - 1, sx + radius);
    const y0 = Math.max(0, sy - radius), y1 = Math.min(height - 1, sy + radius);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const idx = idxOf(x, y);
        if (data[idx + 3] < 64) continue;
        samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
      }
    }
    return samples;
  };

  let split = localKMeans2D(collectPatch(Math.round(14 * unit)));
  let separation = redmeanDistance(split.c1[0], split.c1[1], split.c1[2], split.c2[0], split.c2[1], split.c2[2]);
  if (separation < 42) {
    split = localKMeans2D(collectPatch(Math.round(30 * unit)));
    separation = redmeanDistance(split.c1[0], split.c1[1], split.c1[2], split.c2[0], split.c2[1], split.c2[2]);
  }
  if (separation < 42) return null; // no lettering contrast at this point

  const clickR = data[idxOf(sx, sy)], clickG = data[idxOf(sx, sy) + 1], clickB = data[idxOf(sx, sy) + 2];
  const d1 = redmeanDistance(clickR, clickG, clickB, split.c1[0], split.c1[1], split.c1[2]);
  const d2 = redmeanDistance(clickR, clickG, clickB, split.c2[0], split.c2[1], split.c2[2]);

  // The click decides the stroke color. When neither centroid matches the
  // clicked pixel (busy art contaminates K=2 centroids), trust the pixel
  // itself — the user pointed straight at the lettering.
  const asRGB = (c: number[]): RGB => ({ r: c[0], g: c[1], b: c[2] });
  let stroke: RGB;
  const patchBg: RGB = d1 >= d2 ? asRGB(split.c1) : asRGB(split.c2);
  if (Math.min(d1, d2) <= 48) {
    stroke = d1 <= d2 ? asRGB(split.c1) : asRGB(split.c2);
  } else {
    stroke = { r: clickR, g: clickG, b: clickB };
  }

  // --- 2. Scale-aware region of interest
  const extCap = Math.round(720 * unit);
  const extentCapY = isTallStrip ? Math.round(width * 1.2) : height;
  const extX = Math.min(
    extCap,
    Math.min(width, regionWidth ? Math.max(160, Math.round(regionWidth * 1.6)) : Math.round(width * 0.45))
  );
  const extY = Math.min(
    extCap,
    Math.min(extentCapY, regionHeight ? Math.max(160, Math.round(regionHeight * 1.6)) : Math.round((isTallStrip ? width : height) * 0.45))
  );
  const minX = Math.max(0, sx - extX);
  const maxX = Math.min(width - 1, sx + extX);
  const minY = Math.max(0, sy - extY);
  const maxY = Math.min(height - 1, sy + extY);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w < 12 || h < 12) return null;

  // --- Page background estimate from the ROI perimeter (used for rim tests)
  const perimeterSamples: RGB[] = [];
  for (let x = minX; x <= maxX; x += 3) {
    for (const y of [minY, maxY]) {
      const idx = idxOf(x, y);
      if (data[idx + 3] >= 64) perimeterSamples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }
  }
  for (let y = minY; y <= maxY; y += 3) {
    for (const x of [minX, maxX]) {
      const idx = idxOf(x, y);
      if (data[idx + 3] >= 64) perimeterSamples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }
  }
  let pageBg = patchBg;
  if (perimeterSamples.length >= 40) {
    const bgSplit = localKMeans2D(perimeterSamples);
    pageBg = bgSplit.n1 >= bgSplit.n2 ? asRGB(bgSplit.c1) : asRGB(bgSplit.c2);
  }

  // --- 3. Stroke mask + components
  const strokeTol = clamp(separation * 0.42, 30, 62);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const imgY = minY + y;
    for (let x = 0; x < w; x++) {
      const idx = idxOf(minX + x, imgY);
      if (data[idx + 3] < 64) continue;
      if (redmeanDistance(data[idx], data[idx + 1], data[idx + 2], stroke.r, stroke.g, stroke.b) <= strokeTol) {
        mask[y * w + x] = 1;
      }
    }
  }

  const { labels, comps } = labelComponents(mask, w, h);
  if (comps.length === 0) return null;

  let snappedX = sx - minX;
  let snappedY = sy - minY;
  let seedCompId = labels[snappedY * w + snappedX];
  if (seedCompId < 0) {
    // Click was just off the lettering — snap to the nearest stroke pixel
    const snapR = Math.round(26 * unit);
    let bestD = Infinity;
    const y0 = Math.max(0, snappedY - snapR), y1 = Math.min(h - 1, snappedY + snapR);
    const x0 = Math.max(0, snappedX - snapR), x1 = Math.min(w - 1, snappedX + snapR);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (labels[y * w + x] >= 0) {
          const dd = (x - (sx - minX)) ** 2 + (y - (sy - minY)) ** 2;
          if (dd < bestD) {
            bestD = dd;
            seedCompId = labels[y * w + x];
            snappedX = x;
            snappedY = y;
          }
        }
      }
    }
    if (seedCompId < 0) return null;
  }

  const seedComp = comps[seedCompId];

  // Field rejection: a "stroke" component filling most of the ROI is a color
  // field (bubble fill, page background, flat art), not lettering.
  const seedW = seedComp.maxX - seedComp.minX + 1;
  const seedH = seedComp.maxY - seedComp.minY + 1;
  if (seedW >= w * 0.72 && seedH >= h * 0.72) return null;
  if (seedComp.count > w * h * 0.38) return null;

  const letterSize = clamp(Math.max(seedW, seedH), 8, 400);

  // --- Agglomerate size-compatible nearby glyph components
  const bridge = clamp(letterSize * 0.8, 12, Math.round(120 * unit));
  const merged = new Uint8Array(comps.length);
  merged[seedCompId] = 1;
  let clMinX = seedComp.minX, clMinY = seedComp.minY, clMaxX = seedComp.maxX, clMaxY = seedComp.maxY;
  let maxGapUsed = 0;
  let changed = true;

  while (changed) {
    changed = false;
    // Stop expanding once the cluster spans nearly the whole ROI (leak guard)
    if (clMaxX - clMinX + 1 >= w * 0.9 && clMaxY - clMinY + 1 >= h * 0.9) break;

    const clusterArea = (clMaxX - clMinX + 1) * (clMaxY - clMinY + 1);
    for (let c = 0; c < comps.length; c++) {
      if (merged[c]) continue;
      const comp = comps[c];
      if (comp.count < 6) continue;
      const cDim = Math.max(comp.maxX - comp.minX + 1, comp.maxY - comp.minY + 1);
      if (cDim > letterSize * 5) continue; // giant same-color art region
      // Glyphs of one SFX word are size-compatible; a component dwarfing the
      // cluster is a background field (page margin, panel fill) — skip it.
      const compArea = (comp.maxX - comp.minX + 1) * (comp.maxY - comp.minY + 1);
      if (compArea > clusterArea * 6) continue;

      const gap = rectGap(clMinX, clMinY, clMaxX, clMaxY, comp.minX, comp.minY, comp.maxX, comp.maxY);
      if (gap <= bridge) {
        merged[c] = 1;
        if (comp.minX < clMinX) clMinX = comp.minX;
        if (comp.minY < clMinY) clMinY = comp.minY;
        if (comp.maxX > clMaxX) clMaxX = comp.maxX;
        if (comp.maxY > clMaxY) clMaxY = comp.maxY;
        if (gap > maxGapUsed) maxGapUsed = gap;
        changed = true;
      }
    }
  }

  const letterMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const l = labels[i];
    if (l >= 0 && merged[l]) letterMask[i] = 1;
  }

  // --- 4. Absorb outline/rim layers (e.g. colored letters + white rim + dark glow)
  let currentLayer = stroke;
  for (let layer = 0; layer < 2; layer++) {
    const dt = chebyshevDT(letterMask, w, h);
    const shellSamples: RGB[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dv = dt[y * w + x];
        if (dv >= 1 && dv <= 2) {
          const idx = idxOf(minX + x, minY + y);
          if (data[idx + 3] >= 64) shellSamples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
        }
      }
    }
    if (shellSamples.length < 24) break;

    const shellSplit = localKMeans2D(shellSamples);
    const domIsC1 = shellSplit.n1 >= shellSplit.n2;
    const dominant = domIsC1 ? asRGB(shellSplit.c1) : asRGB(shellSplit.c2);
    const domFrac = (domIsC1 ? shellSplit.n1 : shellSplit.n2) / shellSamples.length;

    if (domFrac < 0.55) break;
    if (redmeanDistance(dominant.r, dominant.g, dominant.b, pageBg.r, pageBg.g, pageBg.b) < 42) break; // shell is already page bg
    if (redmeanDistance(dominant.r, dominant.g, dominant.b, currentLayer.r, currentLayer.g, currentLayer.b) < 30) break; // just anti-aliasing

    const oTol = clamp(separation * 0.35, 26, 55);
    const maxSteps = Math.round(clamp(letterSize * 0.2, 2, 14));

    // Ring-by-ring frontier growth limited to the rim's physical thickness
    let frontier: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (dt[y * w + x] === 1) frontier.push(y * w + x);
      }
    }

    let absorbedTotal = 0;
    for (let step = 0; step < maxSteps && frontier.length > 0; step++) {
      const next: number[] = [];
      for (const fi of frontier) {
        const fx = fi % w;
        const fy = (fi - fx) / w;
        if (letterMask[fi]) continue;
        const idx = idxOf(minX + fx, minY + fy);
        if (data[idx + 3] < 64) continue;
        if (redmeanDistance(data[idx], data[idx + 1], data[idx + 2], dominant.r, dominant.g, dominant.b) > oTol) continue;

        letterMask[fi] = 1;
        absorbedTotal++;
        const y0 = Math.max(0, fy - 1), y1 = Math.min(h - 1, fy + 1);
        const x0 = Math.max(0, fx - 1), x1 = Math.min(w - 1, fx + 1);
        for (let ny = y0; ny <= y1; ny++) {
          for (let nx = x0; nx <= x1; nx++) {
            const ni = ny * w + nx;
            if (!letterMask[ni]) next.push(ni);
          }
        }
      }
      frontier = next;
    }

    if (absorbedTotal < 10) break;
    currentLayer = dominant;
  }

  // --- 5. Pad & join glyphs into one organic patch
  const pad = Math.round(clamp(letterSize * 0.14, 3, 16));
  const joinPad = Math.min(60, Math.max(pad, Math.ceil(maxGapUsed / 2) + 1));
  const dt2 = chebyshevDT(letterMask, w, h);
  const padded = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (dt2[i] <= joinPad) padded[i] = 1;
  }

  const paddedLabels = labelComponents(padded, w, h);
  const keepId = paddedLabels.labels[snappedY * w + snappedX];
  if (keepId < 0) return null;
  const finalComp = paddedLabels.comps[keepId];
  const finalMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    finalMask[i] = paddedLabels.labels[i] === keepId ? 1 : 0;
  }

  // --- Audit
  const bw = finalComp.maxX - finalComp.minX + 1;
  const bh = finalComp.maxY - finalComp.minY + 1;
  if (finalComp.count < 40) return null;
  if (bw < 10 || bh < 10) return null;
  if (bw >= w * 0.96 && bh >= h * 0.96) return null; // flooded the whole ROI
  if (finalComp.count > w * h * 0.6) return null;    // covers most of the ROI: a field, not lettering
  const aspect = Math.max(bw, bh) / Math.min(bw, bh);
  if (aspect > 9) return null;
  if (finalComp.count / (bw * bh) < 0.15) return null;

  // --- Contour on full-image coordinates
  const full = new Uint8Array(width * height);
  for (let y = 0; y < bh; y++) {
    const srcRow = (finalComp.minY + y) * w;
    const dstRow = (minY + finalComp.minY + y) * width + minX;
    for (let x = 0; x < bw; x++) {
      if (finalMask[srcRow + finalComp.minX + x]) full[dstRow + finalComp.minX + x] = 1;
    }
  }

  const rawContour = traceContour(full, width, height, minX + snappedX, minY + snappedY);
  let contour: number[];
  if (rawContour.length >= 8) {
    contour = simplifyContour(rawContour, 140);
    contour = chaikinSmooth(contour, 1);
    contour = simplifyContour(contour, 200);
  } else {
    const r = Math.max(4, Math.min(18, Math.round(Math.min(bw, bh) * 0.2)));
    contour = generateRoundedRectContour(minX + finalComp.minX, minY + finalComp.minY, bw, bh, r);
  }

  // --- Safe text bounds: replacement lettering goes over the whole patch, so
  // the bbox (slightly shrunk) is the right target — an inscribed rectangle of
  // a glyph-shaped mask would be an arbitrarily thin sliver.
  const absMinX = minX + finalComp.minX;
  const absMinY = minY + finalComp.minY;
  const safeW = bw * 0.88;
  const safeH = bh * 0.88;
  const safeX = absMinX + (bw - safeW) / 2;
  const safeY = absMinY + (bh - safeH) / 2;

  return {
    x: absMinX,
    y: absMinY,
    width: bw - 1,
    height: bh - 1,
    contour,
    safeTextBounds: { x: safeX, y: safeY, width: safeW, height: safeH }
  };
}

export function floodFillBubbleDetailed(
  imageData: ImageData,
  startX: number,
  startY: number,
  regionWidth?: number,
  regionHeight?: number,
  avoidPoints?: { x: number; y: number }[]
): DetailedBubbleResult | null {
  const { width, height, data } = imageData;
  if (width === 0 || height === 0) return null;

  startX = Math.round(startX);
  startY = Math.round(startY);
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return null;
  }

  const unit = scaleUnit(width, height);
  const isTallStrip = height > width * 2.5;
  // Remember the raw click before seed stabilization: SFX fallback anchors here.
  const clickX = startX;
  const clickY = startY;

  const clampX = (x: number) => Math.min(width - 1, Math.max(0, x));
  const clampY = (y: number) => Math.min(height - 1, Math.max(0, y));

  // 1. Initial text cluster extraction near seed click
  const textCluster = extractTextCluster(data, width, height, startX, startY, unit);

  const patchStats = (cx: number, cy: number, radius: number) => {
    const x0 = clampX(cx - radius), x1 = clampX(cx + radius);
    const y0 = clampY(cy - radius), y1 = clampY(cy + radius);
    let sr = 0, sg = 0, sb = 0, count = 0;
    const samples: number[] = [];
    for (let y = y0; y <= y1; y++) {
      const rowBase = y * width;
      for (let x = x0; x <= x1; x++) {
        const idx = (rowBase + x) * 4;
        if (data[idx + 3] < 64) continue;
        sr += data[idx]; sg += data[idx + 1]; sb += data[idx + 2];
        samples.push(data[idx], data[idx + 1], data[idx + 2]);
        count++;
      }
    }
    if (count === 0) return { spread: 0 };
    const mr = sr / count, mg = sg / count, mb = sb / count;
    let varSum = 0;
    for (let i = 0; i < samples.length; i += 3) {
      const dr = samples[i] - mr, dg = samples[i + 1] - mg, db = samples[i + 2] - mb;
      varSum += dr * dr + dg * dg + db * db;
    }
    return { spread: Math.sqrt(varSum / (count * 3)) };
  };

  const referenceMatchFraction = (cx: number, cy: number, radius: number, refR: number, refG: number, refB: number) => {
    const x0 = clampX(cx - radius), x1 = clampX(cx + radius);
    const y0 = clampY(cy - radius), y1 = clampY(cy + radius);
    let match = 0, total = 0;
    for (let y = y0; y <= y1; y++) {
      const rowBase = y * width;
      for (let x = x0; x <= x1; x++) {
        const sIdx = (rowBase + x) * 4;
        if (data[sIdx + 3] < 64) continue;
        total++;
        if (redmeanDistance(data[sIdx], data[sIdx + 1], data[sIdx + 2], refR, refG, refB) <= 40) match++;
      }
    }
    return total === 0 ? 1 : match / total;
  };

  const majorityMatchFraction = (cx: number, cy: number, radius: number) => {
    const idx = (cy * width + cx) * 4;
    return referenceMatchFraction(cx, cy, radius, data[idx], data[idx + 1], data[idx + 2]);
  };

  const isStableSeed = (px: number, py: number) => {
    const idx = (py * width + px) * 4;
    if (data[idx + 3] < 64) return true;
    return majorityMatchFraction(px, py, 3) >= 0.6 && majorityMatchFraction(px, py, 6) >= 0.55;
  };

  // A click landing on a calm color patch means the user aimed at a bubble
  // interior; only clicks on high-frequency lettering may fall back to the
  // SFX outline detector (otherwise it would trace the bubble fill itself).
  const clickOnLettering = !isStableSeed(clickX, clickY);

  // Auto search neighborhood for stable flood seed (scale-aware for large fonts)
  if (!isStableSeed(startX, startY)) {
    let found = false;
    const seedSearch = Math.round(40 * unit);
    for (let r = 1; r < seedSearch && !found; r++) {
      const step = Math.max(1, Math.floor(r / 2));
      for (let dy = -r; dy <= r && !found; dy += step) {
        for (let dx = -r; dx <= r && !found; dx += step) {
          const nx = startX + dx, ny = startY + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (isStableSeed(nx, ny)) {
            startX = nx;
            startY = ny;
            found = true;
          }
        }
      }
    }
    if (!found) {
      // No calm patch anywhere near the click: this is lettering painted on
      // raw artwork (SFX / floating manhwa text), not a fillable bubble.
      if (clickOnLettering) {
        const sfx = detectSfxDetailed(imageData, clickX, clickY, regionWidth, regionHeight);
        if (sfx) return sfx;
      }
      if (textCluster) return triggerTextOnlyFallback(textCluster, width, height);
      return null;
    }
  }

  const seedIdx = (startY * width + startX) * 4;
  const rawSeedAlpha = data[seedIdx + 3];
  const seedIsTransparent = rawSeedAlpha < 64;
  const seedColor = { r: data[seedIdx], g: data[seedIdx + 1], b: data[seedIdx + 2] };
  const { spread } = patchStats(startX, startY, 4);

  // Flood extents: on webtoon strips the page height is meaningless, so cap
  // vertical growth in page-width units instead.
  const extentCapY = isTallStrip ? Math.round(width * 1.5) : height;
  const maxExtentX = Math.min(width, regionWidth ? Math.max(180, Math.round(regionWidth * 2.4)) : Math.round(width * 0.32));
  const maxExtentY = Math.min(
    extentCapY,
    regionHeight ? Math.max(180, Math.round(regionHeight * 2.4)) : Math.round(isTallStrip ? width * 0.6 : height * 0.32)
  );
  const maxIterations = Math.min(420000, Math.max(35000, maxExtentX * maxExtentY * 2));

  // AI Concept: Train our tiny neural classifier before starting the flood fill!
  const perceptron = new LocalPerceptronClassifier();
  const positives: RGB[] = [];
  const negatives: RGB[] = [];

  // Positives: Safe samples very close to the stable seed
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = clampX(startX + dx);
      const ny = clampY(startY + dy);
      const idx = (ny * width + nx) * 4;
      if (data[idx + 3] >= 64) {
        positives.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
      }
    }
  }

  // Ray-probed samples: positives from inside the detected border, negatives
  // from the border ink and beyond — adapts to any bubble size.
  if (!seedIsTransparent) {
    const rayResult = probeRays(data, width, height, startX, startY, maxExtentX, maxExtentY, seedColor.r, seedColor.g, seedColor.b);
    positives.push(...rayResult.positives);
    negatives.push(...rayResult.negatives);
  }

  // Only trust the classifier when the training set is grounded on real borders
  const neuralReliable = positives.length >= 12 && negatives.length >= 10;
  if (neuralReliable) {
    perceptron.train(positives, negatives, 30);
  }

  const lumAt = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    return getLuminance(data[idx], data[idx + 1], data[idx + 2]);
  };
  const gradientAt = (x: number, y: number) => {
    const l = lumAt(x, y);
    let g = 0;
    if (x + 1 < width) g = Math.max(g, Math.abs(l - lumAt(x + 1, y)));
    if (x > 0) g = Math.max(g, Math.abs(l - lumAt(x - 1, y)));
    if (y + 1 < height) g = Math.max(g, Math.abs(l - lumAt(x, y + 1)));
    if (y > 0) g = Math.max(g, Math.abs(l - lumAt(x, y - 1)));
    return g;
  };
  const STRONG_EDGE = 50; // luminance step of inked borders / hard shadows
  const SOFT_EDGE = 17;   // below this the surface reads as a smooth gradient

  // Self-recovery tiers: start gradient-tolerant (manhwa gradient fills), then
  // degrade to increasingly strict color matching if the audit rejects the mask.
  const toleranceTiers = [
    { mul: 1.0, gradientCross: true },
    { mul: 1.0, gradientCross: false },
    { mul: 0.7, gradientCross: false },
    { mul: 0.45, gradientCross: false },
  ];
  let finalDetailedResult: DetailedBubbleResult | null = null;

  for (let tier = 0; tier < toleranceTiers.length; tier++) {
    const tierCfg = toleranceTiers[tier];
    const tolerance = Math.min(95, Math.max(30, spread * 2.2 + 22)) * tierCfg.mul;
    const stepTolerance = Math.max(16, tolerance * 0.4);

    const isFillable = (px: number, py: number, parentR: number, parentG: number, parentB: number) => {
      const idx = (py * width + px) * 4;
      const a = data[idx + 3];
      if (a < 64) return true;
      if (seedIsTransparent) return false;

      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const dSeed = redmeanDistance(r, g, b, seedColor.r, seedColor.g, seedColor.b);

      // Edge barrier: never step onto a strong ink/shadow edge unless the pixel
      // still clearly reads as the bubble fill. This stops the classic leak
      // through anti-aliased mid-tone border pixels.
      const grad = gradientAt(px, py);
      if (grad >= STRONG_EDGE && dSeed > tolerance * 0.55) return false;

      // Feature 1: Neural Classification Prediction (Probability of belonging to bubble)
      if (neuralReliable) {
        const bubbleProbability = perceptron.predict(r, g, b);
        if (bubbleProbability > 0.9) return true; // High model confidence overrides static formulas!
        if (bubbleProbability < 0.1) return false; // High confidence background rejection
      }

      // Feature 2: perceptual color metrics
      if (dSeed <= tolerance) return true;
      if (redmeanDistance(r, g, b, parentR, parentG, parentB) <= stepTolerance) {
        // Smooth continuation across gentle ramps (gradient-filled manhwa
        // bubbles). Unconditional parent-drift is what used to leak through
        // soft-shaded art, so it is edge-gated and tier-gated now.
        if (tierCfg.gradientCross && grad <= SOFT_EDGE) return true;
        if (dSeed <= tolerance * 1.35) return true;
      }

      return referenceMatchFraction(px, py, 2, seedColor.r, seedColor.g, seedColor.b) >= 0.7
          && referenceMatchFraction(px, py, 5, seedColor.r, seedColor.g, seedColor.b) >= 0.62;
    };

    // Initialize list of avoid points (starts with user supplied points)
    let dynamicAvoidPoints = [...(avoidPoints ?? [])];

    let floodPass = 0;
    const maxFloodPasses = 2; // Pass 1: Test and discover overlaps, Pass 2: Re-run split

    let visited = new Uint8Array(width * height);
    let interior = new Uint8Array(width * height);
    let minX = startX, maxX = startX, minY = startY, maxY = startY;

    while (floodPass < maxFloodPasses) {
      visited = new Uint8Array(width * height);
      interior = new Uint8Array(width * height);
      const queueX: number[] = [startX];
      const queueY: number[] = [startY];
      let qHead = 0;
      visited[startY * width + startX] = 1;
      interior[startY * width + startX] = 1;

      minX = startX; maxX = startX; minY = startY; maxY = startY;
      let interiorCount = 1;
      let iterations = 0;

      // Filter and compute Voronoi bisectors on avoid seeds
      const activeAvoids = dynamicAvoidPoints.filter(p => {
        const adx = p.x - startX, ady = p.y - startY;
        return (adx !== 0 || ady !== 0) && Math.abs(adx) <= maxExtentX * 1.5 && Math.abs(ady) <= maxExtentY * 1.5;
      });

      const isAvoided = (px: number, py: number) => {
        if (activeAvoids.length === 0) return false;
        const mdx = px - startX, mdy = py - startY;
        const ownDistSq = mdx * mdx + mdy * mdy;
        for (let i = 0; i < activeAvoids.length; i++) {
          const p = activeAvoids[i];
          const ddx = px - p.x, ddy = py - p.y;
          if (ddx * ddx + ddy * ddy < ownDistSq) return true;
        }
        return false;
      };

      while (qHead < queueX.length && iterations < maxIterations) {
        const cx = queueX[qHead];
        const cy = queueY[qHead];
        qHead++;
        iterations++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const parentIdx = (cy * width + cx) * 4;
        const parentR = data[parentIdx], parentG = data[parentIdx + 1], parentB = data[parentIdx + 2];

        const nxs = [cx + 1, cx - 1, cx, cx];
        const nys = [cy, cy, cy + 1, cy - 1];

        for (let i = 0; i < 4; i++) {
          const nx = nxs[i], ny = nys[i];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (Math.abs(nx - startX) > maxExtentX || Math.abs(ny - startY) > maxExtentY) continue;

          const idx1D = ny * width + nx;
          if (visited[idx1D]) continue;
          if (activeAvoids.length > 0 && isAvoided(nx, ny)) continue;
          visited[idx1D] = 1;

          if (isFillable(nx, ny, parentR, parentG, parentB)) {
            interior[idx1D] = 1;
            interiorCount++;
            queueX.push(nx);
            queueY.push(ny);
          }
        }
      }

      if (interiorCount < 15) {
        break;
      }

      // MULTI-BUBBLE OVERLAP DETECTION: Discover all text clusters in the current interior mask
      const foundTextClusters = discoverTextClustersInMask(data, width, height, interior, minX, minY, maxX, maxY, unit);

      // If we find multiple text clusters, it means we have fused overlapping bubbles!
      if (foundTextClusters.length >= 2 && floodPass === 0) {
        // Find our target text cluster closest to the click coordinate (startX, startY)
        let targetClusterIdx = -1;
        let minClusterDistSq = Infinity;
        for (let c = 0; c < foundTextClusters.length; c++) {
          const tc = foundTextClusters[c];
          const ddx = tc.centerX - startX;
          const ddy = tc.centerY - startY;
          const distSq = ddx * ddx + ddy * ddy;
          if (distSq < minClusterDistSq) {
            minClusterDistSq = distSq;
            targetClusterIdx = c;
          }
        }

        if (targetClusterIdx !== -1) {
          // Identify all other clusters as adjacent sibling bubbles, collect centroids as avoid blockers
          let addedAvoids = 0;
          for (let c = 0; c < foundTextClusters.length; c++) {
            if (c === targetClusterIdx) continue;
            dynamicAvoidPoints.push({
              x: foundTextClusters[c].centerX,
              y: foundTextClusters[c].centerY
            });
            addedAvoids++;
          }

          if (addedAvoids > 0) {
            // Re-run the flood fill with the new dynamic constraints to slice the overlapping bubbles perfectly
            floodPass++;
            continue;
          }
        }
      }

      break; // Proceed with evaluating current pass results
    }

    // Edge leakage pre-audit check
    const touchesLeft = minX <= 1;
    const touchesRight = maxX >= width - 2;
    const touchesTop = minY <= 1;
    const touchesBottom = maxY >= height - 2;
    const edgeTouches = [touchesLeft, touchesRight, touchesTop, touchesBottom].filter(Boolean).length;
    const requiredForReject = regionWidth && regionHeight ? 3 : 4;

    if (edgeTouches >= requiredForReject) {
      continue; // Trigger retry on next tighter tolerance tier
    }

    const rawContour = traceContour(visited, width, height, startX, startY);
    const borderStrength = evaluateBoundaryStrength(data, width, height, visited, interior, rawContour);

    // Self-Audit Check
    const isValid = auditResult(
      minX,
      minY,
      maxX - minX + 1,
      maxY - minY + 1,
      interior,
      width,
      height,
      borderStrength,
      textCluster !== null
    );

    if (!isValid) {
      continue; // Fail audit: attempt next tighter tolerance tier
    }

    // Simplify traced contour
    const initialContour = simplifyContour(rawContour);
    // AI Enhancement: Apply Active Contour Model (Snakes) energy optimization
    const contourPoints = optimizeContourSnakes(initialContour, imageData);

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const localMask = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      const srcRow = (minY + y) * width + minX;
      const dstRow = y * bw;
      for (let x = 0; x < bw; x++) {
        localMask[dstRow + x] = interior[srcRow + x];
      }
    }

    const closingRadius = Math.max(1, Math.min(Math.round(4 * unit), Math.round(Math.min(bw, bh) * 0.03)));
    const closedMask = closeMask(localMask, bw, bh, closingRadius);
    const rect = maximalInscribedRect(closedMask, bw, bh) || maximalInscribedRect(localMask, bw, bh);

    let safeX: number, safeY: number, safeW: number, safeH: number;
    if (rect) {
      const shrink = 0.93;
      const cx = minX + rect.x + rect.w / 2;
      const cy = minY + rect.y + rect.h / 2;
      safeW = rect.w * shrink;
      safeH = rect.h * shrink;
      safeX = cx - safeW / 2;
      safeY = cy - safeH / 2;
    } else {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      safeW = (maxX - minX) * 0.5;
      safeH = (maxY - minY) * 0.5;
      safeX = cx - safeW / 2;
      safeY = cy - safeH / 2;
    }

    finalDetailedResult = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      contour: contourPoints,
      safeTextBounds: {
        x: safeX,
        y: safeY,
        width: safeW,
        height: safeH
      }
    };
    break; // Break loop as we successfully got a valid audited bubble
  }

  // If every tolerance tier failed the self-audit, this is probably lettering
  // without a fillable shape (borderless caption, floating text, SFX): build an
  // organic outline around the lettering itself before falling back to a box.
  if (!finalDetailedResult) {
    if (clickOnLettering) {
      const sfx = detectSfxDetailed(imageData, clickX, clickY, regionWidth, regionHeight);
      if (sfx) return sfx;
    }
    if (textCluster) return triggerTextOnlyFallback(textCluster, width, height);
  }

  return finalDetailedResult;
}

/**
 * Fallback Mode: Constructs an aesthetic, rounded rectangular boundary fitted
 * precisely around the text cluster, keeping manga panels safe from leaks.
 */
function triggerTextOnlyFallback(
  cluster: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): DetailedBubbleResult {
  const padX = Math.round(cluster.width * 0.15 + 12);
  const padY = Math.round(cluster.height * 0.12 + 8);

  const safeX = Math.max(0, cluster.x - padX);
  const safeY = Math.max(0, cluster.y - padY);
  const safeW = Math.min(imageWidth - safeX, cluster.width + padX * 2);
  const safeH = Math.min(imageHeight - safeY, cluster.height + padY * 2);

  const r = Math.max(4, Math.min(18, Math.round(Math.min(safeW, safeH) * 0.2)));
  const synthContour = generateRoundedRectContour(safeX, safeY, safeW, safeH, r);

  return {
    x: safeX,
    y: safeY,
    width: safeW,
    height: safeH,
    contour: synthContour,
    safeTextBounds: {
      x: safeX + 3,
      y: safeY + 3,
      width: safeW - 6,
      height: safeH - 6
    }
  };
}
