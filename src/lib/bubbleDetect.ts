export function floodFillBubble(
  imageData: ImageData,
  startX: number,
  startY: number
): { x: number; y: number; width: number; height: number } | null {
  const { width, height, data } = imageData;
  
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return null;
  }

  // We are looking for "white" or "light" pixels
  const isLight = (idx: number) => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    if (a < 128) return true; // transparent is also considered part of the bubble
    // threshold for "light" pixel
    return (r > 200 && g > 200 && b > 200);
  };

  let startIdx = (startY * width + startX) * 4;
  if (!isLight(startIdx)) {
    // Attempt to find a light pixel near the start just in case it landed on text
    let found = false;
    for (let r = 1; r < 20; r++) {
       for (let i = -r; i <= r; i+=r) {
         for (let j = -r; j <= r; j+=r) {
           const nx = startX + i;
           const ny = startY + j;
           if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
             startIdx = (ny * width + nx) * 4;
             if (isLight(startIdx)) {
               startX = nx;
               startY = ny;
               found = true;
               break;
             }
           }
         }
         if (found) break;
       }
       if (found) break;
    }
    if (!found) return null; // failed to find a bubble
  }

  const visited = new Uint8Array(width * height);
  const queue: [number, number][] = [[startX, startY]];
  visited[startY * width + startX] = 1;

  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;

  let iterations = 0;
  const maxIterations = width * height; // safety limit

  while (queue.length > 0 && iterations < maxIterations) {
    const [cx, cy] = queue.shift()!;
    iterations++;

    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const idx1D = ny * width + nx;
      if (visited[idx1D]) continue;
      
      const pxIdx = idx1D * 4;
      if (isLight(pxIdx)) {
        visited[idx1D] = 1;
        queue.push([nx, ny]);
      } else {
        visited[idx1D] = 1; // marked as visited but don't add to queue (border)
      }
    }
  }

  // Add a little padding reduction
  return {
    x: minX + 5,
    y: minY + 5,
    width: Math.max(10, maxX - minX - 10),
    height: Math.max(10, maxY - minY - 10)
  };
}
