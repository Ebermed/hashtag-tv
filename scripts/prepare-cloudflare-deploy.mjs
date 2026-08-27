import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const wranglerEntry = resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js");
const generatedConfigPath = resolve(projectRoot, "dist/server/wrangler.json");

function wrangler(...args) {
  return execFileSync(process.execPath, [wranglerEntry, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
}

function parseJsonArray(output) {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Cloudflare no devolvió la lista de bases de datos esperada.");
  }
  return JSON.parse(output.slice(start, end + 1));
}

let databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
if (!databaseId) {
  const databases = parseJsonArray(wrangler("d1", "list", "--json"));
  const database = databases.find((item) => item.name === "hashtag-tv-db");
  databaseId = database?.uuid;
}

if (!databaseId) throw new Error("No encontré la base D1 `hashtag-tv-db` en la cuenta conectada.");

const config = JSON.parse(readFileSync(generatedConfigPath, "utf8"));
config.topLevelName = "hashtagtv";
config.name = "hashtagtv";
config.compatibility_date = "2026-08-27";
config.compatibility_flags = ["nodejs_compat"];
config.d1_databases = [
  {
    binding: "DB",
    database_name: "hashtag-tv-db",
    database_id: databaseId,
    migrations_dir: "../../drizzle",
  },
];
config.r2_buckets = [
  {
    binding: "BUCKET",
    bucket_name: "hashtag-tv-media",
  },
];
config.observability = {
  enabled: true,
  head_sampling_rate: 1,
};

writeFileSync(generatedConfigPath, `${JSON.stringify(config, null, 2)}\n`);
console.log("Configuración de Cloudflare preparada correctamente.");
