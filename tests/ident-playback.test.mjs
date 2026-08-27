import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pagePath = fileURLToPath(new URL("../app/page.tsx", import.meta.url));

test("positions an ID once and only resumes it from canplay", async () => {
  const source = await readFile(pagePath, "utf8");
  const component = source.slice(
    source.indexOf("function IdentOverlay"),
    source.indexOf("function LinearUploadedPlayer"),
  );

  assert.match(component, /addEventListener\("loadedmetadata", positionOnce\)/);
  assert.match(component, /addEventListener\("canplay", resume\)/);
  assert.doesNotMatch(component, /addEventListener\("canplay", positionOnce\)/);
  assert.match(component, /if \(disposed \|\| positioned/);
});
