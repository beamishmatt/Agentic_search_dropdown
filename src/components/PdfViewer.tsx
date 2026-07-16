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

// Hover magnifier — a circular lens that samples the rendered page canvas and
// draws a zoomed region to heighten readability of dense document text.
const MAGNIFIER_SIZE = 180; // lens diameter in CSS px
const MAGNIFIER_ZOOM = 2.2; // magnification relative to the displayed page

// Render the page canvas at a higher pixel ratio so the magnifier has real
// detail to sample instead of upscaling a display-resolution bitmap (which
// looks blurry through the lens). Capped to keep canvas memory bounded.
const BASE_PIXEL_RATIO = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
const RENDER_PIXEL_RATIO = Math.min(BASE_PIXEL_RATIO * MAGNIFIER_ZOOM, 5);

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
  const lensRef = React.useRef<HTMLCanvasElement | null>(null);
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

  // Magnifier: sample the page canvas around the cursor and paint a zoomed,
  // circular preview. Driven entirely through refs/direct DOM writes so moving
  // the pointer never re-renders the (expensive) Document/Page tree.
  const handleMagnifierMove = React.useCallback((e: React.MouseEvent) => {
    const wrapper = wrapperRef.current;
    const lens = lensRef.current;
    if (!wrapper || !lens) return;
    const canvas = wrapper.querySelector<HTMLCanvasElement>('.react-pdf__Page canvas');
    if (!canvas) { lens.style.display = 'none'; return; }

    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) {
      lens.style.display = 'none';
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    // The page canvas is usually rendered at a higher intrinsic resolution than
    // its displayed size — map cursor (display px) into source (intrinsic px).
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const target = Math.round(MAGNIFIER_SIZE * dpr);
    if (lens.width !== target) { lens.width = target; lens.height = target; }
    const ctx = lens.getContext('2d');
    if (!ctx) return;

    // Region of the displayed page the lens covers, converted to source px.
    const srcDisplay = MAGNIFIER_SIZE / MAGNIFIER_ZOOM;
    const sw = srcDisplay * scaleX;
    const sh = srcDisplay * scaleY;
    const sx = cx * scaleX - sw / 2;
    const sy = cy * scaleY - sh / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lens.width, lens.height);
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, lens.width, lens.height);

    // Re-create the search highlights inside the lens. The canvas only holds the
    // rendered glyphs; the yellow tint lives in the text-layer <mark> elements, so
    // map each mark's screen rect into lens space and paint it back on top.
    const marks = wrapper.querySelectorAll<HTMLElement>('.react-pdf__Page mark');
    if (marks.length > 0) {
      const kx = lens.width / sw;   // source px -> lens px
      const ky = lens.height / sh;
      for (const mark of marks) {
        const mr = mark.getBoundingClientRect();
        // Mark rect in source (intrinsic) px, relative to the page canvas.
        const mx = (mr.left - rect.left) * scaleX;
        const my = (mr.top - rect.top) * scaleY;
        const mw = mr.width * scaleX;
        const mh = mr.height * scaleY;
        // Skip marks outside the sampled region.
        if (mx + mw < sx || mx > sx + sw || my + mh < sy || my > sy + sh) continue;
        ctx.fillStyle = mark.dataset.matchKey === activeKey ? ACTIVE_HIGHLIGHT_BG : HIGHLIGHT_BG;
        ctx.fillRect((mx - sx) * kx, (my - sy) * ky, mw * kx, mh * ky);
      }
    }

    lens.style.left = `${e.clientX - MAGNIFIER_SIZE / 2}px`;
    lens.style.top = `${e.clientY - MAGNIFIER_SIZE / 2}px`;
    lens.style.display = 'block';
  }, [activeKey]);

  const handleMagnifierLeave = React.useCallback(() => {
    if (lensRef.current) lensRef.current.style.display = 'none';
  }, []);

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
    <>
    <div
      ref={wrapperRef}
      onMouseMove={handleMagnifierMove}
      onMouseLeave={handleMagnifierLeave}
      style={{
        width: '100%',
        height: '100%',
        overflowX: 'hidden',
        overflowY: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        backgroundColor: '#1c1c1e',
        cursor: 'zoom-in',
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
              width={Math.max(200, width)}
              devicePixelRatio={RENDER_PIXEL_RATIO}
              renderAnnotationLayer={false}
              renderTextLayer
              customTextRenderer={textRenderer}
              onRenderSuccess={handlePageRenderSuccess}
            />
          )}
        </Document>
      )}
    </div>
    {/* Magnifier lens — position/size/visibility set imperatively on mousemove */}
    <canvas
      ref={lensRef}
      style={{
        position: 'fixed',
        display: 'none',
        width: MAGNIFIER_SIZE,
        height: MAGNIFIER_SIZE,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.9)',
        boxShadow: '0 6px 22px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
    />
    </>
  );
}
