// Pre-bundle the Lambda into a single self-contained ESM file for SAM to zip.
// Bundles @maribooks/shared in. The AWS SDK is left external WHERE the Node 22 Lambda runtime
// reliably provides it (DynamoDB, lib-dynamodb, Bedrock), but the newer proof-feature SDK
// packages are bundled in, because s3-request-presigner and client-textract are not guaranteed
// to be in the runtime (AWS recommends bundling your own SDK deps for control).
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
  external: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/lib-dynamodb",
    "@aws-sdk/client-bedrock-runtime",
  ],
  banner: {
    // Shim require() for any transitive CJS in an ESM output.
    js: "import{createRequire as _cr}from'module';const require=_cr(import.meta.url);",
  },
  logLevel: "info",
});

console.log("Bundled api -> dist/handler.mjs");
