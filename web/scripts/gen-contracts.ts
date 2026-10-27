// Generates src/contracts.gen.ts from the contracts JSON Schema.
// `--check` fails instead of writing when the committed file is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { compile } from "json-schema-to-typescript";

const schemaPath = new URL(
  "../../packages/contracts/pitchpoints.schema.json",
  import.meta.url,
);
const outputPath = new URL("../src/contracts.gen.ts", import.meta.url);

const generated = await compile(
  JSON.parse(readFileSync(schemaPath, "utf8")),
  "SimulatorMessage",
  {
    bannerComment:
      "// Generated from packages/contracts by `make contracts`. Do not edit.",
  },
);

if (!process.argv.includes("--check")) {
  writeFileSync(outputPath, generated);
} else if (readFileSync(outputPath, "utf8") !== generated) {
  console.error("src/contracts.gen.ts is stale: run `make contracts`.");
  process.exit(1);
}
