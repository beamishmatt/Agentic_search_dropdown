import React from 'react';
import { useParams } from 'react-router-dom';
import { getContextGraph } from '../../storage/config';
import { GraphNode } from '../../data/types';
import { PdfViewer } from '../PdfViewer';
import { SyntheticMap } from '../SyntheticMap';
import {
  ChevronDown,
  User,
  FileText,
  Users,
  Calendar,
  MapPin,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Image,
  Video,
  File,
} from 'lucide-react';

function MediaPlaceholder({
  node,
  searchQuery,
  page,
  onTotalPagesChange,
}: {
  node: GraphNode;
  searchQuery: string;
  page: number;
  onTotalPagesChange: (n: number) => void;
}) {
  const isImage = node.media_class === 'image';
  const isVideo = node.media_class === 'video';
  const isDoc = ['pdf', 'document', 'text'].includes(node.media_class);
  const isPdf = node.media_class === 'pdf' || (node.fileUrl?.toLowerCase().endsWith('.pdf') ?? false);

  if (isDoc && node.fileUrl && isPdf) {
    return (
      <PdfViewer
        fileUrl={node.fileUrl}
        searchQuery={searchQuery}
        page={page}
        onTotalPagesChange={onTotalPagesChange}
      />
    );
  }

  if (isDoc && node.fileUrl) {
    return (
      <iframe
        src={`${node.fileUrl}#toolbar=0&navpanes=0`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title={node.title}
      />
    );
  }

  if (node.thumbnailUrl) {
    return (
      <img
        src={node.thumbnailUrl}
        alt={node.title}
        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
      />
    );
  }

  const Icon = isImage ? Image : isVideo ? Video : FileText;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <Icon size={48} style={{ color: '#4b5563', opacity: 0.6 }} />
      <span style={{ fontSize: 13, color: '#6b7280', fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {node.title}
      </span>
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ color: 'var(--text-weak)', marginTop: 2, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, color: 'var(--text-weak)', margin: '0 0 2px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
          {label}
        </p>
        <p style={{ fontSize: 13, color: 'var(--foreground)', margin: 0, fontFamily: "'IBM Plex Sans', sans-serif", wordBreak: 'break-word' }}>
          {value}
        </p>
      </div>
      {action && (
        <div style={{ flexShrink: 0, marginTop: 2 }}>{action}</div>
      )}
    </div>
  );
}

function EditButton() {
  return (
    <button
      style={{
        fontSize: 12,
        color: 'var(--text-weak)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0 2px',
        fontFamily: "'IBM Plex Sans', sans-serif",
        transition: 'color 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--foreground)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-weak)')}
    >
      Edit
    </button>
  );
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: 'none',
        backgroundColor: enabled ? '#111827' : '#d1d5db',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background-color 0.2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: enabled ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: '#fff',
          transition: 'left 0.2s',
          display: 'block',
        }}
      />
    </button>
  );
}

export function SearchEvidenceDetailPage() {
  const { evidenceId } = useParams<{ evidenceId: string }>();
  const [activeTab, setActiveTab] = React.useState<'document' | 'saved'>('document');
  const [aiEnabled, setAiEnabled] = React.useState(true);
  const [overviewOpen, setOverviewOpen] = React.useState(true);
  const [docSearch, setDocSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [isNarrow, setIsNarrow] = React.useState(false);

  React.useEffect(() => {
    setPage(p => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsNarrow(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const graph = getContextGraph();
  const node: GraphNode | undefined = evidenceId ? graph.nodes[evidenceId] : undefined;
  const location = node ? graph.cases[node.case_id]?.location : undefined;

  const formattedDate = node?.date_recorded
    ? new Date(node.date_recorded).toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : 'N/A';

  const aiSummary = node?.description
    ? node.description
    : 'No AI summary available for this evidence item.';

  if (!node) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--sunken)',
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontSize: 14,
          color: 'var(--text-weak)',
        }}
      >
        Evidence not found.
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: isNarrow ? 'column' : 'row',
        backgroundColor: 'var(--sunken)',
        padding: 12,
        gap: 12,
        overflow: isNarrow ? 'auto' : 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Left: Viewer ─────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 10,
          overflow: 'hidden',
          backgroundColor: '#1c1c1e',
          minWidth: 0,
          minHeight: isNarrow ? 300 : 0,
        }}
      >
        {/* Document content area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            padding: 24,
          }}
        >
          <MediaPlaceholder
            node={node}
            searchQuery={docSearch}
            page={page}
            onTotalPagesChange={setTotalPages}
          />
        </div>

        {/* Page controls */}
        <div
          style={{
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              background: 'none',
              border: 'none',
              cursor: page > 1 ? 'pointer' : 'default',
              color: page > 1 ? '#9ca3af' : '#374151',
              display: 'flex',
              alignItems: 'center',
              padding: '0 4px',
            }}
          >
            <ChevronLeft size={16} />
          </button>

          <span style={{ fontSize: 13, color: '#9ca3af', fontFamily: "'IBM Plex Sans', sans-serif" }}>
            {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              background: 'none',
              border: 'none',
              cursor: page < totalPages ? 'pointer' : 'default',
              color: page < totalPages ? '#9ca3af' : '#374151',
              display: 'flex',
              alignItems: 'center',
              padding: '0 4px',
            }}
          >
            <ChevronRight size={16} />
          </button>

          <div style={{ width: 1, height: 16, backgroundColor: '#374151', margin: '0 4px' }} />

          <button
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: '#9ca3af',
              fontSize: 13,
              fontFamily: "'IBM Plex Sans', sans-serif",
              padding: '0 4px',
            }}
          >
            {totalPages} {totalPages === 1 ? 'page' : 'pages'}
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* ── Right: Overview Panel ─────────────────────────────── */}
      <div
        style={{
          width: isNarrow ? '100%' : 300,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 10,
          overflow: 'hidden',
          backgroundColor: 'var(--raised)',
          border: '1px solid var(--border)',
          maxHeight: isNarrow ? 400 : undefined,
        }}
      >
        {/* Overview header */}
        <button
          onClick={() => setOverviewOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            cursor: 'pointer',
            width: '100%',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', fontFamily: "'IBM Plex Sans', sans-serif" }}>
              Overview
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-weak)',
                fontFamily: "'IBM Plex Sans', sans-serif",
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 220,
              }}
            >
              {node.title}
            </span>
          </div>
          <ChevronDown
            size={14}
            style={{
              color: 'var(--text-weak)',
              transform: overviewOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.15s',
              flexShrink: 0,
            }}
          />
        </button>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {overviewOpen && (
            <div style={{ padding: '0 16px' }}>
              {/* Lead user */}
              <MetaRow
                icon={<User size={14} />}
                label="Lead user"
                value={node.officer || 'Unassigned'}
                action={<EditButton />}
              />

              {/* Filename */}
              <MetaRow
                icon={<File size={14} />}
                label="File"
                value={node.title}
              />

              {/* Assignees */}
              <MetaRow
                icon={<Users size={14} />}
                label="Assignees"
                value={node.officer ? node.officer : 'No assignees'}
                action={<EditButton />}
              />

              {/* Recorded on */}
              <MetaRow
                icon={<Calendar size={14} />}
                label="Recorded on"
                value={formattedDate}
                action={<EditButton />}
              />

              {/* Location */}
              <MetaRow
                icon={<MapPin size={14} />}
                label="Location"
                value={location?.label || node.scene_type || 'No location added'}
                action={
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0 2px',
                      color: 'var(--text-weak)',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'color 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--foreground)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-weak)')}
                  >
                    <Plus size={13} />
                  </button>
                }
              />

              {/* Location map — a single pin at this evidence's incident place */}
              {location && (
                <div style={{ height: 180, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginTop: 4 }}>
                  <SyntheticMap
                    points={[{ id: node.id, x: location.x, y: location.y, label: location.label, selected: true }]}
                    district={location.district}
                  />
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
              marginTop: overviewOpen ? 4 : 0,
            }}
          >
            {(['document', 'saved'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid var(--foreground)' : '2px solid transparent',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: activeTab === tab ? 600 : 400,
                  color: activeTab === tab ? 'var(--foreground)' : 'var(--text-weak)',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  textTransform: 'capitalize',
                  transition: 'color 0.1s',
                  marginBottom: -1,
                }}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Document tab content */}
          {activeTab === 'document' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px', gap: 16 }}>
              {/* Search within document */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--fill-weak)',
                }}
              >
                <Search size={13} style={{ color: 'var(--text-weak)', flexShrink: 0 }} />
                <input
                  value={docSearch}
                  onChange={e => setDocSearch(e.target.value)}
                  placeholder="Search in document..."
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    fontSize: 12,
                    color: 'var(--foreground)',
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                />
              </div>

              {/* AI Summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--foreground)',
                      fontFamily: "'IBM Plex Sans', sans-serif",
                    }}
                  >
                    AI Summary
                  </span>
                  <Toggle enabled={aiEnabled} onToggle={() => setAiEnabled(v => !v)} />
                </div>

                {aiEnabled && (
                  <>
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--text-weak)',
                        margin: 0,
                        fontFamily: "'IBM Plex Sans', sans-serif",
                      }}
                    >
                      AI generated summary
                    </p>
                    <AiSummaryText text={aiSummary} />
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'saved' && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
              }}
            >
              <p style={{ fontSize: 13, color: 'var(--text-weak)', margin: 0, fontFamily: "'IBM Plex Sans', sans-serif", textAlign: 'center' }}>
                No saved items yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AiSummaryText({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const TRUNCATE = 180;
  const isLong = text.length > TRUNCATE;
  const display = expanded || !isLong ? text : text.slice(0, TRUNCATE) + '…';

  return (
    <div>
      <p
        style={{
          fontSize: 12,
          color: 'var(--foreground)',
          margin: '0 0 6px',
          lineHeight: 1.6,
          fontFamily: "'IBM Plex Sans', sans-serif",
        }}
      >
        {display}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            fontSize: 12,
            color: 'var(--text-weak)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontFamily: "'IBM Plex Sans', sans-serif",
            textDecoration: 'underline',
            transition: 'color 0.1s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--foreground)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-weak)')}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
