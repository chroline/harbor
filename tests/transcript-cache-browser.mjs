// Run: ego-browser nodejs < tests/transcript-cache-browser.mjs
const assert = (await import("node:assert/strict")).default;
const task = await taskSpace("Harbor long chat load QA");
console.log({ spaceId: task.spaceId });
const page = task.page("p1");
await page.goto("http://127.0.0.1:1420/");
await page.waitForSelector('[aria-label="Describe a new task"]');
const id = `cache-qa-${Date.now()}`;
await page.evaluate(async (id) => {
  const { emptyTranscript } = await import("/src/lib/protocol.ts");
  const { writeTranscriptCache } = await import("/src/lib/transcript-cache.ts");
  const t = emptyTranscript();
  t.lastSequence = 21017;
  await writeTranscriptCache(id, t);
}, id);
await page.reload();
await page.waitForSelector('[aria-label="Describe a new task"]');
assert.equal(
  await page.evaluate(async (id) => {
    const { readTranscriptCache } =
      await import("/src/lib/transcript-cache.ts");
    return (await readTranscriptCache(id))?.lastSequence;
  }, id),
  21017,
);
assert.equal(
  await page.evaluate(async (id) => {
    const { readTranscriptCache, pruneTranscriptCache } =
      await import("/src/lib/transcript-cache.ts");
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("harbor-transcript-cache");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const keys = await new Promise((resolve, reject) => {
      const r = db
        .transaction("transcripts")
        .objectStore("transcripts")
        .getAllKeys();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    await pruneTranscriptCache(new Set(keys.filter((key) => key !== id)));
    return await readTranscriptCache(id);
  }, id),
  null,
);
console.log(
  "PASS: checkpoints survive reload and deleted session checkpoints are pruned",
);
await task.finish({ keep: [] });
