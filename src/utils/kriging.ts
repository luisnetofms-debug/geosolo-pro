import { SoilLabResults } from '../types';

// Convert Lat/Lng to local meters relative to a reference coordinate
export function latLngToMeters(
  lat: number,
  lng: number,
  refLat: number,
  refLng: number
): { x: number; y: number } {
  const latRad = (refLat * Math.PI) / 180;
  // Approximations of meters per degree
  const metersPerLong = 111320 * Math.cos(latRad);
  const metersPerLat = 110574;

  const x = (lng - refLng) * metersPerLong;
  const y = (lat - refLat) * metersPerLat;
  return { x, y };
}

// Calculates geographic polygon area using Gauss/Shoelace plane projection algorithm
export function calculatePolygonArea(points: { lat: number; lng: number }[]): number {
  if (!points || points.length < 3) return 0;

  // Filter out duplicate or extremely close consecutive coordinates
  const uniquePoints: { lat: number; lng: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    if (uniquePoints.length === 0) {
      uniquePoints.push(current);
    } else {
      const prev = uniquePoints[uniquePoints.length - 1];
      const distLat = Math.abs(current.lat - prev.lat);
      const distLng = Math.abs(current.lng - prev.lng);
      if (distLat > 1e-9 || distLng > 1e-9) {
        uniquePoints.push(current);
      }
    }
  }

  // If start point matches end point (closed loop), remove redundant end point for calculation
  if (uniquePoints.length > 2) {
    const first = uniquePoints[0];
    const last = uniquePoints[uniquePoints.length - 1];
    if (Math.abs(first.lat - last.lat) < 1e-9 && Math.abs(first.lng - last.lng) < 1e-9) {
      uniquePoints.pop();
    }
  }

  if (uniquePoints.length < 3) return 0;

  // Anchor geographic coordinate system at the first point for flat plane translation
  const ref = uniquePoints[0];
  const xyPoints = uniquePoints.map(p => latLngToMeters(p.lat, p.lng, ref.lat, ref.lng));

  let areaSum = 0;
  const n = xyPoints.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    areaSum += xyPoints[i].x * xyPoints[j].y;
    areaSum -= xyPoints[j].x * xyPoints[i].y;
  }

  return Math.abs(areaSum) / 2; // Real area in square meters
}

// Convert local meters back to Lat/Lng
export function metersToLatLng(
  x: number,
  y: number,
  refLat: number,
  refLng: number
): { lat: number; lng: number } {
  const latRad = (refLat * Math.PI) / 180;
  const metersPerLong = 111320 * Math.cos(latRad);
  const metersPerLat = 110574;

  const lng = refLng + x / metersPerLong;
  const lat = refLat + y / metersPerLat;
  return { lat, lng };
}

// Gaussian elimination with partial pivoting to solve A * w = B
function solveLinearSystem(A: number[][], B: number[]): number[] | null {
  const n = B.length;
  // Deep copy A and B
  const a = A.map((row) => [...row]);
  const b = [...B];

  for (let i = 0; i < n; i++) {
    // Search for maximum in this column
    let maxEl = Math.abs(a[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > maxEl) {
        maxEl = Math.abs(a[k][i]);
        maxRow = k;
      }
    }

    // Swap maximum row with current row
    const tempRow = a[maxRow];
    a[maxRow] = a[i];
    a[i] = tempRow;

    const tempB = b[maxRow];
    b[maxRow] = b[i];
    b[i] = tempB;

    // Check if matrix is singular
    if (Math.abs(a[i][i]) < 1e-12) {
      return null;
    }

    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const c = -a[k][i] / a[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          a[k][j] = 0;
        } else {
          a[k][j] += c * a[i][j];
        }
      }
      a[k][i] = 0; // Force exact zero for stability
      b[k] += c * b[i];
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += a[i][j] * x[j];
    }
    x[i] = (b[i] - sum) / a[i][i];
  }
  return x;
}

// Variogram functions
export function semivariogram(
  distance: number,
  model: 'spherical' | 'exponential' | 'gaussian',
  nugget: number,
  sill: number,
  range: number
): number {
  if (distance === 0) return 0;
  const h = distance;
  const c = sill - nugget; // Partial sill

  if (model === 'spherical') {
    if (h > range) return sill;
    const hoverR = h / range;
    return nugget + c * (1.5 * hoverR - 0.5 * Math.pow(hoverR, 3));
  } else if (model === 'exponential') {
    return nugget + c * (1 - Math.exp(-3 * (h / range)));
  } else {
    // Gaussian
    return nugget + c * (1 - Math.exp(-3 * Math.pow(h / range, 2)));
  }
}

export interface InterpolationPoint {
  x: number;
  y: number;
  value: number;
}

// IDW (Inverse Distance Weighting) as a fallback representation
export function interpolateIDW(
  targetX: number,
  targetY: number,
  points: InterpolationPoint[],
  power: number = 2
): number {
  if (points.length === 0) return 0;
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const d = Math.hypot(targetX - pt.x, targetY - pt.y);
    if (d < 0.1) {
      return pt.value; // Exact match
    }
    const weight = 1 / Math.pow(d, power);
    numerator += weight * pt.value;
    denominator += weight;
  }

  return numerator / denominator;
}

// Ordinary Kriging Interpolation for a single coordinate (x, y)
export function krigingInterpolate(
  targetX: number,
  targetY: number,
  points: InterpolationPoint[],
  model: 'spherical' | 'exponential' | 'gaussian' = 'exponential',
  nugget: number = 0.1,
  sill: number = 1.0,
  range: number = 300
): number {
  const n = points.length;
  if (n === 0) return 0;
  if (n < 3) {
    // Not enough points for stable kriging; fall back to IDW
    return interpolateIDW(targetX, targetY, points, 2);
  }

  // 1. Build matrix A of size (n+1) x (n+1)
  const A: number[][] = [];
  for (let i = 0; i < n + 1; i++) {
    A[i] = new Array(n + 1).fill(0);
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        A[i][j] = 0; // Same point semi-variance is 0
      } else {
        const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        A[i][j] = semivariogram(d, model, nugget, sill, range);
      }
    }
    // Ordinary Kriging constraints: sum of weights = 1
    A[i][n] = 1;
    A[n][i] = 1;
  }
  A[n][n] = 0;

  // 2. Build vector B of size (n+1)
  const B: number[] = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(targetX - points[i].x, targetY - points[i].y);
    B[i] = semivariogram(d, model, nugget, sill, range);
  }
  B[n] = 1;

  // 3. Solve for weights w
  const w = solveLinearSystem(A, B);
  if (!w) {
    // Numerical singularity; fall back to IDW
    return interpolateIDW(targetX, targetY, points, 2);
  }

  // 4. Calculate final interpolated value
  let prediction = 0;
  for (let i = 0; i < n; i++) {
    prediction += w[i] * points[i].value;
  }

  // Clamp predictions to avoid silly mathematical bounces if any
  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = (maxVal - minVal) * 0.1; // allow slight extrapolation
  return Math.max(minVal - padding, Math.min(maxVal + padding, prediction));
}

// Generate an entire interpolated grid (bounding box in local coordinates)
export interface GridResult {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  cols: number;
  rows: number;
  data: number[][]; // 2D grid matrix of interpolated values
  weights?: number[][]; // Kriging variance (optional)
}

export function generateInterpolationGrid(
  points: InterpolationPoint[],
  cols: number = 80,
  rows: number = 80,
  model: 'spherical' | 'exponential' | 'gaussian' = 'exponential',
  nugget: number = 0.1,
  sill: number = 1.0,
  range: number = 300
): GridResult {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  // Add 10% outer padding to bounds to ensure complete boundary coverage
  const xMinVal = Math.min(...xs);
  const xMaxVal = Math.max(...xs);
  const yMinVal = Math.min(...ys);
  const yMaxVal = Math.max(...ys);

  const xPadding = Math.max((xMaxVal - xMinVal) * 0.15, 50);
  const yPadding = Math.max((yMaxVal - yMinVal) * 0.15, 50);

  const xMin = xMinVal - xPadding;
  const xMax = xMaxVal + xPadding;
  const yMin = yMinVal - yPadding;
  const yMax = yMaxVal + yPadding;

  const dx = (xMax - xMin) / (cols - 1);
  const dy = (yMax - yMin) / (rows - 1);

  const data: number[][] = [];
  for (let r = 0; r < rows; r++) {
    data[r] = [];
    const targetY = yMin + r * dy;
    for (let c = 0; c < cols; c++) {
      const targetX = xMin + c * dx;
      data[r][c] = krigingInterpolate(targetX, targetY, points, model, nugget, sill, range);
    }
  }

  return { xMin, xMax, yMin, yMax, cols, rows, data };
}

// Determine fertility coloration based on agronomic thresholds
export function getFertilityColor(
  value: number,
  variable: keyof SoilLabResults
): string {
  // Configs or thresholds
  // standard colors: Red (low) -> Yellow/Orange (medium) -> Dark Green/Blue (high)
  if (variable === 'pH') {
    if (value < 5.0) return 'rgba(239, 68, 68, 0.75)'; // Low pH (Very Acid)
    if (value < 6.0) return 'rgba(245, 158, 11, 0.75)'; // Medium (Ideal for some crops)
    return 'rgba(16, 185, 129, 0.75)'; // High/Excellent (Ideal crop)
  }
  if (variable === 'P') {
    if (value < 10) return 'rgba(239, 68, 68, 0.75)';
    if (value < 25) return 'rgba(245, 158, 11, 0.75)';
    return 'rgba(16, 185, 129, 0.75)';
  }
  if (variable === 'K') {
    if (value < 1.5) return 'rgba(239, 68, 68, 0.75)';
    if (value < 3.0) return 'rgba(245, 158, 11, 0.75)';
    return 'rgba(16, 185, 129, 0.75)';
  }
  if (variable === 'MO') {
    if (value < 1.5) return 'rgba(239, 68, 68, 0.75)';
    if (value < 3.0) return 'rgba(245, 158, 11, 0.75)';
    return 'rgba(16, 185, 129, 0.75)';
  }
  if (variable === 'Ca') {
    if (value < 20) return 'rgba(239, 68, 68, 0.75)';
    if (value < 40) return 'rgba(245, 158, 11, 0.75)';
    return 'rgba(16, 185, 129, 0.75)';
  }
  if (variable === 'Mg') {
    if (value < 5) return 'rgba(239, 68, 68, 0.75)';
    if (value < 12) return 'rgba(245, 158, 11, 0.75)';
    return 'rgba(16, 185, 129, 0.75)';
  }
  if (variable === 'Al' || variable === 'al') {
    // Alumínio is toxic, so HIGH is BAD (Red) and LOW is GOOD (Green)
    if (value > 5.0) return 'rgba(239, 68, 68, 0.75)'; // High is bad
    if (value > 2.0) return 'rgba(245, 158, 11, 0.75)';
    return 'rgba(16, 185, 129, 0.75)'; // Low is perfect
  }
  return 'rgba(16, 185, 129, 0.75)';
}
