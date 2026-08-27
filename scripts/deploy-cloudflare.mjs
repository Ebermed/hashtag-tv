import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const wranglerEntry = resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js");
const generatedConfigPath = resolve(projectRoot, "dist/server/wrangler.json");

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wranglerEntry, ...args], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Aplicando la estructura de la base de datos...");
runWrangler([
  `--config=${generatedConfigPath}`,
  "d1",
  "migrations",
  "apply",
  "hashtag-tv-db",
  "--remote",
]);

console.log("Publicando Hashtag TV...");
runWrangler([`--config=${generatedConfigPath}`, "deploy", "--keep-vars"]);
