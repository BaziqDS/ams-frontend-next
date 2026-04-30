import { describe, expect, it } from "vitest";
import {
  buildInstanceDescription,
  buildInstanceStatusLabel,
  buildInstanceTitle,
  getPrimaryInstanceIdentifier,
} from "./itemInstanceDetailUi";

describe("item instance detail UI helpers", () => {
  it("prefers the serial number when building the hero title", () => {
    expect(buildInstanceTitle({
      itemName: "Laptops Auto",
      serialNumber: "SN-001",
      instanceId: 7,
      position: 3,
      total: 3,
    })).toBe("Laptops Auto — SN-001");
  });

  it("falls back to the unit position when the serial number is missing", () => {
    expect(buildInstanceTitle({
      itemName: "Laptops Auto",
      serialNumber: null,
      instanceId: 7,
      position: 3,
      total: 3,
    })).toBe("Laptops Auto — unit #3 of 3");
  });

  it("falls back to the instance id when no serial or sequence is available", () => {
    expect(buildInstanceTitle({
      itemName: "Laptops Auto",
      serialNumber: "",
      instanceId: 7,
    })).toBe("Laptops Auto — instance #7");
  });

  it("uses the best available identifier for chips and labels", () => {
    expect(getPrimaryInstanceIdentifier({ serialNumber: "SN-001", qrCode: "QR-001", instanceId: 7 })).toBe("SN-001");
    expect(getPrimaryInstanceIdentifier({ serialNumber: "", qrCode: "QR-001", instanceId: 7 })).toBe("QR-001");
    expect(getPrimaryInstanceIdentifier({ serialNumber: null, qrCode: null, instanceId: 7 })).toBe("Instance #7");
  });

  it("builds a description from actual location, allocation, inspection, and update data", () => {
    expect(buildInstanceDescription({
      itemName: "Laptops Auto",
      locationName: "Central Store",
      allocatedTo: "IT Services Department",
    })).toBe(
      "Tracked unit of Laptops Auto, currently located at Central Store, allocated to IT Services Department.",
    );
  });

  it("keeps status labels grounded in actual status and allocation data", () => {
    expect(buildInstanceStatusLabel({ status: "AVAILABLE" })).toBe("Available");
    expect(buildInstanceStatusLabel({ status: "AVAILABLE", allocatedTo: "IT Services Department" })).toBe("Available · Allocated");
    expect(buildInstanceStatusLabel({ status: "ALLOCATED", allocatedTo: "IT Services Department" })).toBe("Allocated");
  });
});
