// Pre-bundle the Lambda into a single self-contained ESM file for SAM to zip.
// Bundles @maribooks/shared in; leaves the AWS SDK external (provided by the Lambda runtime).
import { build } from "esbuild";

await build({
  entryPoints: ["src/handler.ts"],
  outfile: "dist/handler.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  sourcemap: true,
  external: ["@aws-sdk/*"],
  banner: {
    // Shim require() for any transitive CJS in an ESM output.
    js: "import{createRequire as _cr}from'module';const require=_cr(import.meta.url);",
  },
  logLevel: "info",
});

console.log("Bundled api -> dist/handler.mjs");
