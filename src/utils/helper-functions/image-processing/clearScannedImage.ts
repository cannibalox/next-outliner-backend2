import sharp from "sharp";

export async function clearScannedImage(inputPath: string, outputPath: string) {
  // 读取原始图像
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  // 首先对图像进行预处理：增加对比度并进行轻微锐化
  const { data, info } = await image
    .normalize() // 标准化图像的对比度
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixels = data;
  const newPixels = Buffer.alloc(pixels.length);

  // 创建亮度直方图
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = Math.round((r + g + b) / 3);
    histogram[brightness]++;
  }

  // 使用 Otsu 算法计算最佳阈值
  let sumTotal = 0;
  let weightedSum = 0;
  for (let i = 0; i < 256; i++) {
    sumTotal += histogram[i];
    weightedSum += i * histogram[i];
  }

  let maxVariance = 0;
  let threshold = 0;
  let sumBackground = 0;
  let weightBackground = 0;

  for (let t = 0; t < 256; t++) {
    sumBackground += histogram[t];
    if (sumBackground === 0) continue;

    const sumForeground = sumTotal - sumBackground;
    if (sumForeground === 0) break;

    weightBackground += t * histogram[t];
    const weightForeground = weightedSum - weightBackground;

    const meanBackground = weightBackground / sumBackground;
    const meanForeground = weightForeground / sumForeground;

    const variance =
      sumBackground *
      sumForeground *
      Math.pow(meanBackground - meanForeground, 2);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  // 处理每个像素
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = (r + g + b) / 3;

    if (brightness > threshold) {
      // 设置为白色背景
      newPixels[i] = 255;
      newPixels[i + 1] = 255;
      newPixels[i + 2] = 255;
    } else {
      // 增强前景（文字）的对比度
      const contrast = 1.2;
      newPixels[i] = Math.min(255, Math.max(0, Math.round(r * contrast)));
      newPixels[i + 1] = Math.min(255, Math.max(0, Math.round(g * contrast)));
      newPixels[i + 2] = Math.min(255, Math.max(0, Math.round(b * contrast)));
    }

    // 保持 alpha 通道不变（如果存在）
    if (channels === 4) {
      newPixels[i + 3] = pixels[i + 3];
    }
  }

  // 输出处理后的图像，添加后处理步骤
  await sharp(newPixels, {
    raw: {
      width,
      height,
      channels,
    },
  })
    .toFormat(metadata.format || "png")
    .toFile(outputPath);
}
