import { describe, it, expect, beforeEach } from "vitest";

interface SupplyChainEvent {
  eventType: bigint;
  timestamp: bigint;
  actor: string;
  metadata: string;
  verified: boolean;
}

interface OwnershipTransfer {
  from: string;
  to: string;
  timestamp: bigint;
  metadata: string;
}

interface EventLog {
  eventCount: bigint;
  events: SupplyChainEvent[];
}

interface OwnershipLog {
  currentOwner: string;
  transferCount: bigint;
  transfers: OwnershipTransfer[];
}

interface MockContractState {
  admin: string;
  paused: boolean;
  authorizedLoggers: Map<string, boolean>;
  eventLog: Map<bigint, EventLog>;
  partOwnershipLog: Map<bigint, OwnershipLog>;
  MAX_EVENTS_PER_PART: bigint;
  EVENT_TRANSFERRED: bigint;
}

const mockContract: MockContractState & {
  isAdmin: (caller: string) => boolean;
  isAuthorizedLogger: (caller: string) => boolean;
  validateMetadata: (metadata: string) => boolean;
  setPaused: (caller: string, pause: boolean) => { ok: boolean } | { err: number };
  addLogger: (caller: string, logger: string) => { ok: boolean } | { err: number };
  removeLogger: (caller: string, logger: string) => { ok: boolean } | { err: number };
  logEvent: (caller: string, partId: bigint, eventType: bigint, metadata: string) => { ok: boolean } | { err: number };
  logTransfer: (caller: string, partId: bigint, from: string, to: string, metadata: string) => { ok: boolean } | { err: number };
  verifyEvent: (caller: string, partId: bigint, eventIndex: bigint) => { ok: boolean } | { err: number };
} = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  authorizedLoggers: new Map(),
  eventLog: new Map(),
  partOwnershipLog: new Map(),
  MAX_EVENTS_PER_PART: 1000n,
  EVENT_TRANSFERRED: 4n,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  isAuthorizedLogger(caller: string) {
    return this.authorizedLoggers.get(caller) ?? false;
  },

  validateMetadata(metadata: string) {
    return metadata.length > 0;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { err: 200 };
    this.paused = pause;
    return { ok: true };
  },

  addLogger(caller: string, logger: string) {
    if (!this.isAdmin(caller)) return { err: 200 };
    if (logger === "SP000000000000000000002Q6VF78") return { err: 203 };
    this.authorizedLoggers.set(logger, true);
    return { ok: true };
  },

  removeLogger(caller: string, logger: string) {
    if (!this.isAdmin(caller)) return { err: 200 };
    this.authorizedLoggers.delete(logger);
    return { ok: true };
  },

  logEvent(caller: string, partId: bigint, eventType: bigint, metadata: string) {
    if (!this.isAuthorizedLogger(caller)) return { err: 200 };
    if (this.paused) return { err: 202 };
    if (eventType > 4n) return { err: 204 }; // Simplified valid event check
    if (!this.validateMetadata(metadata)) return { err: 205 };
    const currentLog = this.eventLog.get(partId) ?? { eventCount: 0n, events: [] };
    if (currentLog.eventCount >= this.MAX_EVENTS_PER_PART) return { err: 207 };
    const newEvent: SupplyChainEvent = {
      eventType,
      timestamp: 12345n, // Mock block height
      actor: caller,
      metadata,
      verified: false,
    };
    this.eventLog.set(partId, {
      eventCount: currentLog.eventCount + 1n,
      events: [...currentLog.events, newEvent],
    });
    return { ok: true };
  },

  logTransfer(caller: string, partId: bigint, from: string, to: string, metadata: string) {
    if (!(this.isAdmin(caller) || this.isAuthorizedLogger(caller))) return { err: 200 };
    if (this.paused) return { err: 202 };
    if (to === "SP000000000000000000002Q6VF78") return { err: 203 };
    if (!this.validateMetadata(metadata)) return { err: 205 };
    const currentLog = this.partOwnershipLog.get(partId) ?? {
      currentOwner: "SP000000000000000000002Q6VF78",
      transferCount: 0n,
      transfers: [],
    };
    if (currentLog.transferCount >= this.MAX_EVENTS_PER_PART) return { err: 207 };
    const newTransfer: OwnershipTransfer = {
      from,
      to,
      timestamp: 12345n,
      metadata,
    };
    this.partOwnershipLog.set(partId, {
      currentOwner: to,
      transferCount: currentLog.transferCount + 1n,
      transfers: [...currentLog.transfers, newTransfer],
    });
    // Simulate log-event call
    this.logEvent(caller, partId, this.EVENT_TRANSFERRED, metadata);
    return { ok: true };
  },

  verifyEvent(caller: string, partId: bigint, eventIndex: bigint) {
    if (!(this.isAdmin(caller) || this.isAuthorizedLogger(caller))) return { err: 200 };
    if (this.paused) return { err: 202 };
    const currentLog = this.eventLog.get(partId);
    if (!currentLog) return { err: 201 };
    if (eventIndex >= currentLog.eventCount) return { err: 201 };
    const events = [...currentLog.events];
    events[eventIndex as number] = { ...events[eventIndex as number], verified: true };
    this.eventLog.set(partId, { eventCount: currentLog.eventCount, events });
    return { ok: true };
  },
};

describe("AeroSecure Traceability Log Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.authorizedLoggers = new Map();
    mockContract.eventLog = new Map();
    mockContract.partOwnershipLog = new Map();
  });

  it("should add a logger when called by admin", () => {
    const result = mockContract.addLogger(mockContract.admin, "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    expect(result).toEqual({ ok: true });
    expect(mockContract.authorizedLoggers.get("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7")).toBe(true);
  });

  it("should prevent non-admin from adding logger", () => {
    const result = mockContract.addLogger("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    expect(result).toEqual({ err: 200 });
  });

  it("should log a supply chain event", () => {
    mockContract.addLogger(mockContract.admin, "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    const result = mockContract.logEvent("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", 1n, 0n, "Manufactured at Factory A");
    expect(result).toEqual({ ok: true });
    const log = mockContract.eventLog.get(1n);
    expect(log?.eventCount).toBe(1n);
    expect(log?.events[0]).toEqual({
      eventType: 0n,
      timestamp: 12345n,
      actor: "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7",
      metadata: "Manufactured at Factory A",
      verified: false,
    });
  });

  it("should prevent unauthorized event logging", () => {
    const result = mockContract.logEvent("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", 1n, 0n, "Manufactured at Factory A");
    expect(result).toEqual({ err: 200 });
  });

  it("should log an ownership transfer", () => {
    mockContract.addLogger(mockContract.admin, "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    const result = mockContract.logTransfer(
      "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7",
      1n,
      "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7",
      "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP",
      "Transfer to supplier"
    );
    expect(result).toEqual({ ok: true });
    const ownershipLog = mockContract.partOwnershipLog.get(1n);
    expect(ownershipLog?.currentOwner).toBe("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
    expect(ownershipLog?.transferCount).toBe(1n);
    const eventLog = mockContract.eventLog.get(1n);
    expect(eventLog?.eventCount).toBe(1n);
    expect(eventLog?.events[0].eventType).toBe(4n);
  });

  it("should verify an event", () => {
    mockContract.addLogger(mockContract.admin, "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    mockContract.logEvent("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", 1n, 0n, "Manufactured at Factory A");
    const result = mockContract.verifyEvent("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", 1n, 0n);
    expect(result).toEqual({ ok: true });
    const log = mockContract.eventLog.get(1n);
    expect(log?.events[0].verified).toBe(true);
  });

  it("should prevent invalid event types", () => {
    mockContract.addLogger(mockContract.admin, "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    const result = mockContract.logEvent("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", 1n, 999n, "Invalid Event");
    expect(result).toEqual({ err: 204 });
  });
});