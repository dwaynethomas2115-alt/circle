import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  coverCropRect,
  coverOutputSize,
  type CoverImageSize,
  type CoverTransform,
} from "./coverCrop";

/** Native export uses the same source rectangle as the interactive preview. */
export async function cropCover(
  uri: string,
  imageSize: CoverImageSize,
  aspect: number,
  transform: CoverTransform,
): Promise<string> {
  const rect = coverCropRect(imageSize, aspect, transform);
  const output = coverOutputSize(rect);
  const context = ImageManipulator.manipulate(uri);
  context.crop(rect);
  if (output.width !== rect.width || output.height !== rect.height)
    context.resize(output);
  const result = await context.renderAsync();
  return (await result.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 }))
    .uri;
}
