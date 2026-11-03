import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { collectAuthorWorks } from "../scripts/lib/openalex-sources.mjs";

const config = { primaryAuthorId: "A1", authorIds: ["A1", "A2", "A3"], orcid: "verified-orcid" };
const primary = { id: "https://openalex.org/A1", orcid: "https://orcid.org/verified-orcid" };
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

test("skips a retired secondary ID and queries redirected identities once", async () => {
  const queried = [];
  const result = await collectAuthorWorks(config, async (id) => {
    if (id === "A2") throw httpError(404);
    return primary;
  }, async (id) => { queried.push(id); return [{ id: "W1" }]; });
  assert.deepEqual(queried, ["A1"]);
  assert.equal(result.sources[1].status, "unavailable");
  assert.equal(result.sources[2].status, "redirected");
  assert.equal(result.worksByAuthor.flat().length, 1);
});

test("does not suppress missing primary profiles, rate limits, or server failures", async () => {
  await assert.rejects(collectAuthorWorks(config, async () => { throw httpError(404); }, async () => []), /404/);
  for (const status of [429, 500]) {
    await assert.rejects(collectAuthorWorks(config, async (id) => {
      if (id === "A1") return primary;
      throw httpError(status);
    }, async () => []), new RegExp(String(status)));
  }
});

test("rejects an incorrect primary identity and failed work pages", async () => {
  await assert.rejects(collectAuthorWorks(config, async () => ({ ...primary, orcid: "other" }), async () => []), /ORCID/);
  await assert.rejects(collectAuthorWorks(config, async () => primary, async () => { throw httpError(404); }), /404/);
});

test("new Scholar rows require review while a missing audited publication remains fatal", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "website-refresh-test-"));
  const root = new URL("../", import.meta.url);
  const files = ["config/scholar-publication-audit.json", "data/scholar/profile.json", "data/scholar/entries.json", "data/openalex/profile.json", "data/openalex/works.json"];
  try {
    for (const file of files) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(path.join(dir, file), await readFile(new URL(file, root)));
    }
    const entriesPath = path.join(dir, "data/scholar/entries.json");
    const profilePath = path.join(dir, "data/scholar/profile.json");
    const entries = JSON.parse(await readFile(entriesPath));
    const profile = JSON.parse(await readFile(profilePath));
    entries.entries.push({ id: "new-review-candidate", title: "Unreviewed new work", matchesPublishedTitle: false });
    entries.count = entries.entries.length;
    profile.profileEntries = entries.count;
    await writeFile(entriesPath, JSON.stringify(entries));
    await writeFile(profilePath, JSON.stringify(profile));
    const compare = new URL("scripts/compare-publication-sources.mjs", root).pathname;
    execFileSync(process.execPath, [compare], { cwd: dir, stdio: "pipe" });
    const report = JSON.parse(await readFile(path.join(dir, "data/scholar/source-comparison.json")));
    assert.equal(report.googleScholar.reviewRequired, true);
    assert.ok(report.googleScholar.currentRowsOutsidePublishedList.some((row) => row.id === "new-review-candidate"));
    const worksPath = path.join(dir, "data/openalex/works.json");
    const works = JSON.parse(await readFile(worksPath));
    const dataset = works.works.find((work) => work.publicationStatus === "dataset");
    dataset.type = "article";
    await writeFile(worksPath, JSON.stringify(works));
    assert.throws(() => execFileSync(process.execPath, [compare], { cwd: dir, stdio: "pipe" }), /datasets are missing or incorrectly classified/);
    dataset.type = "dataset";
    works.works = works.works.filter((work) => work.title !== "Visualizing big science projects");
    await writeFile(worksPath, JSON.stringify(works));
    assert.throws(() => execFileSync(process.execPath, [compare], { cwd: dir, stdio: "pipe" }), /Curated publications are missing/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
