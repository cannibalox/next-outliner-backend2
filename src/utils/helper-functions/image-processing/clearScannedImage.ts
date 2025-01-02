import sharp from "sharp";

export async function clearScannedImage(inputPath: string, outputPath: string) {
  // 读取图像并获取原始像素数据
  const { data, info } = await sharp(inputPath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixels = data;

  // 创建一个新的缓冲区来存储处理后的像素数据
  const newPixels = Buffer.alloc(pixels.length);

  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = channels === 4 ? pixels[i + 3] : 255; // 如果有 Alpha 通道

    // 判断当前像素是否接近背景色（假设背景为浅色）
    if (r > 200 && g > 200 && b > 200) {
      // 将背景色设置为纯白色
      newPixels[i] = 255;
      newPixels[i + 1] = 255;
      newPixels[i + 2] = 255;
      if (channels === 4) {
        newPixels[i + 3] = a;
      }
    } else {
      // 保留文字的原始颜色
      newPixels[i] = r;
      newPixels[i + 1] = g;
      newPixels[i + 2] = b;
      if (channels === 4) {
        newPixels[i + 3] = a;
      }
    }
  }

  // 将处理后的像素数据生成新的图像
  await sharp(newPixels, {
    raw: {
      width: width,
      height: height,
      channels: channels,
    },
  }).toFile(outputPath);
}
