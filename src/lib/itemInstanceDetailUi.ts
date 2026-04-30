import { formatItemLabel } from "./itemUi";

type InstanceTitleInput = {
  itemName: string;
  serialNumber?: string | null;
  instanceId: number;
  position?: number | null;
  total?: number | null;
};

type PrimaryIdentifierInput = {
  serialNumber?: string | null;
  qrCode?: string | null;
  instanceId: number;
};

type InstanceDescriptionInput = {
  itemName: string;
  locationName?: string | null;
  allocatedTo?: string | null;
};

type InstanceStatusLabelInput = {
  status?: string | null;
  allocatedTo?: string | null;
};

export function buildInstanceTitle({
  itemName,
  serialNumber,
  instanceId,
  position,
  total,
}: InstanceTitleInput) {
  const cleanSerial = serialNumber?.trim();
  if (cleanSerial) return `${itemName} — ${cleanSerial}`;
  if (position && total) return `${itemName} — unit #${position} of ${total}`;
  return `${itemName} — instance #${instanceId}`;
}

export function getPrimaryInstanceIdentifier({
  serialNumber,
  qrCode,
  instanceId,
}: PrimaryIdentifierInput) {
  return serialNumber?.trim() || qrCode?.trim() || `Instance #${instanceId}`;
}

export function buildInstanceDescription({
  itemName,
  locationName,
  allocatedTo,
}: InstanceDescriptionInput) {
  const locationPart = locationName?.trim()
    ? `currently located at ${locationName.trim()}`
    : "currently without a recorded location";
  const allocationPart = allocatedTo?.trim()
    ? `, allocated to ${allocatedTo.trim()}`
    : "";

  return `Tracked unit of ${itemName}, ${locationPart}${allocationPart}.`;
}

function humanizeStatus(status: string | null | undefined) {
  const formatted = formatItemLabel(status, "Unknown");
  if (/^[A-Z0-9\s]+$/.test(formatted)) {
    return formatted.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  }
  return formatted;
}

export function buildInstanceStatusLabel({ status, allocatedTo }: InstanceStatusLabelInput) {
  const base = humanizeStatus(status);
  if (base === "Allocated") return base;
  return allocatedTo?.trim() ? `${base} · Allocated` : base;
}
