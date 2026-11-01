import {
  coverCropRect,
  coverOutputSize,
  type CoverImageSize,
  type CoverTransform,
} from "./coverCrop";

/** Export the exact visible rectangle locally; the usual media action uploads it. */
export async function cropCover(
  uri: string,
  imageSize: CoverImageSize,
  aspect: number,
  transform: CoverTransform,
): Promise<string> {
  if (!/^(blob:|data:image\/)/i.test(uri))
    throw new Error("Choose a local photo for your cover.");
  const rect = coverCropRect(imageSize, aspect, transform);
  const output = coverOutputSize(rect);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () =>
      reject(new Error("This photo could not be cropped."));
    element.src = uri;
  });
  if (
    image.naturalWidth !== Math.floor(imageSize.width) ||
    image.naturalHeight !== Math.floor(imageSize.height)
  )
    throw new Error("This photo's size changed. Please choose it again.");
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not crop your photo.");
  // JPEG has no transparency; match the crop preview's white backing.
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(
    image,
    rect.originX,
    rect.originY,
    rect.width,
    rect.height,
    0,
    0,
    output.width,
    output.height,
  );
  const result = canvas.toDataURL("image/jpeg", 0.95);
  if (!result.startsWith("data:image/jpeg;base64,"))
    throw new Error("This browser could not export your cover photo.");
  return result;
}
