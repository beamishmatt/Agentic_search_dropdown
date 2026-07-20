// Device catalog for omni search — body cameras, Fleet units, and TASER
// energy weapons, assigned to the officers in the people catalog.

export interface Device {
  id: string;
  name: string;
  deviceType: 'Body Worn Camera' | 'Fleet' | 'TASER Energy Weapon' | 'Fixed ALPR';
  assignedTo?: string;
  status: 'Online' | 'Offline' | 'Docked' | 'Unassigned';
  lastSeen?: string; // ISO date
  serial: string;
}

export const mockDevices: Device[] = [
  { id: 'dev-ax3-8841', name: 'Axon Body 3',      deviceType: 'Body Worn Camera',   assignedTo: 'Maria Thibodaux', status: 'Docked',  lastSeen: '2026-07-16', serial: 'X60088412' },
  { id: 'dev-ax3-2207', name: 'Axon Body 3',      deviceType: 'Body Worn Camera',   assignedTo: 'Kenneth Okafor',  status: 'Online',  lastSeen: '2026-07-17', serial: 'X60022071' },
  { id: 'dev-ax4-5519', name: 'Axon Body 4',      deviceType: 'Body Worn Camera',   assignedTo: 'Mike Nolan',      status: 'Offline', lastSeen: '2026-07-12', serial: 'X70055193' },
  { id: 'dev-flt-1102', name: 'Fleet 3 Unit 11',  deviceType: 'Fleet',              assignedTo: 'Miguel Serrano',  status: 'Online',  lastSeen: '2026-07-17', serial: 'FL3110288' },
  { id: 'dev-flt-1140', name: 'Fleet 3 Unit 14',  deviceType: 'Fleet',              status: 'Unassigned', lastSeen: '2026-06-30', serial: 'FL3114002' },
  { id: 'dev-tsr-3390', name: 'TASER 10',         deviceType: 'TASER Energy Weapon', assignedTo: 'James Martin',   status: 'Docked',  lastSeen: '2026-07-15', serial: 'TSR103390' },
  { id: 'dev-tsr-3401', name: 'TASER 10',         deviceType: 'TASER Energy Weapon', assignedTo: 'Diane Tran',     status: 'Docked',  lastSeen: '2026-07-15', serial: 'TSR103401' },
  { id: 'dev-alpr-002', name: 'Fixed ALPR — 5th & Main', deviceType: 'Fixed ALPR',  status: 'Online',  lastSeen: '2026-07-17', serial: 'ALPR00219' },
];
