// People / users catalog for omni search. Reuses the officers that appear in
// contextGraph.json plus a few admin/support roles so people-oriented queries
// ("who can delete evidence", "Maria Thibodaux") return real matches.

export interface Person {
  id: string;
  name: string;
  role: string;
  unit?: string;
  status: 'Active' | 'Suspended' | 'Invited';
  email: string;
}

export const mockPeople: Person[] = [
  { id: 'usr-mthibodaux', name: 'Maria Thibodaux', role: 'Detective',       unit: 'Homicide',      status: 'Active',  email: 'mthibodaux@pbpd.gov' },
  { id: 'usr-dtran',      name: 'Diane Tran',       role: 'Detective',       unit: 'Narcotics',     status: 'Active',  email: 'dtran@pbpd.gov' },
  { id: 'usr-kokafor',    name: 'Kenneth Okafor',   role: 'Officer',         unit: 'Patrol',        status: 'Active',  email: 'kokafor@pbpd.gov' },
  { id: 'usr-jmartin',    name: 'James Martin',     role: 'Sergeant',        unit: 'Investigations', status: 'Active', email: 'jmartin@pbpd.gov' },
  { id: 'usr-mnolan',     name: 'Mike Nolan',       role: 'Officer',         unit: 'Patrol',        status: 'Active',  email: 'mnolan@pbpd.gov' },
  { id: 'usr-mserrano',   name: 'Miguel Serrano',   role: 'Officer',         unit: 'Traffic',       status: 'Active',  email: 'mserrano@pbpd.gov' },
  { id: 'usr-admin',      name: 'Dana Flores',      role: 'System Administrator', unit: 'IT',       status: 'Active',  email: 'dflores@pbpd.gov' },
  { id: 'usr-records',    name: 'Harper Okafor',    role: 'Records Custodian', unit: 'Records',     status: 'Active',  email: 'hokafor@pbpd.gov' },
  { id: 'usr-da',         name: 'Nadia Reyes',      role: 'Prosecutor (external)', unit: "District Attorney", status: 'Active', email: 'nreyes@da.gov' },
  { id: 'usr-invited',    name: 'Owen Castillo',    role: 'Officer',         unit: 'Patrol',        status: 'Invited', email: 'ocastillo@pbpd.gov' },
];

export function getPersonByName(name: string): Person | undefined {
  return mockPeople.find(p => p.name.toLowerCase() === name.toLowerCase());
}
