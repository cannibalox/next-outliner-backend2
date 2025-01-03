import path from "path";
import { clearScannedImage } from "../utils/helper-functions/image-processing/clearScannedImage";

const inputPath = path.join(__dirname, "_temp", "image.png");
const outputPath = path.join(__dirname, "_temp", "image-clear.png");

clearScannedImage(inputPath, outputPath);
