import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();

await build({
  entryPoints: [path.join(root, "Server", "Main.ts")],
  outfile: path.join(root, "Dist", "Server", "Main.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  sourcemap: true,
  logLevel: "info"
});
