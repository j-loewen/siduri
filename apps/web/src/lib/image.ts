import { IMAGE_MAX_SIDE } from '@brew/shared';

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

const isSvg = (file: Blob) => file.type === 'image/svg+xml' || (file instanceof File && /\.svgz?$/i.test(file.name));

/**
 * Shrinks a picture to at most IMAGE_MAX_SIDE pixels on its longest side and encodes it as WebP
 * (JPEG where the browser can't write WebP). Phone photos come down from megabytes to ~50 kB;
 * the EXIF orientation is applied, other metadata (e.g. GPS position) is dropped.
 *
 * SVG files are drawn at IMAGE_MAX_SIDE and stored as a picture too: the server never stores SVG,
 * because an SVG is a document that can carry scripts.
 */
export async function resizeImage(file: Blob, maxSide = IMAGE_MAX_SIDE): Promise<Blob> {
  if (isSvg(file)) return encode(await drawSvg(file, maxSide));
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    return encode(draw(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale)));
  } finally {
    bitmap.close();
  }
}

function draw(source: CanvasImageSource, width: number, height: number, background?: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** WebP (keeps transparency), else JPEG on white. */
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await toBlob(canvas, 'image/webp', 0.85);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob(draw(canvas, canvas.width, canvas.height, '#fff'), 'image/jpeg', 0.88);
  if (!jpeg) throw new Error('Could not encode the picture');
  return jpeg;
}

/**
 * Draws an SVG at `maxSide` on its longest side (vectors scale up cleanly). Its size comes from the
 * viewBox or width/height; it is given an explicit size, which some browsers need to draw it. It is
 * loaded as an image, so scripts in it don't run.
 */
async function drawSvg(file: Blob, maxSide: number): Promise<HTMLCanvasElement> {
  const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('Not a readable SVG file');

  const viewBox = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const attr = (name: string) => {
    const v = parseFloat(svg.getAttribute(name) ?? '');
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const vbW = viewBox.length === 4 && viewBox[2]! > 0 ? viewBox[2]! : null;
  const vbH = viewBox.length === 4 && viewBox[3]! > 0 ? viewBox[3]! : null;
  const w0 = vbW ?? attr('width') ?? 1;
  const h0 = vbH ?? attr('height') ?? 1;
  // Without a viewBox, its own width and height become one, so that it scales to the new size.
  if (vbW == null && attr('width') && attr('height')) svg.setAttribute('viewBox', `0 0 ${attr('width')} ${attr('height')}`);
  const scale = maxSide / Math.max(w0, h0);
  const width = Math.round(w0 * scale);
  const height = Math.round(h0 * scale);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return draw(img, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}
