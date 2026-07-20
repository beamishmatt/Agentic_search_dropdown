// Capabilities / permissions catalog for omni search. Lets queries like
// "who can delete evidence" or "facial recognition permission" resolve to the
// permission itself (and the roles that hold it), not just evidence items.
// `section` maps each capability to its Evidence.com admin nav group.

import type { AdminSection } from './types';

export interface Capability {
  id: string;
  title: string;
  section: AdminSection;
  description: string;
  roles: string[];       // roles that currently hold this capability
  enabled: boolean;      // whether the capability is enabled for the agency
  keywords: string[];
}

export const mockCapabilities: Capability[] = [
  {
    id: 'cap-facial-watchlist',
    title: 'Facial match watchlist',
    section: 'Application Settings',
    description: 'Run facial recognition matches against a managed watchlist.',
    roles: ['System Administrator', 'Detective'],
    enabled: false,
    keywords: ['facial', 'face', 'recognition', 'watchlist', 'biometric', 'match'],
  },
  {
    id: 'cap-redaction',
    title: 'Redaction',
    section: 'Evidence Settings',
    description: 'Redact faces, audio, and regions in video and image evidence.',
    roles: ['Detective', 'Records Custodian', 'System Administrator'],
    enabled: true,
    keywords: ['redact', 'redaction', 'blur', 'privacy'],
  },
  {
    id: 'cap-export',
    title: 'Export evidence',
    section: 'Evidence Settings',
    description: 'Download and export evidence files outside the platform.',
    roles: ['Detective', 'Sergeant', 'System Administrator'],
    enabled: true,
    keywords: ['export', 'download', 'extract'],
  },
  {
    id: 'cap-delete',
    title: 'Delete evidence',
    section: 'Evidence Settings',
    description: 'Permanently delete evidence or queue it for deletion.',
    roles: ['System Administrator', 'Records Custodian'],
    enabled: true,
    keywords: ['delete', 'remove', 'purge', 'destroy'],
  },
  {
    id: 'cap-manage-users',
    title: 'Manage users & roles',
    section: 'User Management',
    description: 'Create users, assign roles, and configure permissions.',
    roles: ['System Administrator'],
    enabled: true,
    keywords: ['user', 'users', 'role', 'roles', 'permission', 'permissions', 'admin'],
  },
  {
    id: 'cap-share-external',
    title: 'Share externally',
    section: 'Evidence Settings',
    description: 'Share cases and evidence with external agencies and attorneys.',
    roles: ['Detective', 'Sergeant', 'System Administrator'],
    enabled: true,
    keywords: ['share', 'external', 'attorney', 'partner', 'agency'],
  },
];
