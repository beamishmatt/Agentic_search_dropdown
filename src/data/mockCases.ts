import { Case } from './types';
import { isCaseShared } from './persistenceLayer';

// Base date: Apr 1, 2026
const d = (h: number, m: number, s = 0) =>
  new Date(2026, 3, 1, h, m, s); // month is 0-indexed

export const mockCases: Case[] = [
  {
    caseId: 'PBPD-2025-088142',
    owner: 'Thibodaux, Maria (mthibodaux)',
    createdOn: new Date('2026-03-27T19:23:52Z'),
    lastUpdatedOn: new Date('2026-03-27T21:15:00Z'),
    status: 'Active',
    description: 'Homicide investigation — case assigned to Officer Maria Thibodaux.',
    accessClass: 'Confidential',
  },
  {
    caseId: 'PBPD-2025-091207',
    owner: 'Martin, James (jmartin)',
    createdOn: new Date('2026-04-02T14:05:11Z'),
    lastUpdatedOn: new Date('2026-04-05T09:40:00Z'),
    status: 'Active',
    description: 'Armed robbery investigation — case assigned to Officer James Martin.',
    accessClass: 'Restricted',
  },
  {
    caseId: 'PBPD-2025-093544',
    owner: 'Tran, Diane (dtran)',
    createdOn: new Date('2026-04-08T08:17:42Z'),
    lastUpdatedOn: new Date('2026-04-11T16:22:00Z'),
    status: 'Active',
    description: 'Narcotics trafficking investigation — case assigned to Officer Diane Tran.',
    accessClass: 'Confidential',
  },
  {
    caseId: 'PBPD-2025-085019',
    owner: 'Okafor, Kenneth (kokafor)',
    createdOn: new Date('2026-03-15T11:30:00Z'),
    lastUpdatedOn: new Date('2026-03-30T13:05:00Z'),
    status: 'Closed',
    description: 'Vehicle theft investigation — case assigned to Officer Kenneth Okafor.',
    accessClass: 'Unrestricted',
  },
  {
    caseId: 'PBPD-2025-112781',
    owner: 'Martin, James (jmartin)',
    createdOn: new Date('2026-07-15T20:26:30Z'),
    lastUpdatedOn: new Date('2026-07-15T20:26:30Z'),
    status: 'Active',
    description: 'Theft investigation — case assigned to Officer James Martin.',
    accessClass: 'Restricted',
  },
  {
    caseId: 'PBPD-2025-617393',
    owner: 'Martin, James (jmartin)',
    createdOn: new Date('2026-07-15T20:47:03Z'),
    lastUpdatedOn: new Date('2026-07-15T20:47:03Z'),
    status: 'Active',
    description: 'Burglary investigation — case assigned to Officer James Martin.',
    accessClass: 'Restricted',
  },
];

export function getCaseById(caseId: string): Case | undefined {
  return mockCases.find(c => c.caseId === caseId);
}

export function getAllCasesWithSharingStatus(): (Case & { isShared: boolean })[] {
  return mockCases.map(c => ({ ...c, isShared: isCaseShared(c.caseId) }));
}
