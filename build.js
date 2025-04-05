import esbuild from "esbuild";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// rm rf dist and create it:
const distDir = path.join(__dirname, "dist");
fs.removeSync(distDir);
fs.ensureDirSync(distDir);

const uuid = crypto.randomUUID();

esbuild
  .build({
    entryPoints: ["quanta.ts"],
    bundle: true,
    minify: true,
    outfile: `dist/quanta.${uuid}.min.js`,
    platform: "browser",
  })
  .catch(() => process.exit(1))
  .then(() => {
    const publicDir = path.join(__dirname, "public");
    const distDir = path.join(__dirname, "dist");

    const redirectsPath = path.join(distDir, "_redirects");
    const redirectsContent = `/*    /quanta.${uuid}.min.js    200`;
    fs.writeFileSync(redirectsPath, redirectsContent, "utf8");

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
  });
