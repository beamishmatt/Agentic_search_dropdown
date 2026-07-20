// Admin settings catalog for omni search. Each entry is a searchable admin /
// configuration page, organized under the Evidence.com admin nav taxonomy
// (section = top-level nav group, subsection = the page within it).
// `keywords` broadens matching beyond the visible title.

import type { AdminSection } from './types';

export interface AdminSetting {
  id: string;
  title: string;
  section: AdminSection;
  subsection: string;
  description: string;
  deeplink: string;
  keywords: string[];
  // Marks settings that govern written department policy (the policy manual,
  // SOPs, acknowledgements). These are the relevant destinations when a user
  // asks a policy / procedure question rather than searching for a feature.
  policyGuidance?: boolean;
}

export const mockSettings: AdminSetting[] = [
  // ── User Management ──
  {
    id: 'set-roles',
    title: 'Roles & Permissions',
    section: 'User Management',
    subsection: 'Roles & Permissions',
    description: 'Define roles and the capabilities granted to each.',
    deeplink: '/admin/users/roles',
    keywords: ['role', 'roles', 'permission', 'permissions', 'access', 'capability', 'capabilities'],
  },
  {
    id: 'set-groups',
    title: 'Groups',
    section: 'User Management',
    subsection: 'Groups',
    description: 'Organize users into groups for access and sharing.',
    deeplink: '/admin/users/groups',
    keywords: ['group', 'groups', 'team', 'unit'],
  },
  {
    id: 'set-provisioning',
    title: 'Automatic Provisioning',
    section: 'User Management',
    subsection: 'Automatic Provisioning',
    description: 'Auto-provision users and roles from your identity provider.',
    deeplink: '/admin/users/provisioning',
    keywords: ['provisioning', 'scim', 'auto', 'identity', 'sync', 'onboarding'],
  },

  // ── Device Management ──
  {
    id: 'set-device-policies',
    title: 'Device policies',
    section: 'Device Management',
    subsection: 'Policies',
    description: 'Configure recording, upload, and assignment policies for devices.',
    deeplink: '/admin/devices/policies',
    keywords: ['device', 'devices', 'camera', 'policy', 'recording', 'upload', 'dock'],
  },

  // ── Organization Settings ──
  {
    id: 'set-policy-docs',
    title: 'Policy documents',
    section: 'Organization Settings',
    subsection: 'Policy Manual',
    description: 'Publish and update the department policy manual, SOPs, and general orders that govern officer conduct.',
    deeplink: '/admin/org/policies',
    keywords: ['policy', 'policies', 'procedure', 'procedures', 'sop', 'manual', 'general order', 'directive', 'guideline', 'guidelines', 'protocol', 'conduct', 'compliance', 'document', 'documents'],
    policyGuidance: true,
  },
  {
    id: 'set-policy-ack',
    title: 'Policy acknowledgements',
    section: 'Organization Settings',
    subsection: 'Policy Manual',
    description: 'Assign policy documents to personnel and track review, attestation, and acknowledgement.',
    deeplink: '/admin/org/policies/acknowledgements',
    keywords: ['acknowledge', 'acknowledgement', 'attestation', 'sign off', 'review', 'assign', 'training', 'compliance'],
    policyGuidance: true,
  },
  {
    id: 'set-sso',
    title: 'SSO / SAML configuration',
    section: 'Organization Settings',
    subsection: 'Security',
    description: 'Configure single sign-on and SAML identity providers.',
    deeplink: '/admin/org/security/sso',
    keywords: ['sso', 'saml', 'login', 'authentication', 'identity', 'okta', 'security'],
  },
  {
    id: 'set-mfa',
    title: 'Multi-factor authentication',
    section: 'Organization Settings',
    subsection: 'Security',
    description: 'Require and manage multi-factor authentication for all users.',
    deeplink: '/admin/org/security/mfa',
    keywords: ['mfa', '2fa', 'two factor', 'authentication', 'security'],
  },
  {
    id: 'set-audit',
    title: 'Audit log',
    section: 'Organization Settings',
    subsection: 'Audit',
    description: 'Review the tamper-evident audit trail of all evidence and user activity.',
    deeplink: '/admin/org/audit',
    keywords: ['audit', 'log', 'history', 'activity', 'chain of custody'],
  },

  // ── Evidence Settings ──
  {
    id: 'set-retention',
    title: 'Evidence retention policies',
    section: 'Evidence Settings',
    subsection: 'Retention',
    description: 'Configure automatic retention and deletion schedules by category.',
    deeplink: '/admin/evidence/retention',
    keywords: ['retention', 'delete', 'deletion', 'schedule', 'purge', 'hold', 'expiration'],
  },
  {
    id: 'set-sharing',
    title: 'Default sharing settings',
    section: 'Evidence Settings',
    subsection: 'Sharing',
    description: 'Control default sharing behavior with attorneys, partners, and external agencies.',
    deeplink: '/admin/evidence/sharing',
    keywords: ['sharing', 'share', 'external', 'attorney', 'partner', 'defaults'],
  },
  {
    id: 'set-categories',
    title: 'Category management',
    section: 'Evidence Settings',
    subsection: 'Categories',
    description: 'Create and manage evidence categories and their retention mappings.',
    deeplink: '/admin/evidence/categories',
    keywords: ['category', 'categories', 'tags', 'labels'],
  },

  // ── Application Settings ──
  {
    id: 'set-facial',
    title: 'Facial recognition settings',
    section: 'Application Settings',
    subsection: 'Facial Recognition',
    description: 'Enable and configure facial recognition and watchlist matching.',
    deeplink: '/admin/apps/facial-recognition',
    keywords: ['facial', 'face', 'recognition', 'watchlist', 'biometric', 'match'],
  },
  {
    id: 'set-integrations',
    title: 'Integrations & API clients',
    section: 'Application Settings',
    subsection: 'Integrations',
    description: 'Manage connected apps, API clients, and third-party integrations.',
    deeplink: '/admin/apps/integrations',
    keywords: ['integration', 'api', 'webhook', 'client', 'connect', 'cad', 'rms'],
  },
];
