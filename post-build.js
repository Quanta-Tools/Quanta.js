import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, "public");
const distDir = path.join(__dirname, "dist");

fs.readdir(publicDir, (err, files) => {
  if (err) {
    console.error("Error reading public directory:", err);
    return;
  }

  files.forEach((file) => {
    const srcPath = path.join(publicDir, file);
    const destPath = path.join(distDir, file);

    fs.copy(srcPath, destPath, (err) => {
      if (err) {
        console.error(`Error copying ${file}:`, err);
      } else {
        console.log(`Copied ${file} to dist`);
      }
    });
  });
});
