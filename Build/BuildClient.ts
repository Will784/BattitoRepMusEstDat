import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const output = path.join(root, "Dist", "Public");
const watch = process.argv.includes("--watch");

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, "Assets", "Fonts"), { recursive: true });

const fontDirectory = path.join(root, "node_modules", "@fontsource-variable", "bricolage-grotesque", "files");
for (const file of ["bricolage-grotesque-latin-wght-normal.woff2", "bricolage-grotesque-latin-ext-wght-normal.woff2"]) {
  fs.copyFileSync(path.join(fontDirectory, file), path.join(output, "Assets", "Fonts", file));
}
fs.copyFileSync(path.join(root, "Assets", "Favicon.svg"), path.join(output, "Assets", "Favicon.svg"));
fs.copyFileSync(path.join(root, "Public", "Index.html"), path.join(output, "Index.html"));

await build({
  entryPoints: [path.join(root, "Source", "Main.ts")],
  outfile: path.join(output, "Main.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: !watch,
  sourcemap: true,
  legalComments: "none",
  logLevel: "info"
});

await build({
  entryPoints: [path.join(root, "Styles", "Main.css")],
  outfile: path.join(output, "Main.css"),
  bundle: true,
  minify: !watch,
  loader: { ".woff2": "file" },
  external: ["/Assets/*"],
  logLevel: "info"
});
