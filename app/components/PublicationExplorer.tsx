"use client";

import { ArrowUpRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Publication } from "../lib/types";

const filters = [
  ["all", "All"],
  ["article", "Articles"],
  ["book-chapter", "Chapters"],
  ["editorial", "Editorials"],
  ["preprint", "Preprints"],
] as const;

function authorLine(authors: Publication["authors"]) {
  const names = authors.map((author) => author.name);
  return names.length <= 8 ? names.join(", ") : `${names.slice(0, 7).join(", ")}, et al.`;
}

function publicationType(type: string) {
  const label = type.replaceAll("-", " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function publicationVenue(source: string) {
  const venueNames: Record<string, string> = {
    "Chaos An Interdisciplinary Journal of Nonlinear Science": "Chaos: An Interdisciplinary Journal of Nonlinear Science",
    "Journal of Physics A Mathematical and Theoretical": "Journal of Physics A: Mathematical and Theoretical",
    "Journal of Physics Complexity": "Journal of Physics: Complexity",
    "Journal of Statistical Mechanics Theory and Experiment": "Journal of Statistical Mechanics: Theory and Experiment",
    "Physica A Statistical Mechanics and its Applications": "Physica A: Statistical Mechanics and its Applications",
    "Physical review. E": "Physical Review E",
    "The Journal of Open Source Software": "Journal of Open Source Software",
  };

  return venueNames[source] || source;
}

export function PublicationExplorer({ works, assetRoot = "" }: { works: Publication[]; assetRoot?: string }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [visible, setVisible] = useState(24);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return works.filter((work) => {
      if (type !== "all" && work.type !== type) return false;
      if (!needle) return true;
      const haystack = [
        work.title,
        work.source,
        work.year,
        ...work.authors.map((author) => author.name),
        ...work.topics,
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, type, works]);

  const shown = filtered.slice(0, visible);
  const yearTotals = filtered.reduce<Record<string, number>>((totals, work) => {
    const label = work.year ? String(work.year) : "Not dated";
    totals[label] = (totals[label] || 0) + 1;
    return totals;
  }, {});
  const yearGroups = shown.reduce<Array<{ label: string; works: Publication[] }>>((groups, work) => {
    const label = work.year ? String(work.year) : "Not dated";
    const currentGroup = groups.at(-1);

    if (currentGroup?.label === label) {
      currentGroup.works.push(work);
    } else {
      groups.push({ label, works: [work] });
    }

    return groups;
  }, []);

  return (
    <div className="publication-explorer">
      <div className="publication-controls">
        <label className="publication-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search publications</span>
          <input
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setVisible(24); }}
            placeholder="Search titles, authors, venues, or topics"
          />
        </label>
        <div className="publication-filters" aria-label="Filter by publication type">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={type === value ? "is-active" : ""}
              onClick={() => { setType(value); setVisible(24); }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="publication-result-count" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "record" : "records"}
      </div>
      <div className="publication-groups">
        {yearGroups.map((group) => {
          const headingId = `publications-${group.label.toLowerCase().replace(/\s+/g, "-")}`;

          return (
            <section className="publication-year" aria-labelledby={headingId} key={group.label}>
              <header className="publication-year__heading">
                <h3 id={headingId}>{group.label}</h3>
                <span>{yearTotals[group.label]} {yearTotals[group.label] === 1 ? "publication" : "publications"}</span>
              </header>
              <ul className="publication-list">
                {group.works.map((work) => (
                  <li key={work.id}>
                    {work.figure && (
                      <a
                        className="publication-list__figure"
                        href={work.figure.sourceUrl || work.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`View figure source for ${work.title}`}
                      >
                        <img
                          src={`${assetRoot}${work.figure.src}`}
                          alt={work.figure.alt}
                          loading="lazy"
                          style={{
                            objectFit: work.figure.fit || "contain",
                            objectPosition: work.figure.position || "center",
                          }}
                        />
                      </a>
                    )}
                    <div className="publication-list__content">
                      <h4><a href={work.url} target="_blank" rel="noreferrer">{work.title}</a></h4>
                      <p className="publication-list__authors">{authorLine(work.authors)}</p>
                      <div className="publication-list__meta">
                        <span className="publication-list__venue">{work.publicationStatus === "preprint" ? "Preprint" : (publicationVenue(work.source) || publicationType(work.type))}</span>
                        {work.publicationStatus === "published" && (
                          <>{" · "}<span className="publication-type">{publicationType(work.type)}</span></>
                        )}
                        {work.openAccess && <>{" · "}<span className="open-access">Open access</span></>}
                        {" · "}
                        <a href={work.url} target="_blank" rel="noreferrer" aria-label={`Open ${work.title}`}>
                          {work.publicationStatus === "preprint" ? "View preprint" : "Published version"}<ArrowUpRight size={12} aria-hidden="true" />
                        </a>
                        {work.publicationStatus === "published" && work.preprintUrls?.[0] && (
                          <>{" · "}<a href={work.preprintUrls[0]} target="_blank" rel="noreferrer" aria-label={`Open preprint for ${work.title}`}>
                            Preprint<ArrowUpRight size={12} aria-hidden="true" />
                          </a></>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {shown.length < filtered.length && (
        <button className="load-more" type="button" onClick={() => setVisible((count) => count + 24)}>
          Show more publications
        </button>
      )}
      {filtered.length === 0 && (
        <div className="empty-state">No publications match this search.</div>
      )}
    </div>
  );
}
