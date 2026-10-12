import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/**
 * Writes dist/sw.js from src/service-worker.js with the list of built files to
 * precache and a version derived from their contents, so each deploy gets a fresh cache.
 */
function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "service-worker",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      // Browsers that understand service workers all use woff2, so the woff fallbacks are skipped.
      const files = listFiles(outDir)
        .map((file) => relative(outDir, file).split("\\").join("/"))
        .filter((file) => file !== "sw.js" && !file.endsWith(".woff"))
        .sort();
      const hash = createHash("sha256");
      for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
      const precache = ["./", ...files.filter((file) => file !== "index.html")];
      const source = readFileSync("src/service-worker.js", "utf8")
        .replace("__VERSION__", hash.digest("hex").slice(0, 12))
        .replace("__PRECACHE__", JSON.stringify(precache));
      writeFileSync(join(outDir, "sw.js"), source);
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the build works from any subpath (e.g. GitHub Pages at /nfl-picross/).
  base: "./",
  plugins: [serviceWorker()],
});
