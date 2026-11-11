import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, utimesSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cleanupScript = path.join(repoRoot, "engine", "cleanup-temp.sh");

test("3-hour cleanup removes only expired temp/results and preserves recent files and model data", () => {
  const root = mkdtempSync(path.join(tmpdir(), "mita-cleanup-test-"));
  const tempRoot = path.join(root, "temp");
  const resultRoot = path.join(root, "results");
  const modelRoot = path.join(root, "models");
  mkdirSync(tempRoot);
  mkdirSync(resultRoot);
  mkdirSync(modelRoot);

  const oldTemp = path.join(tempRoot, "old-page.tmp");
  const newTemp = path.join(tempRoot, "current-page.tmp");
  const oldResult = path.join(resultRoot, "old-result.png");
  const newResult = path.join(resultRoot, "recent-result.png");
  const modelFile = path.join(modelRoot, "ocr-model.bin");

  for (const file of [oldTemp, newTemp, oldResult, newResult, modelFile]) {
    writeFileSync(file, "test-data");
  }

  const oldTime = new Date(Date.now() - 4 * 60 * 60 * 1000);
  for (const file of [oldTemp, oldResult]) {
    utimesSync(file, oldTime, oldTime);
  }

  try {
    const run = spawnSync("sh", [cleanupScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        MITA_TEMP_ROOT: tempRoot,
        MITA_RESULT_ROOT: resultRoot,
        MITA_RETENTION_MINUTES: "180",
        MITA_CLEANUP_ONCE: "1"
      }
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(existsSync(oldTemp), false, "expired temporary file should be deleted");
    assert.equal(existsSync(oldResult), false, "expired result file should be deleted");
    assert.equal(existsSync(newTemp), true, "recent temporary file must be preserved");
    assert.equal(existsSync(newResult), true, "recent result must be preserved");
    assert.equal(existsSync(modelFile), true, "model files must never be touched");
    assert.match(run.stdout, /3-hour cleanup/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Docker compose keeps AI model/cache volumes separate from 3-hour cleanup roots", () => {
  const compose = readFileSync(path.join(repoRoot, "engine", "compose.yaml"), "utf8");
  assert.match(compose, /manga-models:\/app\/models/);
  assert.match(compose, /manga-cache:\/root\/\.cache/);
  assert.match(compose, /manga-temp:\/tmp\/manga-indo-temp/);
  assert.match(compose, /manga-results:\/app\/result/);
  assert.match(compose, /cleanup-temp\.sh/);
  assert.match(compose, /max-size: ["']?10m/);
  assert.match(compose, /max-file: ["']?3/);
});
