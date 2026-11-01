export interface CoverImageSize {
  width: number;
  height: number;
}

export interface CoverTransform {
  zoom: number;
  centerX: number;
  centerY: number;
}

export interface CoverCropRect extends CoverImageSize {
  originX: number;
  originY: number;
}

export const DEFAULT_COVER_TRANSFORM: CoverTransform = Object.freeze({
  zoom: 1,
  centerX: 0.5,
  centerY: 0.5,
});
export const MAX_COVER_ZOOM = 4;

function pixelSize(image: CoverImageSize): CoverImageSize {
  if (
    !Number.isFinite(image.width) ||
    !Number.isFinite(image.height) ||
    image.width < 1 ||
    image.height < 1
  )
    throw new Error("This photo's dimensions could not be read.");
  return { width: Math.floor(image.width), height: Math.floor(image.height) };
}

function bounded(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  return Number.isNaN(value) || typeof value !== "number"
    ? fallback
    : Math.max(minimum, Math.min(maximum, value));
}

function geometry(
  image: CoverImageSize,
  aspect: number,
  transform: CoverTransform,
) {
  const size = pixelSize(image);
  if (!Number.isFinite(aspect) || aspect <= 0)
    throw new Error("The cover frame dimensions could not be read.");
  const zoom = bounded(transform.zoom, 1, MAX_COVER_ZOOM, 1);
  // Cover-fit first, then zoom inward. Rounding happens in source pixels and is
  // shared by the preview and export, including tiny or unusually shaped photos.
  const width = Math.max(
    1,
    Math.min(
      size.width,
      Math.round(Math.min(size.width, size.height * aspect) / zoom),
    ),
  );
  const height = Math.max(
    1,
    Math.min(
      size.height,
      Math.round(Math.min(size.height, size.width / aspect) / zoom),
    ),
  );
  const centerX = bounded(transform.centerX, 0, 1, 0.5) * size.width;
  const centerY = bounded(transform.centerY, 0, 1, 0.5) * size.height;
  return {
    ...size,
    cropWidth: width,
    cropHeight: height,
    zoom,
    centerX: Math.max(width / 2, Math.min(size.width - width / 2, centerX)),
    centerY: Math.max(height / 2, Math.min(size.height - height / 2, centerY)),
  };
}

/** Normalized focal point; zoom and pan always keep the frame inside the photo. */
export function normalizeCoverTransform(
  image: CoverImageSize,
  aspect: number,
  transform: CoverTransform = DEFAULT_COVER_TRANSFORM,
): CoverTransform {
  const value = geometry(image, aspect, transform);
  return {
    zoom: value.zoom,
    centerX: value.centerX / value.width,
    centerY: value.centerY / value.height,
  };
}

/** Source-pixel rectangle used identically for the visible frame and JPEG crop. */
export function coverCropRect(
  image: CoverImageSize,
  aspect: number,
  transform: CoverTransform = DEFAULT_COVER_TRANSFORM,
): CoverCropRect {
  const value = geometry(image, aspect, transform);
  return {
    originX: Math.max(
      0,
      Math.min(
        value.width - value.cropWidth,
        Math.round(value.centerX - value.cropWidth / 2),
      ),
    ),
    originY: Math.max(
      0,
      Math.min(
        value.height - value.cropHeight,
        Math.round(value.centerY - value.cropHeight / 2),
      ),
    ),
    width: value.cropWidth,
    height: value.cropHeight,
  };
}

/** Drag fractions describe movement of the photo, opposite to its crop center. */
export function moveCoverCrop(
  image: CoverImageSize,
  aspect: number,
  start: CoverTransform,
  dxFraction: number,
  dyFraction: number,
): CoverTransform {
  const value = normalizeCoverTransform(image, aspect, start);
  const rect = coverCropRect(image, aspect, value);
  const size = pixelSize(image);
  const dx = Number.isFinite(dxFraction) ? dxFraction : 0;
  const dy = Number.isFinite(dyFraction) ? dyFraction : 0;
  return normalizeCoverTransform(image, aspect, {
    zoom: value.zoom,
    centerX: value.centerX - (dx * rect.width) / size.width,
    centerY: value.centerY - (dy * rect.height) / size.height,
  });
}

/** Limit exported file dimensions without enlarging a selected part of a photo. */
export function coverOutputSize(
  rect: CoverImageSize,
  maxEdge = 2048,
): CoverImageSize {
  const size = pixelSize(rect);
  if (!Number.isFinite(maxEdge) || maxEdge < 1)
    throw new Error("The cover export size is invalid.");
  const scale = Math.min(
    1,
    Math.floor(maxEdge) / Math.max(size.width, size.height),
  );
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}
