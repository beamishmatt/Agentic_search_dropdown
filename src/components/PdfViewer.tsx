import React from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { findMatches, loadTextIndex, getTextIndex } from '../lib/pdfTextIndex';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type ScrollTarget = {
  pageIndex: number;
  itemIndex: number;
  charStart: number;
};

type PdfViewerProps = {
  fileUrl: string;
  searchQuery: string;
  page: number;
  onTotalPagesChange: (n: number) => void;
  scrollToMatch?: ScrollTarget;
  /** Reports the rendered page height (px) so a parent can size to fit its content. */
  onContentHeightChange?: (height: number) => void;
};

const HIGHLIGHT_BG = 'rgba(254,198,46,0.5)';
const ACTIVE_HIGHLIGHT_BG = 'rgba(254,198,46,0.75)';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type ItemSegment = { matchKey: string; segStart: number; segEnd: number; isActive: boolean };

export function PdfViewer({
  fileUrl,
  searchQuery,
  page,
  onTotalPagesChange,
  scrollToMatch,
  onContentHeightChange,
}: PdfViewerProps) {
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number>(0);
  const [error, setError] = React.useState<string | null>(null);
  const [textIndexReady, setTextIndexReady] = React.useState(getTextIndex() !== null);

  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    if (textIndexReady) return;
    let cancelled = false;
    loadTextIndex().then(() => { if (!cancelled) setTextIndexReady(true); });
    return () => { cancelled = true; };
  }, [textIndexReady]);

  const trimmedQuery = searchQuery.trim();
  const activeKey = scrollToMatch
    ? `${scrollToMatch.pageIndex}:${scrollToMatch.itemIndex}:${scrollToMatch.charStart}`
    : '';

  // Lookup table: "pageIndex:itemIndex" -> per-item segments, sorted by start.
  const itemSegments = React.useMemo(() => {
    const map = new Map<string, ItemSegment[]>();
    if (!textIndexReady || !trimmedQuery) return map;
    const matches = findMatches([{ evidenceId: 'self', fileUrl }], trimmedQuery);
    for (const m of matches) {
      const matchKey = `${m.pageIndex}:${m.itemIndex}:${m.charStart}`;
      const isActive = matchKey === activeKey;
      for (const seg of m.segments) {
        const k = `${m.pageIndex}:${seg.itemIndex}`;
        const list = map.get(k) ?? [];
        list.push({ matchKey, segStart: seg.charStart, segEnd: seg.charEnd, isActive });
        map.set(k, list);
      }
    }
    for (const list of map.values()) list.sort((a, b) => a.segStart - b.segStart);
    return map;
  }, [textIndexReady, fileUrl, trimmedQuery, activeKey]);

  const textRenderer = React.useCallback(
    ({ str, itemIndex, pageNumber }: { str: string; itemIndex: number; pageNumber: number }) => {
      const pageIndex = pageNumber - 1;
      const segs = itemSegments.get(`${pageIndex}:${itemIndex}`);
      if (!segs || segs.length === 0) return escapeHtml(str);
      let out = '';
      let cursor = 0;
      for (const seg of segs) {
        if (seg.segStart > cursor) out += escapeHtml(str.slice(cursor, seg.segStart));
        const bg = seg.isActive ? ACTIVE_HIGHLIGHT_BG : HIGHLIGHT_BG;
        const outline = seg.isActive ? 'outline:2px solid #d97706;' : '';
        out += `<mark data-match-key="${seg.matchKey}" style="background:${bg};color:inherit;border-radius:2px;padding:0 1px;${outline}">${escapeHtml(str.slice(seg.segStart, seg.segEnd))}</mark>`;
        cursor = seg.segEnd;
      }
      if (cursor < str.length) out += escapeHtml(str.slice(cursor));
      return out;
    },
    [itemSegments],
  );

  const handleLoadSuccess = React.useCallback(
    ({ numPages }: { numPages: number }) => {
      onTotalPagesChange(numPages);
      setError(null);
    },
    [onTotalPagesChange],
  );

  const handlePageRenderSuccess = React.useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const pageEl = wrapper.querySelector<HTMLElement>('.react-pdf__Page');
    if (pageEl) onContentHeightChange?.(pageEl.offsetHeight);
    if (activeKey) {
      const node = wrapper.querySelector<HTMLElement>(
        `mark[data-match-key="${CSS.escape(activeKey)}"]`,
      );
      if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeKey, onContentHeightChange]);

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        backgroundColor: '#1c1c1e',
      }}
    >
      {error ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: 24, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          {error}
        </div>
      ) : (
        <Document
          file={fileUrl}
          onLoadSuccess={handleLoadSuccess}
          onLoadError={(err: Error) => setError(`Failed to load document: ${err.message}`)}
          loading={
            <div style={{ color: '#9ca3af', fontSize: 13, padding: 24, fontFamily: "'IBM Plex Sans', sans-serif" }}>
              Loading PDF…
            </div>
          }
        >
          {width > 0 && (
            <Page
              pageNumber={page}
              width={Math.max(200, width - 48)}
              renderAnnotationLayer={false}
              renderTextLayer
              customTextRenderer={textRenderer}
              onRenderSuccess={handlePageRenderSuccess}
            />
          )}
        </Document>
      )}
    </div>
  );
}
