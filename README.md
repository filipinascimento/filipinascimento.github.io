# Filipi Nascimento Silva: research website

A modern, Markdown-first research portfolio for [filipinascimento.github.io](https://filipinascimento.github.io/). It combines editorial content, a deduplicated publication record, curated software metadata, and a live Helios Web visualization.

## Repository history

The previous Jekyll website is preserved in the [`legacy-jekyll-site`](https://github.com/filipinascimento/filipinascimento.github.io/tree/legacy-jekyll-site) branch and the immutable [`legacy-site-2026-08-03`](https://github.com/filipinascimento/filipinascimento.github.io/tree/legacy-site-2026-08-03) tag. The migration commit also retains the complete history of the modern website as a second parent.

The former embedded [`politiciannetworks`](https://github.com/filipinascimento/politiciannetworks) and [`visualizer`](https://github.com/filipinascimento/visualizer) folders now have independent repositories and GitHub Pages deployments with their folder-specific histories intact.

## What is generated and what is edited

The authored source of truth is under `content/`:

- `content/site/`: profile and homepage copy
- `content/projects/`: current and selected past projects
- `content/software/`: curated software entries
- `content/teaching/`: courses and teaching material
- `content/cv/`: privacy-safe public web CV
- `content/posts/`: prepared collection for future writing

Every entry is a plain `.md` file with YAML front matter. `npm run content:build` converts those collections into `data/content.json`; generated JSON should not be hand-edited.

The complete CV files containing private contact details live outside this repository in `../CV/generated/`. They must not be copied into `content/`, `public/`, or any Git commit.

## Publication and software data

`config/profile-sources.json` contains the verified public identity sources, including the primary OpenAlex author ID, nine confirmed split IDs, manual DOI fallbacks, and the curated GitHub repository list.

Run:

```bash
OPENALEX_MAILTO=you@example.com npm run data:refresh
```

This command:

1. fetches all configured OpenAlex profiles and paginated works;
2. adds explicitly configured DOI records that do not yet carry the correct author ID;
3. deduplicates works by DOI and normalized title;
4. writes the structured record to `data/openalex/` and a readable generated Markdown record to `content/publications/generated.md`;
5. refreshes metadata only for the selected GitHub repositories; and
6. rebuilds the Markdown collections.

The GitHub Pages workflow repeats the refresh weekly and commits changed public data before deploying it.

### Manual refresh and review

Use an isolated checkout based on the latest `origin/master` when the main
checkout has unfinished edits. `npm run data:refresh` only writes local data
and figures; it does not commit, push, or deploy. Then run `npm run verify`.

The OpenAlex refresh records each configured author ID's current resolution in
`data/openalex/profile.json`. A 404 for a secondary ID is reported and skipped;
missing primary identity, other request failures, and missing audited publications
still stop the refresh. Redirected IDs are queried only once. Scholarly reviews
are included. Verified title changes belong in `openAlexTitleAliases`, and works
missing from the author index can be linked by exact DOI.

`data/openalex/review-candidates.json` contains works outside the editorial
audit. These do not appear on the website. The Scholar comparison keeps the
historical exclusion counts separate from today's profile count and lists rows
outside the accepted publication list for review. An increase in profile rows
does not automatically increase the public publication count. Do not add a work
until authorship, publication status, duplicates, and its figure have been checked.

DOI-keyed `workOverrides` record verified metadata corrections, edition notes,
and related-work links without merging distinct editions. The 2022 chapter
keeps its own DOI alongside the 2014 edition and uses its book's cover.
The 2021 Zenodo dataset is excluded at the owner's request.
The null-model preprint and published modularity article are linked by exact
DOI because OpenAlex currently assigns them to newly split author identities.
The modularity record uses the publisher's publication date and author names,
and retains its preprint link without a duplicate bibliography entry.
Figure overrides can document an intentional omission with `omitReason`.
These cases are tracked separately from failed image retrievals.

Before publishing, compare the refreshed bibliography and all referenced figure
files with the previous version. Read any cached-source warnings in the run log.
`npm run figures:projects` can regenerate the four selected project thumbnails
after their source figures change; it is not part of the regular data refresh.

A future weekly local Codex task can perform this procedure and report its diff
for review. It requires the Darkseid computer and desktop app to be running,
the checkout and Node dependencies to be available, and permission for the
public network requests. Keep unfinished work isolated and define publication
authority explicitly. No local task is installed by this repository change.
The existing GitHub workflow combines scheduling with GitHub Pages deployment:
moving the refresh locally does not by itself remove the need to deploy the site.

## Helios Web

The homepage uses `helios-web` 0.10 and `helios-network` 0.10. The package currently ships browser-only WebAssembly and worker assets that server-oriented static compilers try to analyze. `npm run vendor:helios` copies the installed official browser bundles into `public/vendor/`, rewrites only their local import/worker URLs, and leaves the npm packages as the declared version source.

Run that command after upgrading either Helios package. It is also run automatically before every local and production build.

## Local development

Node.js 22.13 or newer is required.

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run data:refresh   # OpenAlex + selected GitHub repositories
npm run content:build  # Markdown only
npm run build          # Sites/vinext production build
npm run build:github   # GitHub Pages static export to out/
npm test               # content, identity, privacy, and vendor checks
npm run verify         # lint, tests, and both production builds
```

## Themes and future writing

Light and dark themes share the same editorial design tokens. The first visit follows the operating-system preference; the header toggle stores an explicit choice in `localStorage`.

The `/writing` route and `content/posts/` collection are already wired. Add the first post as Markdown, then expose Writing in `app/components/SiteHeader.tsx` when it is ready to publish.

## Deployment

`.github/workflows/pages.yml` builds the static export and deploys it with GitHub Pages. The same repository can also be built by OpenAI Sites through the existing vinext configuration; no database or private authentication is required.
