import path from "path";
import { clearScannedImage } from "../utils/helper-functions/image-processing/clearScannedImage";

const inputPath = path.join(__dirname, "image.png");
const outputPath = path.join(__dirname, "image-clear.png");

clearScannedImage(inputPath, outputPath);
