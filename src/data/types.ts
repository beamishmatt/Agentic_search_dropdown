// Case status options
export type CaseStatus = 'Active' | 'Closed' | 'Dismissed' | 'Deleted';

// Access class options
export type AccessClass = 'Unrestricted' | 'Restricted' | 'Confidential' | 'Secret';

// Evidence status options
export type EvidenceStatus = 'active' | 'deleted' | 'queued for deletion' | 'archived' | 'under review';

// Evidence file type options
export type FileType = 'video' | 'audio' | 'image' | 'zip' | 'other';

// Incident category options
export type Category = 'Assault' | 'Traffic Stop' | 'Homicide' | 'Theft' | 'Shooting' | 'Domestic' | 'Drug Offense' | 'Burglary' | 'Police Event' | 'Non Event' | 'Other';

// Case interface with all required metadata
export interface Case {
  caseId: string;
  owner: string;
  createdOn: Date;
  lastUpdatedOn: Date;
  status: CaseStatus;
  description: string;
  accessClass: AccessClass;
  isShared?: boolean; // Indicates if the case has been shared with partners
}

// Evidence interface with all required metadata
export interface Evidence {
  uuid: string; // Unique identifier for each evidence entry
  id: string;   // Case ID this evidence belongs to
  title: string;
  owner: string;
  uploadedBy: string;
  addedBy: string;
  uploadedOn: Date;
  recordedOn: Date;
  duration: string; // Format: "HH:MM:SS" or "N/A" for non-video content
  status: EvidenceStatus;
  fileType: FileType;
  category: Category;
  thumbnailUrl: string;
  location?: string;
  description?: string;
  source?: string;
  vector_file_id?: string;
  objects_detected?: ObjectDetected[];
}

// Detected object from vision analysis
export interface ObjectDetected {
  label: string;
  color: string | null;
  confidence: 'high' | 'medium' | 'low';
  position: string;
  count: number;
  make?: string;
  model?: string;
}

// --- Agentic engine types ---

export type MediaClass = 'video' | 'audio' | 'image' | 'document' | 'text' | 'pdf';

export interface GraphNode {
  id: string;
  title: string;
  media_class: MediaClass;
  mime_type: string;
  size: number;
  case_id: string;
  date_recorded: string;
  date_ingested: string;
  officer: string;
  category: string;
  source?: string;
  duration?: string | null;
  status: string;
  description?: string;
  objects_detected: ObjectDetected[];
  scene_type?: string;
  lighting?: string;
  people_count?: number;
  text_visible?: string;
  vector_file_id?: string;
  tags?: string[];
  video_processing?: string | null;
  thumbnailUrl?: string;
  fileUrl?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: 'same_case' | 'same_officer' | 'same_date' | 'referenced_in';
  metadata?: Record<string, unknown>;
}

// A normalized point on the fictional district map. x/y are 0–1 fractions of
// the stylized map surface (not real lat/lng); positions are meaningful and
// clustered by incident rather than hashed pseudo-randomly.
export interface GeoPoint {
  label: string;
  x: number;
  y: number;
  district?: string;
}

export interface CaseGraphMetadata {
  title: string;
  status: string;
  lead_officer: string;
  evidence_ids: string[];
  date_opened: string;
  // One incident location per case; nodes inherit it (with small jitter).
  location?: GeoPoint;
}

export interface ContextGraph {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
  cases: Record<string, CaseGraphMetadata>;
  metadata: {
    total_items: number;
    last_updated: string;
    media_breakdown: Record<string, number>;
  };
}

// Search engine output types
export type FilterChipType = 'officer' | 'date' | 'category' | 'file_type' | 'case' | 'location' | 'object';

export interface FilterChip {
  id: string;
  type: FilterChipType;
  label: string;
  value: string;
}

export type EntityResultType = 'case' | 'officer';

export interface EntityResult {
  type: EntityResultType;
  id: string;
  name: string;
  subtitle: string;
}

export interface SearchEvidenceResult {
  evidence_id: string;
  title: string;
  media_class: MediaClass;
  case_id: string;
  officer: string;
  category: string;
  relevance: string;
  excerpt?: string;
  confidence: 'high' | 'medium' | 'low';
  thumbnailUrl?: string;
  fileUrl?: string;
  objects_matched?: ObjectDetected[];
  related_evidence?: string[];
  date_recorded?: string;
  source?: string;
  location?: GeoPoint;
}

// ─── Omni search: cross-entity result union ──────────────────────────────────
// Search returns more than evidence. Every result kind shares a common envelope
// (kind/id/title/subtitle/relevance/deeplink) and carries its own typed payload.

export type ResultKind = 'evidence' | 'case' | 'person' | 'device' | 'setting' | 'capability';

export interface BaseResult {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle?: string;   // e.g. case status, person unit, setting area
  relevance: string;
  deeplink?: string;   // route clicking the result navigates to
}

export interface EvidenceResult extends BaseResult {
  kind: 'evidence';
  evidence: SearchEvidenceResult;
}

export interface CaseResult extends BaseResult {
  kind: 'case';
  status: string;
  owner: string;
  accessClass: string;
  leadOfficer: string;
  dateOpened: string;
  lastUpdated?: string;
  category?: string;
  evidenceCount: number;
}

export interface PersonResult extends BaseResult {
  kind: 'person';
  role: string;
  unit?: string;
  status: string;
  email?: string;
}

export interface DeviceResult extends BaseResult {
  kind: 'device';
  deviceType: string;
  assignedTo?: string;
  status: string;
  lastSeen?: string;
}

// Top-level admin nav groups, mirroring the Evidence.com admin settings nav.
export type AdminSection =
  | 'User Management'
  | 'Device Management'
  | 'Organization Settings'
  | 'Evidence Settings'
  | 'Application Settings';

export interface SettingResult extends BaseResult {
  kind: 'setting';
  section: AdminSection;   // admin nav group
  subsection: string;      // e.g. Roles & Permissions, Retention, Security
  description: string;
}

export interface CapabilityResult extends BaseResult {
  kind: 'capability';
  section: AdminSection;   // admin nav group the permission lives under
  roles: string[];
  enabled: boolean;
  description: string;
}

export type SearchResult =
  | EvidenceResult
  | CaseResult
  | PersonResult
  | DeviceResult
  | SettingResult
  | CapabilityResult;

export interface SearchOutput {
  summary: string;
  // A direct, AI-generated answer to a natural-language policy/procedure
  // question (e.g. "what is our policy for arresting someone with diplomatic
  // immunity"). Present only when the query is a question rather than a lookup.
  aiOverview?: string;
  results: SearchEvidenceResult[];
  omniResults: SearchResult[];
  entities: EntityResult[];
  chips: FilterChip[];
  suggestions: string[];
  graph_context: {
    cases_involved: string[];
    total_scoped: number;
    total_matched: number;
  };
}

// ─── Agentic actions ─────────────────────────────────────────────────────────

export type AgentActionType = 'set_category' | 'set_status' | 'add_tag' | 'add_to_case';

export interface AgentAction {
  type: AgentActionType;
  item_ids: string[];
  value: string;
}

// ─── Metadata edits ──────────────────────────────────────────────────────────

export interface MetadataEdit {
  id: string;
  evidence_id: string;
  evidence_ids?: string[];
  evidence_title?: string;
  field: string;
  current_value?: string;
  new_value: string;
  status: 'pending' | 'applied' | 'dismissed';
}

// Sharing policy options
export type SharingPolicy = 'default' | 'share with Police' | 'share with attorneys';

// Share type options
export type ShareType = 'entire case' | 'list of evidence' | 'folder share';

// Partner user interface
export interface PartnerUser {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  shareType: ShareType;
}

// Partner interface
export interface Partner {
  id: string;
  name: string;
  users: PartnerUser[];
  sharingPolicy: SharingPolicy;
  hasDefaultUser: boolean;
  defaultUser?: PartnerUser; // Only present when hasDefaultUser is true
}