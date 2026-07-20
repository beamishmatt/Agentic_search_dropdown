// Loads the prebuilt PDF text index (public/evidence/text-index.json) and
// answers match queries synchronously. The index is generated at build time
// by scripts/build-text-index.mjs.
//
// Queries are matched against each page's text items joined with single
// spaces, so a query may legitimately span multiple items (e.g. a sentence
// that pdfjs split on a line break). Each Match therefore carries one or
// more `segments`, each describing a per-item slice to highlight.

export type TextIndexItem = { str: string };
export type TextIndexPage = { items: TextIndexItem[] };
export type TextIndexDoc = { pages: TextIndexPage[] };
export type TextIndex = Record<string, TextIndexDoc>;

export type MatchSegment = {
  itemIndex: number;
  charStart: number;
  charEnd: number;
};

export type Match = {
  evidenceId: string;
  fileUrl: string;
  pageIndex: number;
  // Anchor for scroll-into-view and key generation. Equal to segments[0].
  itemIndex: number;
  charStart: number;
  charEnd: number;
  segments: MatchSegment[];
};

let cached: TextIndex | null = null;
let inflight: Promise<TextIndex | null> | null = null;

export async function loadTextIndex(): Promise<TextIndex | null> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/evidence/text-index.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cached = (await res.json()) as TextIndex;
      return cached;
    } catch (err) {
      console.warn('[pdfTextIndex] failed to load text-index.json — match navigation disabled', err);
      cached = {};
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function getTextIndex(): TextIndex | null {
  return cached;
}

function queryToRegex(query: string): RegExp {
  // Collapse whitespace runs in the query to single spaces, escape regex
  // specials, then turn each literal space into \s+ so the query can match
  // across pdfjs item boundaries (newlines, joiner spaces, multi-space gaps).
  const normalized = query.trim().replace(/\s+/g, ' ');
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/ /g, '\\s+');
  return new RegExp(pattern, 'gi');
}

function buildJoinedPage(items: TextIndexItem[]): { joined: string; offsets: number[] } {
  const offsets: number[] = [];
  const parts: string[] = [];
  let ofs = 0;
  for (let i = 0; i < items.length; i++) {
    offsets.push(ofs);
    const s = items[i].str;
    parts.push(s);
    ofs += s.length;
    if (i < items.length - 1) ofs += 1; // single-space joiner
  }
  return { joined: parts.join(' '), offsets };
}

// Builds a short, single-line snippet of `text` around [start, end), padded on
// both sides and ellipsized where it was clipped. Used to show *why* a document
// matched a full-text search.
function buildSnippet(text: string, start: number, end: number, pad = 60): string {
  const s = Math.max(0, start - pad);
  const e = Math.min(text.length, end + pad);
  let snippet = text.slice(s, e).replace(/\s+/g, ' ').trim();
  if (s > 0) snippet = '…' + snippet;
  if (e < text.length) snippet = snippet + '…';
  return snippet;
}

// Full-text search across every indexed PDF. Returns a map of fileUrl → snippet
// for each document whose body text contains the query as a (whitespace-
// flexible) phrase — the same match semantics as findMatches / the in-document
// highlighter, so search hits and highlights stay in sync. Loads the index on
// demand and is safe to call before it has been fetched.
export async function findContentMatches(query: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const trimmed = query.trim();
  if (!trimmed) return out;
  const index = await loadTextIndex();
  if (!index) return out;
  const regex = queryToRegex(trimmed);
  for (const [fileUrl, doc] of Object.entries(index)) {
    for (const page of doc.pages) {
      if (page.items.length === 0) continue;
      const joined = page.items.map(i => i.str).join(' ');
      regex.lastIndex = 0;
      const m = regex.exec(joined);
      if (m) {
        out.set(fileUrl, buildSnippet(joined, m.index, m.index + m[0].length));
        break; // one snippet per document is enough for a result row
      }
    }
  }
  return out;
}

export function findMatches(
  results: { evidenceId: string; fileUrl?: string }[],
  query: string,
): Match[] {
  const trimmed = query.trim();
  if (!trimmed || !cached) return [];
  const regex = queryToRegex(trimmed);
  const out: Match[] = [];
  for (const r of results) {
    if (!r.fileUrl) continue;
    const doc = cached[r.fileUrl];
    if (!doc) continue;
    for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex++) {
      const items = doc.pages[pageIndex].items;
      if (items.length === 0) continue;
      const { joined, offsets } = buildJoinedPage(items);
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(joined)) !== null) {
        const matchStart = m.index;
        const matchEnd = matchStart + m[0].length;
        const segments: MatchSegment[] = [];
        for (let i = 0; i < items.length; i++) {
          const itemStart = offsets[i];
          const itemEnd = itemStart + items[i].str.length;
          if (itemEnd <= matchStart) continue;
          if (itemStart >= matchEnd) break;
          const segStart = Math.max(0, matchStart - itemStart);
          const segEnd = Math.min(items[i].str.length, matchEnd - itemStart);
          if (segEnd > segStart) segments.push({ itemIndex: i, charStart: segStart, charEnd: segEnd });
        }
        if (segments.length > 0) {
          out.push({
            evidenceId: r.evidenceId,
            fileUrl: r.fileUrl,
            pageIndex,
            itemIndex: segments[0].itemIndex,
            charStart: segments[0].charStart,
            charEnd: segments[0].charEnd,
            segments,
          });
        }
        if (m[0].length === 0) regex.lastIndex++;
      }
    }
  }
  return out;
}
