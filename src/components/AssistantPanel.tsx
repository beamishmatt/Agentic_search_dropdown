import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, ChevronDown, Clock, CircleCheck, FileText, X, Copy, Check, Tag, RefreshCw, ShieldCheck, Pencil, Lightbulb } from 'lucide-react';
import { PromptInput, PromptInputTextarea, PromptInputActions } from './ui/prompt-input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { chatWithEvidenceStream, ChatMessage } from '../engine/assistantChat';
import { AgentAction, AgentActionType, MetadataEdit } from '../data/types';
import { DraftReport, parseDraft, DRAFT_PANEL_WIDTH } from '../utils/draftUtils';

// ─── Action parsing ───────────────────────────────────────────────────────────

const ACTION_RE = /<action\s+type="([^"]+)"\s+items="([^"]+)"\s+value="([^"]+)"\s*\/>/g;

export function parseActions(content: string): { content: string; actions: AgentAction[] } {
  const actions: AgentAction[] = [];
  const cleaned = content.replace(ACTION_RE, (_, type, items, value) => {
    actions.push({
      type: type as AgentActionType,
      item_ids: items.split(',').map((s: string) => s.trim()).filter(Boolean),
      value,
    });
    return '';
  }).trim();
  return { content: cleaned, actions };
}

/** Strip action tags (complete or partial) from content during streaming */
export function stripActionTags(content: string): string {
  return content
    .replace(ACTION_RE, '')
    .replace(/<action\s[^>]*$/, '') // partial tag at end of stream
    .trim();
}

// ─── Action card ─────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<AgentActionType, string> = {
  set_category: 'Set category',
  set_status: 'Set status',
  add_tag: 'Add tag',
  add_to_case: 'Add to case',
};

function ActionCard({
  action,
  onApply,
  onDismiss,
  status,
}: {
  action: AgentAction;
  onApply: () => void;
  onDismiss: () => void;
  status: 'pending' | 'applied' | 'dismissed';
}) {
  if (status === 'dismissed') return null;

  const label = ACTION_LABELS[action.type] ?? action.type;
  const itemCount = action.item_ids.length;

  return (
    <div
      style={{
        marginTop: 8,
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '9px 12px',
        backgroundColor: status === 'applied' ? 'var(--fill-weaker)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
      }}
    >
      {status === 'applied' ? (
        <Check size={13} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
      ) : action.type === 'add_tag' ? (
        <Tag size={13} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
      ) : (
        <RefreshCw size={13} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {status === 'applied'
            ? `${label} → "${action.value}" applied`
            : `${label} → "${action.value}"`}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 1 }}>
          {status === 'applied'
            ? `Applied to ${itemCount} item${itemCount !== 1 ? 's' : ''}`
            : `${itemCount} item${itemCount !== 1 ? 's' : ''} selected`}
        </div>
      </div>

      {status === 'pending' && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onDismiss}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--muted-foreground)',
              fontSize: 11,
              fontWeight: 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Dismiss
          </button>
          <button
            onClick={onApply}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--fill-strong)',
              backgroundColor: 'var(--fill-strong)',
              color: 'var(--text-inverse-strong)',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── Tool call card ───────────────────────────────────────────────────────────

export interface ToolCall {
  name: string;
  label: string;
  description: string;
  input: Record<string, string>;
  status: 'pending' | 'approved' | 'denied';
  successLabel?: string;
}

export function ToolCallCard({
  toolCall,
  onApprove,
  onDeny,
}: {
  toolCall: ToolCall;
  onApprove: () => void;
  onDeny: () => void;
}) {
  if (toolCall.status === 'denied') return null;
  const isPending = toolCall.status === 'pending';
  const isApproved = toolCall.status === 'approved';

  return (
    <div
      style={{
        marginTop: 10,
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: isApproved ? 'var(--fill-weaker)' : '#ffffff',
      }}
    >
      {/* Card header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: isPending ? '1px solid var(--border)' : 'none',
          backgroundColor: 'var(--fill-weaker)',
        }}
      >
        <ShieldCheck size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', flex: 1 }}>
          {isApproved ? (toolCall.successLabel ?? 'Permission enabled') : 'Approval required'}
        </span>
        {isApproved && (
          <Check size={12} style={{ color: 'var(--muted-foreground)' }} />
        )}
      </div>

      {/* Card body */}
      {isPending && (
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--foreground)', marginBottom: 3 }}>
            {toolCall.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 10, lineHeight: 1.5 }}>
            {toolCall.description}
          </div>

          {/* Arguments */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 24 }}>
            {Object.entries(toolCall.input).map(([k, v]) => (
              <span
                key={k}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  borderRadius: 99,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--fill-weaker)',
                  overflow: 'hidden',
                }}
              >
                <span style={{ padding: '1px 6px', color: 'var(--muted-foreground)', fontFamily: 'monospace', borderRight: '1px solid var(--border)', fontSize: 11 }}>{k}</span>
                <span style={{ padding: '1px 6px', color: 'var(--foreground)', fontWeight: 500, fontSize: 11 }}>{v}</span>
              </span>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onDeny}
              style={{
                flex: 1,
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                backgroundColor: 'transparent',
                color: 'var(--muted-foreground)',
                fontSize: 11,
                fontWeight: 400,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Deny
            </button>
            <button
              onClick={onApprove}
              style={{
                flex: 1,
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--fill-strong)',
                backgroundColor: 'var(--fill-strong)',
                color: 'var(--text-inverse-strong)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Approve
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── Metadata edit card ───────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  category: 'Category',
  status: 'Status',
  description: 'Description',
  officer: 'Officer',
  title: 'Title',
  tags: 'Tag',
};

export const METADATA_EDIT_RE = /<metadata_edit\s+evidence_id="([^"]+)"\s+field="([^"]+)"\s+value="([^"]+)"\s*\/>/g;

export function parseMetadataEdits(content: string, getTitle?: (id: string) => string | undefined): { content: string; edits: Omit<MetadataEdit, 'status'>[] } {
  const edits: Omit<MetadataEdit, 'status'>[] = [];
  const idxRef = { n: 0 };
  const cleaned = content.replace(METADATA_EDIT_RE, (_, evidenceId, field, value) => {
    edits.push({
      id: `medit-${Date.now()}-${idxRef.n++}`,
      evidence_id: evidenceId,
      evidence_title: getTitle?.(evidenceId),
      field,
      new_value: value,
    });
    return '';
  }).trim();
  return { content: cleaned, edits };
}

export function stripMetadataEditTags(content: string): string {
  return content
    .replace(METADATA_EDIT_RE, '')
    .replace(/<metadata_edit\s[^>]*$/, '')
    .trim();
}

export function MetadataEditCard({
  edit,
  onApply,
  onDismiss,
}: {
  edit: MetadataEdit;
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (edit.status === 'dismissed') return null;

  const isPending = edit.status === 'pending';
  const isApplied = edit.status === 'applied';
  const fieldLabel = FIELD_LABELS[edit.field] ?? edit.field;

  return (
    <div
      style={{
        marginTop: 10,
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--fill-weaker)',
        }}
      >
        {isApplied
          ? <Check size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          : <Pencil size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
        }
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', flex: 1 }}>
          {isApplied ? 'Edit applied' : 'Edit confirmation required'}
        </span>
      </div>

      {/* Body — shown for both pending and applied */}
      <div style={{ padding: '10px 12px', backgroundColor: isApplied ? 'var(--fill-weaker)' : '#ffffff' }}>
        {edit.evidence_title && (
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {edit.evidence_title}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: isPending ? 14 : 0, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 99,
              border: '1px solid var(--border)',
              backgroundColor: 'var(--fill-weaker)',
              overflow: 'hidden',
            }}
          >
            <span style={{ padding: '2px 7px', color: 'var(--muted-foreground)', fontFamily: 'monospace', borderRight: '1px solid var(--border)', fontSize: 11 }}>
              {fieldLabel}
            </span>
            <span style={{ padding: '2px 7px', color: 'var(--foreground)', fontWeight: 500, fontSize: 11 }}>
              {edit.new_value}
            </span>
          </span>
          {edit.current_value && edit.field !== 'tags' && (
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              was: {edit.current_value}
            </span>
          )}
        </div>

        {isPending && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onDismiss}
              style={{
                flex: 1,
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                backgroundColor: 'transparent',
                color: 'var(--muted-foreground)',
                fontSize: 11,
                fontWeight: 400,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Dismiss
            </button>
            <button
              onClick={onApply}
              style={{
                flex: 1,
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid var(--fill-strong)',
                backgroundColor: 'var(--fill-strong)',
                color: 'var(--text-inverse-strong)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Feature request ─────────────────────────────────────────────────────────

export function parseFeatureRequest(content: string): { title: string; description: string } | null {
  const re = /<feature_request\b[^>]*\/>/i;
  const tagMatch = re.exec(content);
  if (!tagMatch) return null;
  const titleMatch = /title="([^"]+)"/.exec(tagMatch[0]);
  const descMatch = /description="([^"]+)"/.exec(tagMatch[0]);
  if (!titleMatch || !descMatch) return null;
  return { title: titleMatch[1], description: descMatch[1] };
}

export function stripFeatureRequestTags(content: string): string {
  const OPEN = '<feature_request';
  const CLOSE = '/>';
  let result = content;
  let start = result.indexOf(OPEN);
  while (start !== -1) {
    const end = result.indexOf(CLOSE, start);
    if (end === -1) {
      result = result.slice(0, start);
      break;
    }
    result = result.slice(0, start) + result.slice(end + CLOSE.length);
    start = result.indexOf(OPEN);
  }
  return result.trim();
}

export function FeatureRequestCard({ title, description }: { title: string; description: string }) {
  const [submitted, setSubmitted] = React.useState(false);

  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--fill-weaker)' }}>
        <Lightbulb size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)', flex: 1 }}>Feature request</span>
        {submitted && <Check size={12} style={{ color: 'var(--muted-foreground)' }} />}
      </div>
      <div style={{ padding: '10px 12px', backgroundColor: submitted ? 'var(--fill-weaker)' : '#ffffff' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5, marginBottom: submitted ? 0 : 12 }}>{description}</div>
        {!submitted && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setSubmitted(true)}
              style={{
                flex: 1, padding: '5px 10px', borderRadius: 6,
                border: '1px solid var(--fill-strong)', backgroundColor: 'var(--fill-strong)',
                color: 'var(--text-inverse-strong)', fontSize: 11, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Submit request
            </button>
          </div>
        )}
        {submitted && (
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>Request submitted — thanks for the feedback.</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────


interface ReportType {
  id: string;
  label: string;
  prompt: string;
}

const REPORT_TYPES: ReportType[] = [
  { id: 'incident_summary', label: 'Incident Summary', prompt: 'Write an Incident Summary report for the selected evidence.' },
  { id: 'chain_of_custody', label: 'Chain of Custody', prompt: 'Write a Chain of Custody report documenting the handling and movement of the selected evidence.' },
  { id: 'officer_activity', label: 'Officer Activity', prompt: 'Write an Officer Activity report detailing officer involvement based on the selected evidence.' },
  { id: 'case_timeline', label: 'Case Timeline', prompt: 'Write a Case Timeline report reconstructing the chronological sequence of events from the selected evidence.' },
  { id: 'evidence_inventory', label: 'Evidence Inventory', prompt: 'Write a detailed Evidence Inventory report cataloguing all selected evidence items.' },
];

const REPORT_REQUEST_RE = /\b(draft|report)\b/i;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  sources?: AssistantItem[];
  draft?: DraftReport;
  parsedActions?: AgentAction[];
  toolCall?: ToolCall;
  reportChips?: boolean;
  featureRequest?: { title: string; description: string };
}

export interface AssistantItem {
  id: string;
  title: string;
  vector_file_id?: string;
  description?: string;
  category?: string;
  officer?: string;
  date_recorded?: string;
  media_class?: string;
  objects_detected?: string;
}

interface AssistantPanelProps {
  isOpen: boolean;
  items: AssistantItem[];
  onClose: () => void;
  onAction?: (action: AgentAction) => void;
}

function SendButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="Send message"
      style={{
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        backgroundColor: disabled ? 'var(--fill-weak)' : 'var(--fill-strong)',
        color: disabled ? 'var(--muted-foreground)' : 'var(--text-inverse-strong)',
        transition: 'background-color 150ms, color 150ms',
        flexShrink: 0,
      }}
    >
      <ArrowUp size={14} />
    </button>
  );
}

function transformCitations(content: string): string {
  return content.replace(/\[(EV-[A-Z0-9]+)\]/g, '`[$1]`');
}

function CitationMark({ num, label }: { num: number; label: string }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <sup
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted-foreground)', marginLeft: 1, cursor: 'default' }}
      >
        {num}
      </sup>
      {visible && (
        <span style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: 4,
          whiteSpace: 'nowrap',
          backgroundColor: '#1a1a1a',
          color: '#fff',
          fontSize: 11,
          fontWeight: 400,
          padding: '4px 8px',
          borderRadius: 5,
          pointerEvents: 'none',
          zIndex: 50,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          {label}
        </span>
      )}
    </span>
  );
}


function parseThinking(raw: string): { thinking: string; content: string } {
  const OPEN = '<thinking>';
  const CLOSE = '</thinking>';
  const openIdx = raw.indexOf(OPEN);
  if (openIdx === -1) return { thinking: '', content: raw };
  const preamble = raw.slice(0, openIdx);
  const closeIdx = raw.indexOf(CLOSE, openIdx);
  if (closeIdx === -1) {
    // Still inside thinking block — don't show content yet
    return { thinking: raw.slice(openIdx + OPEN.length), content: preamble };
  }
  const thinking = raw.slice(openIdx + OPEN.length, closeIdx);
  const after = raw.slice(closeIdx + CLOSE.length).replace(/^\n+/, '');
  return { thinking, content: (preamble + after).replace(/^\n+/, '') };
}


export function DraftCard({ title, onOpen }: { title: string; onOpen: () => void }) {
  return (
    <div
      style={{
        marginTop: 10,
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '9px 12px',
        backgroundColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
      }}
    >
      <FileText size={13} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 1, fontWeight: 400 }}>Draft report</div>
      </div>
      <button
        onClick={onOpen}
        style={{
          flexShrink: 0,
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          backgroundColor: 'transparent',
          color: 'var(--muted-foreground)',
          fontSize: 11,
          fontWeight: 400,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Open
      </button>
    </div>
  );
}


export function DraftDrawer({ draft, open, onClose }: { draft: DraftReport | null; open: boolean; onClose: () => void }) {
  const lastDraft = React.useRef<DraftReport | null>(draft);
  if (draft) lastDraft.current = draft;
  const displayDraft = draft ?? lastDraft.current;

  const [value, setValue] = React.useState(displayDraft?.body ?? '');
  const [editing, setEditing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (draft) setValue(draft.body);
  }, [draft?.body]);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!open && !displayDraft) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 450,
        display: open ? 'flex' : 'none',
        alignItems: 'stretch',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          width: '56%',
          maxWidth: 760,
          minWidth: 480,
          backgroundColor: 'var(--base)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <FileText size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
            Draft
          </span>
          {displayDraft && value !== displayDraft.body && (
            <button
              onClick={() => {/* persist handled by value state */}}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                backgroundColor: 'var(--fill-strong)',
                color: 'var(--text-inverse-strong)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Save
            </button>
          )}
          <button
            onClick={handleCopy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--muted-foreground)',
              fontSize: 12,
              fontWeight: 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={() => setEditing(e => !e)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              backgroundColor: 'transparent',
              color: 'var(--muted-foreground)',
              fontSize: 12,
              fontWeight: 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {editing ? 'Preview' : 'Edit'}
          </button>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
            }}
            aria-label="Close draft"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        {editing ? (
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              resize: 'none',
              border: 'none',
              outline: 'none',
              padding: '24px 28px',
              fontFamily: 'inherit',
              fontSize: 13,
              lineHeight: 1.75,
              color: 'var(--foreground)',
              backgroundColor: 'var(--base)',
              overflowY: 'auto',
            }}
          />
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px', color: 'var(--foreground)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 600, margin: '24px 0 8px', color: 'var(--foreground)' }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 600, margin: '16px 0 6px', color: 'var(--foreground)' }}>{children}</h3>,
                p: ({ children }) => <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.75, color: 'var(--foreground)' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ paddingLeft: 18, margin: '0 0 10px' }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ paddingLeft: 18, margin: '0 0 10px' }}>{children}</ol>,
                li: ({ children }) => <li style={{ fontSize: 13, lineHeight: 1.75, marginBottom: 4, color: 'var(--foreground)' }}>{children}</li>,
                strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--foreground)' }}>{children}</strong>,
                hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />,
                blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--border-strong)', paddingLeft: 12, margin: '0 0 10px', color: 'var(--muted-foreground)' }}>{children}</blockquote>,
                code: ({ children }) => <code style={{ fontFamily: 'monospace', fontSize: 12, backgroundColor: 'var(--fill-weak)', padding: '1px 5px', borderRadius: 3 }}>{children}</code>,
              }}
            >
              {value}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export function ThinkingBlock({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const [open, setOpen] = React.useState(false);

  const blankIdx = content.indexOf('\n\n');
  const summary = blankIdx !== -1 ? content.slice(0, blankIdx).trim() : '';
  const body = blankIdx !== -1 ? content.slice(blankIdx + 2) : content;
  const headerLabel = summary || (isStreaming ? 'Thinking…' : 'Reasoning');

  const mutedText: React.CSSProperties = {
    color: 'var(--muted-foreground)',
    fontSize: '12px',
    lineHeight: 1.5,
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} style={{ marginBottom: 12 }}>
      <CollapsibleTrigger
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
          textAlign: 'left',
          width: '100%',
          ...mutedText,
        }}
      >
        {isStreaming && (
          <style>{`
            @keyframes thinking-shimmer {
              0% { background-position: -200% center; }
              100% { background-position: 200% center; }
            }
          `}</style>
        )}
        <span style={isStreaming ? {
          fontSize: '12px',
          background: 'linear-gradient(90deg, var(--muted-foreground) 25%, rgba(255,255,255,0.7) 50%, var(--muted-foreground) 75%)',
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'thinking-shimmer 1.8s linear infinite',
        } : { fontSize: '12px' }}>{headerLabel}</span>
        <ChevronDown
          size={10}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', flexShrink: 0 }}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'stretch' }}>
          {/* Icon rail with vertical line */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 13 }}>
            <Clock size={13} style={{ color: 'var(--muted-foreground)', flexShrink: 0, marginTop: 3 }} />
            {!isStreaming && (
              <>
                <div style={{ flex: 1, width: 1, backgroundColor: 'var(--border)', margin: '4px 0' }} />
                <CircleCheck size={13} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
              </>
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1 }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p style={{ margin: '0 0 6px', ...mutedText }}>{children}</p>,
                ul: ({ children }) => <ul style={{ paddingLeft: 16, margin: '0 0 6px', listStyleType: 'disc', ...mutedText }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ paddingLeft: 16, margin: '0 0 6px', listStyleType: 'decimal', ...mutedText }}>{children}</ol>,
                li: ({ children }) => <li style={{ marginBottom: 3, display: 'list-item', ...mutedText }}>{children}</li>,
                strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--muted-foreground)' }}>{children}</strong>,
                h1: ({ children }) => <div style={{ fontWeight: 600, margin: '6px 0 4px', ...mutedText }}>{children}</div>,
                h2: ({ children }) => <div style={{ fontWeight: 600, margin: '6px 0 4px', ...mutedText }}>{children}</div>,
                h3: ({ children }) => <div style={{ fontWeight: 600, margin: '4px 0 2px', ...mutedText }}>{children}</div>,
              }}
            >
              {body || (isStreaming ? '…' : '')}
            </ReactMarkdown>

            {!isStreaming && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>Done</span>
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const mdStyles: React.CSSProperties = {
  fontSize: 'var(--text-caption)',
  color: 'var(--foreground)',
  lineHeight: '1.65',
};

export function AssistantPanel({ isOpen, items, onClose, onAction }: AssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [openDraft, setOpenDraft] = useState<DraftReport | null>(null);
  const [actionStatuses, setActionStatuses] = useState<Record<string, 'pending' | 'applied' | 'dismissed'>>({});
  const [liveStreamId, setLiveStreamId] = useState<string | null>(null);
  const [liveStreamContent, setLiveStreamContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (items.length === 0) setMessages([]);
  }, [items.length]);

  const FACIAL_MATCH_WATCHLIST_RE = /facial.?match.*watchlist|watchlist.*facial.?match|enable.*watchlist|watchlist.*permiss/i;

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: trimmed };
    const assistantId = (Date.now() + 1).toString();

    if (REPORT_REQUEST_RE.test(trimmed)) {
      setMessages(prev => [...prev, userMessage, {
        id: assistantId,
        role: 'assistant',
        content: "What type of report would you like me to draft?",
        reportChips: true,
      }]);
      setInput('');
      return;
    }

    if (FACIAL_MATCH_WATCHLIST_RE.test(trimmed)) {
      const mockText = "Sure. To grant Administrators on Pro accounts the ability to create and edit facial match watchlists, I'll update the role permission configuration. Please review and approve the change below.";
      setMessages(prev => [...prev, userMessage, { id: assistantId, role: 'assistant', content: mockText }]);
      setInput('');
      setLiveStreamId(assistantId);
      setLiveStreamContent('');
      setIsLoading(true);

      (async () => {
        const chunkSize = 2;
        for (let i = chunkSize; i <= mockText.length; i += chunkSize) {
          await new Promise(resolve => setTimeout(resolve, 300));
          const partial = mockText.slice(0, i);
          console.log('[mock stream]', i, partial);
          setLiveStreamContent(partial);
        }
        setLiveStreamId(null);
        setLiveStreamContent('');
        setMessages(prev => prev.map(m => m.id === assistantId ? {
          ...m,
          toolCall: {
            name: 'set_permission',
            label: 'Enable: Create and Edit Facial Match Watchlist',
            description: 'Grants Administrators on Pro accounts the ability to create and edit facial recognition watchlists.',
            input: {
              permission: 'facial_match_watchlist.create_edit',
              role: 'Administrator',
              account_type: 'Pro',
              enabled: 'true',
            },
            status: 'pending' as const,
          },
        } : m));
        setIsLoading(false);
      })();
      return;
    }

    const history: ChatMessage[] = messages.map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMessage, { id: assistantId, role: 'assistant', content: '', thinking: '' }]);
    setInput('');
    setIsLoading(true);
    setStreamingId(assistantId);

    try {
      const raw = { current: '' };
      const sources = await chatWithEvidenceStream(trimmed, history, items, (chunk) => {
        raw.current += chunk;
        const { thinking, content: rawContent } = parseThinking(raw.current);
        const { content: postDraft, draft } = parseDraft(rawContent);
        const content = stripFeatureRequestTags(stripActionTags(postDraft));
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, thinking, content, draft: draft ?? m.draft } : m)
        );
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });

      // Parse action tags and feature requests from the final raw content
      const { thinking: finalThinking, content: finalRawContent } = parseThinking(raw.current);
      const { content: finalPostDraft, draft: finalDraft } = parseDraft(finalRawContent);
      const { content: finalContent, actions } = parseActions(finalPostDraft);
      const featureReq = parseFeatureRequest(finalPostDraft);
      const cleanFinalContent = stripFeatureRequestTags(finalContent);
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? {
          ...m,
          thinking: finalThinking,
          content: cleanFinalContent,
          draft: finalDraft ?? m.draft,
          parsedActions: actions.length > 0 ? actions : m.parsedActions,
          sources: sources.length > 0 ? sources : m.sources,
          ...(featureReq ? { featureRequest: featureReq } : {}),
        } : m)
      );
    } catch (err) {
      console.error('[handleSend] error:', err);
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, content: msg } : m)
      );
    } finally {
      setIsLoading(false);
      setStreamingId(null);
    }
  };

  const handleReportChipClick = async (reportType: ReportType) => {
    if (isLoading) return;
    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: reportType.label };
    const assistantId = (Date.now() + 1).toString();
    const history: ChatMessage[] = messages.map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMessage, { id: assistantId, role: 'assistant', content: '', thinking: '' }]);
    setIsLoading(true);
    setStreamingId(assistantId);

    try {
      const raw = { current: '' };
      const sources = await chatWithEvidenceStream(reportType.prompt, history, items, (chunk) => {
        raw.current += chunk;
        const { thinking, content: rawContent } = parseThinking(raw.current);
        const { content: postDraft, draft } = parseDraft(rawContent);
        const content = stripFeatureRequestTags(stripActionTags(postDraft));
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, thinking, content, draft: draft ?? m.draft } : m)
        );
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });

      const { thinking: finalThinking, content: finalRawContent } = parseThinking(raw.current);
      const { content: finalPostDraft, draft: finalDraft } = parseDraft(finalRawContent);
      const { content: finalContent, actions } = parseActions(finalPostDraft);
      const featureReq2 = parseFeatureRequest(finalPostDraft);
      const cleanFinalContent2 = stripFeatureRequestTags(finalContent);
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? {
          ...m,
          thinking: finalThinking,
          content: cleanFinalContent2,
          draft: finalDraft ?? m.draft,
          parsedActions: actions.length > 0 ? actions : m.parsedActions,
          sources: sources.length > 0 ? sources : m.sources,
          ...(featureReq2 ? { featureRequest: featureReq2 } : {}),
        } : m)
      );
    } catch (err) {
      console.error('[handleSend] error:', err);
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, content: msg } : m)
      );
    } finally {
      setIsLoading(false);
      setStreamingId(null);
    }
  };

  return (
    <div
      style={{
        flex: isOpen ? '0 0 480px' : '0 0 0px',
        overflow: 'hidden',
        borderLeft: isOpen ? '1px solid var(--border)' : '1px solid transparent',
        backgroundColor: isOpen ? 'var(--base)' : 'transparent',
        transition: 'flex-basis 400ms cubic-bezier(0, 0.74, 0, 1), border-color 400ms cubic-bezier(0, 0.74, 0, 1), background-color 400ms cubic-bezier(0, 0.74, 0, 1)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
      }}
    >
      <div
        style={{
          width: '480px',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: isOpen
            ? 'opacity 250ms cubic-bezier(0, 0.74, 0, 1) 250ms'
            : 'opacity 150ms cubic-bezier(0, 0.74, 0, 1)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8.70548 11.5171C9.05311 10.9168 9.89062 10.8351 10.3469 11.3592L14.057 15.6105C14.1006 15.6641 14.0852 15.7188 14.0725 15.7456C14.0598 15.7739 14.0257 15.8205 13.9537 15.8205H12.4807L12.4791 15.8238H1.5489C1.49404 15.8235 1.48044 15.7458 1.53263 15.7261L6.69295 13.8356C7.24254 13.635 7.70523 13.2467 7.9991 12.7394L8.70548 11.5171Z" fill="#36393D" fillOpacity="0.8"/>
            <path d="M18.3336 6.65708H16.2502V13.3238H18.3336V15.8238H15.8336L12.9169 10.4071V6.65708H10.8336V4.15708H18.3336V6.65708Z" fill="#36393D" fillOpacity="0.8"/>
            <path d="M6.47403 5.29803C6.5037 5.24717 6.58295 5.2814 6.56599 5.33791L5.59676 8.57603C5.39907 9.23574 5.48298 9.94767 5.82625 10.5438L6.5603 11.8182C6.87395 12.3636 6.62271 13.059 6.03214 13.2766L1.10701 15.0873L1.09155 15.0946C1.01949 15.1243 0.970064 15.0929 0.941807 15.0604C0.913621 15.0279 0.88838 14.9761 0.926345 14.9099L6.47403 5.29803Z" fill="#36393D" fillOpacity="0.8"/>
            <path d="M7.81355 4.06024C7.84463 4.05742 7.90459 4.06035 7.94132 4.12535L8.80395 5.62111H8.80558L13.3791 13.5443C13.4102 13.5965 13.3382 13.6476 13.2986 13.6029L10.5634 10.4673C10.0887 9.92195 9.40037 9.60956 8.677 9.60956H7.42781C6.74981 9.60935 6.26282 8.95544 6.45776 8.30422L7.70369 4.14895C7.72628 4.08013 7.78245 4.06314 7.81355 4.06024Z" fill="#36393D" fillOpacity="0.8"/>
          </svg>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => { setMessages([]); setInput(''); }}
            style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: 12, fontWeight: 500 }}
            aria-label="New chat"
          >
            New chat
          </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Greeting */}
          {messages.length === 0 && (
            <p style={mdStyles}>
              I've noticed you've selected {items.length} evidence {items.length === 1 ? 'item' : 'items'}. I can help you investigate or take action such as adding a category or adding the {items.length === 1 ? 'item' : 'items'} to a case.
            </p>
          )}

          {messages.map(msg =>
            msg.role === 'user' ? (
              <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#3a3a3a',
                    color: '#ffffff',
                    fontSize: 'var(--text-caption)',
                    lineHeight: '1.5',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={msg.id} style={{ ...mdStyles, minHeight: msg.content || msg.thinking ? undefined : '1em' }}>
                {(msg.thinking !== undefined || msg.id === streamingId) && (
                  <ThinkingBlock
                    content={msg.thinking ?? ''}
                    isStreaming={msg.id === streamingId && (!msg.content || !msg.draft)}
                  />
                )}
                {liveStreamId === msg.id ? (
                  <p style={{ margin: '0 0 8px', lineHeight: '1.65', fontSize: 'var(--text-caption)' }}>
                    {liveStreamContent}
                  </p>
                ) : null}
                {liveStreamId !== msg.id && msg.content ? (() => {
                  const sourcesMap = Object.fromEntries((msg.sources ?? []).map(s => [s.id, s]));
                  const citationOrder: string[] = [];
                  const citationIndex: Record<string, number> = {};
                  for (const [, id] of msg.content.matchAll(/\[(EV-[A-Z0-9]+)\]/g)) {
                    if (!(id in citationIndex)) {
                      citationIndex[id] = citationOrder.length + 1;
                      citationOrder.push(id);
                    }
                  }
                  return (
                    <>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: '1.65', fontSize: 'var(--text-caption)' }}>{children}</p>,
                          ul: ({ children }) => <ul style={{ paddingLeft: '18px', margin: '0 0 8px' }}>{children}</ul>,
                          ol: ({ children }) => <ol style={{ paddingLeft: '18px', margin: '0 0 8px' }}>{children}</ol>,
                          li: ({ children }) => <li style={{ marginBottom: '4px', fontSize: 'var(--text-caption)' }}>{children}</li>,
                          strong: ({ children }) => <strong style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--foreground)' }}>{children}</strong>,
                          h1: ({ children }) => <div style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 8px', paddingBottom: 6, borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>{children}</div>,
                          h2: ({ children }) => <div style={{ fontSize: 15, fontWeight: 600, margin: '16px 0 8px', paddingBottom: 6, borderBottom: '1px solid #e5e7eb' }}>{children}</div>,
                          h3: ({ children }) => <div style={{ fontSize: 14, fontWeight: 600, margin: '12px 0 6px', paddingBottom: 4, borderBottom: '1px solid #e5e7eb' }}>{children}</div>,
                          code: ({ children }) => {
                            const text = String(children);
                            const match = text.match(/^\[(EV-[A-Z0-9]+)\]$/);
                            if (match) {
                              const num = citationIndex[match[1]];
                              const src = sourcesMap[match[1]];
                              return <CitationMark num={num} label={src?.title ?? match[1]} />;
                            }
                            return <code style={{ fontFamily: 'monospace', fontSize: '12px', backgroundColor: 'var(--fill-weak)', padding: '1px 4px', borderRadius: '3px' }}>{children}</code>;
                          },
                          blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--border-strong)', paddingLeft: '10px', margin: '0 0 8px', color: 'var(--muted-foreground)' }}>{children}</blockquote>,
                          hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />,
                        }}
                      >
                        {transformCitations(msg.content)}
                      </ReactMarkdown>
                      {citationOrder.length > 0 && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          marginTop: 6,
                          fontSize: 10,
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: 99,
                          border: '1px solid var(--border)',
                          color: 'var(--muted-foreground)',
                          backgroundColor: 'transparent',
                        }}>
                          Sources {citationOrder.length}
                        </span>
                      )}
                      {msg.draft && (
                        <DraftCard
                          title={msg.draft.title}
                          onOpen={() => setOpenDraft(msg.draft!)}
                        />
                      )}
                      {msg.parsedActions && msg.parsedActions.map((action, i) => {
                        const key = `${msg.id}-action-${i}`;
                        return (
                          <ActionCard
                            key={key}
                            action={action}
                            status={actionStatuses[key] ?? 'pending'}
                            onApply={() => {
                              setActionStatuses(prev => ({ ...prev, [key]: 'applied' }));
                              onAction?.(action);
                            }}
                            onDismiss={() => {
                              setActionStatuses(prev => ({ ...prev, [key]: 'dismissed' }));
                            }}
                          />
                        );
                      })}
                      {msg.reportChips && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                          {REPORT_TYPES.map(rt => (
                            <button
                              key={rt.id}
                              onClick={() => handleReportChipClick(rt)}
                              disabled={isLoading}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '5px 11px', borderRadius: 99, cursor: isLoading ? 'default' : 'pointer',
                                fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                                border: '1px solid var(--border)',
                                backgroundColor: 'transparent',
                                color: 'var(--foreground)',
                                opacity: isLoading ? 0.5 : 1,
                                transition: 'background-color 0.1s',
                              }}
                              onMouseEnter={e => { if (!isLoading) e.currentTarget.style.backgroundColor = 'var(--fill-hover)'; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                              <FileText size={12} />
                              {rt.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {msg.toolCall && (
                        <ToolCallCard
                          toolCall={msg.toolCall}
                          onApprove={() => setMessages(prev => prev.map(m =>
                            m.id === msg.id && m.toolCall
                              ? { ...m, toolCall: { ...m.toolCall, status: 'approved' as const } }
                              : m
                          ))}
                          onDeny={() => setMessages(prev => prev.map(m =>
                            m.id === msg.id && m.toolCall
                              ? { ...m, toolCall: { ...m.toolCall, status: 'denied' as const } }
                              : m
                          ))}
                        />
                      )}
                      {msg.featureRequest && (
                        <FeatureRequestCard title={msg.featureRequest.title} description={msg.featureRequest.description} />
                      )}
                    </>
                  );
                })() : null}
              </div>
            )
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', flexShrink: 0 }}>
          <PromptInput value={input} onValueChange={setInput} onSubmit={handleSend} maxHeight={120}>
            <PromptInputTextarea />
            <PromptInputActions style={{ justifyContent: 'space-between' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--fill-weak)',
                  fontSize: '11px',
                  fontWeight: 'var(--font-weight-medium)',
                  color: 'var(--muted-foreground)',
                  whiteSpace: 'nowrap',
                }}
              >
                Evidence
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--fill-strong)',
                    color: 'var(--text-inverse-strong)',
                    fontSize: '10px',
                    fontWeight: 'var(--font-weight-semibold)',
                    lineHeight: 1,
                  }}
                >
                  {items.length}
                </span>
              </span>
              <SendButton onClick={handleSend} disabled={!input.trim() || isLoading} />
            </PromptInputActions>
          </PromptInput>
        </div>
      </div>

      {openDraft && (
        <DraftDrawer draft={openDraft} onClose={() => setOpenDraft(null)} />
      )}
    </div>
  );
}
