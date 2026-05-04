export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  employee_id: string;
  is_active: boolean;
  power_level: number; // 0=Global, 1=Scoped, 3=Personal
  is_superuser: boolean;
  is_staff: boolean;
  assigned_locations_display: string[];
  groups_display: string[];
  last_login: string | null;
  created_at?: string | null;
}

export interface Location {
  id: number;
  name: string;
  code: string;
  kind: string;
  parent_id: number | null;
  depth: number;
  asset_count: number;
  item_count: number;
  custodian: string;
  is_active: boolean;
  children?: Location[];
}

export interface LocationRecord {
  id: number;
  name: string;
  code: string;
  parent_location: number | null;
  parent_location_display?: string | null;
  location_type: string;
  description: string | null;
  address: string | null;
  in_charge: string | null;
  contact_number: string | null;
  is_active: boolean;
  is_store: boolean;
  is_standalone: boolean;
  is_main_store?: boolean | null;
  main_store_id?: number | null;
  main_store_display?: string | null;
  main_store_code?: string | null;
  root_main_store_id?: number | null;
  root_main_store_display?: string | null;
  hierarchy_level: number;
  updated_at: string;
}

export interface StockRegisterRecord {
  id: number;
  register_number: string;
  register_type: "CSR" | "DSR";
  store: number;
  store_name?: string | null;
  is_active: boolean;
  closed_at?: string | null;
  closed_by?: number | null;
  closed_by_name?: string | null;
  closed_reason?: string | null;
  reopened_at?: string | null;
  reopened_by?: number | null;
  reopened_by_name?: string | null;
  reopened_reason?: string | null;
  created_at: string;
  updated_at: string;
  created_by_name?: string | null;
}

export const LOCATION_TYPE_LABELS: Record<string, string> = {
  DEPARTMENT: "Department",
  BUILDING: "Building",
  STORE: "Store",
  ROOM: "Room",
  LAB: "Lab",
  JUNKYARD: "Junkyard",
  OFFICE: "Office",
  AV_HALL: "AV Hall",
  AUDITORIUM: "Auditorium",
  OTHER: "Other",
};

export function locationTypeLabel(type: string) {
  return LOCATION_TYPE_LABELS[type] ?? type;
}

export function buildLocationTree(locations: Location[]): Location[] {
  const byId: Record<number, Location> = {};
  locations.forEach((l) => {
    byId[l.id] = { ...l, children: [] };
  });
  const roots: Location[] = [];
  Object.values(byId).forEach((l) => {
    if (l.parent_id && byId[l.parent_id]) byId[l.parent_id].children!.push(l);
    else roots.push(l);
  });
  return roots;
}

export function tierMeta(power_level: number) {
  if (power_level === 0) return { label: "Global", desc: "Full University Access", color: "var(--tier-0)" };
  if (power_level === 1) return { label: "Scoped", desc: "Assigned Locations", color: "var(--tier-1)" };
  return { label: "Personal", desc: "No Assignment", color: "var(--tier-3)" };
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}
