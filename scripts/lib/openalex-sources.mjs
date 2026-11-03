// Keep configured identities for provenance, but query each resolved identity once.
// Only retired secondary IDs may be skipped; coverage is checked by the caller.
export async function collectAuthorWorks(config, getAuthor, getWorks) {
  const authorProfiles = [];
  const worksByAuthor = [];
  const sources = [];
  const resolvedIds = new Set();
  let primary;

  for (const requestedId of config.authorIds) {
    let author;
    try {
      author = await getAuthor(requestedId);
    } catch (error) {
      if (error.status !== 404 || requestedId === config.primaryAuthorId) throw error;
      sources.push({ requestedId, status: "unavailable", httpStatus: 404 });
      console.warn(`OpenAlex secondary author ${requestedId} returned 404; checking audited work coverage.`);
      continue;
    }
    const resolvedId = author.id?.split("/").pop();
    if (!/^A\d+$/.test(resolvedId || "")) throw new Error(`Invalid OpenAlex author: ${requestedId}`);
    if (requestedId === config.primaryAuthorId) {
      if (config.orcid && author.orcid?.split("/").pop() !== config.orcid) {
        throw new Error("Primary OpenAlex author ORCID does not match the configured identity.");
      }
      primary = author;
    }
    sources.push({ requestedId, resolvedId, status: resolvedId === requestedId ? "current" : "redirected" });
    if (resolvedIds.has(resolvedId)) continue;
    resolvedIds.add(resolvedId);
    authorProfiles.push(author);
    worksByAuthor.push(await getWorks(resolvedId));
  }
  if (!primary) throw new Error("Primary OpenAlex author profile was not found.");
  return { authorProfiles, worksByAuthor, sources, primary };
}
