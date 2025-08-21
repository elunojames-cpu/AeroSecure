import { describe, it, expect, beforeEach } from "vitest";

interface MockContractState {
  admin: string;
  paused: boolean;
  lastPartId: bigint;
  authorizedMinters: Map<string, boolean>;
  partMetadata: Map<bigint, {
    serialNumber: string; // buff as string for mock
    manufacturer: string;
    certification: string;
    description: string;
    manufactureDate: bigint;
    status: bigint;
  }>;
  partOwners: Map<bigint, string>;
  nftOwners: Map<bigint, string>; // Simulate NFT ownership
  MAX_PART_ID: bigint;
  STATUS_ACTIVE: bigint;
  // ... other statuses
}

const mockContract: MockContractState & {
  isAdmin: (caller: string) => boolean;
  isAuthorizedMinter: (caller: string) => boolean;
  validateMetadata: (serial: string, cert: string, desc: string) => boolean;
  setPaused: (caller: string, pause: boolean) => { ok: boolean } | { err: number };
  addMinter: (caller: string, minter: string) => { ok: boolean } | { err: number };
  removeMinter: (caller: string, minter: string) => { ok: boolean } | { err: number };
  mintPart: (caller: string, serial: string, cert: string, desc: string) => { ok: bigint } | { err: number };
  transferPart: (caller: string, partId: bigint, recipient: string) => { ok: boolean } | { err: number };
  updateStatus: (caller: string, partId: bigint, newStatus: bigint) => { ok: boolean } | { err: number };
  burnPart: (caller: string, partId: bigint) => { ok: boolean } | { err: number };
} = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  lastPartId: 0n,
  authorizedMinters: new Map(),
  partMetadata: new Map(),
  partOwners: new Map(),
  nftOwners: new Map(),
  MAX_PART_ID: 100_000_000n,
  STATUS_ACTIVE: 0n,
  // Add other statuses if needed in tests

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  isAuthorizedMinter(caller: string) {
    return this.authorizedMinters.get(caller) ?? false;
  },

  validateMetadata(serial: string, cert: string, desc: string) {
    return serial.length > 0 && cert.length > 0 && desc.length > 0;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { err: 100 };
    this.paused = pause;
    return { ok: true };
  },

  addMinter(caller: string, minter: string) {
    if (!this.isAdmin(caller)) return { err: 100 };
    if (minter === "SP000000000000000000002Q6VF78") return { err: 104 };
    this.authorizedMinters.set(minter, true);
    return { ok: true };
  },

  removeMinter(caller: string, minter: string) {
    if (!this.isAdmin(caller)) return { err: 100 };
    this.authorizedMinters.delete(minter);
    return { ok: true };
  },

  mintPart(caller: string, serial: string, cert: string, desc: string) {
    if (!this.isAuthorizedMinter(caller)) return { err: 109 };
    if (this.paused) return { err: 103 };
    const newId = this.lastPartId + 1n;
    if (newId > this.MAX_PART_ID) return { err: 108 };
    if (!this.validateMetadata(serial, cert, desc)) return { err: 107 };
    if (this.nftOwners.has(newId)) return { err: 101 };
    // Mint
    this.nftOwners.set(newId, caller);
    this.partOwners.set(newId, caller);
    this.partMetadata.set(newId, {
      serialNumber: serial,
      manufacturer: caller,
      certification: cert,
      description: desc,
      manufactureDate: 12345n, // Mock block height
      status: this.STATUS_ACTIVE,
    });
    this.lastPartId = newId;
    return { ok: newId };
  },

  transferPart(caller: string, partId: bigint, recipient: string) {
    if (this.paused) return { err: 103 };
    const currentOwner = this.nftOwners.get(partId);
    if (!currentOwner) return { err: 102 };
    if (caller !== currentOwner) return { err: 106 };
    if (recipient === "SP000000000000000000002Q6VF78") return { err: 104 };
    this.nftOwners.set(partId, recipient);
    this.partOwners.set(partId, recipient);
    return { ok: true };
  },

  updateStatus(caller: string, partId: bigint, newStatus: bigint) {
    if (this.paused) return { err: 103 };
    const currentOwner = this.nftOwners.get(partId);
    if (!currentOwner) return { err: 102 };
    const metadata = this.partMetadata.get(partId);
    if (!metadata) return { err: 102 };
    if (!(caller === currentOwner || this.isAdmin(caller))) return { err: 100 };
    // Assume valid status for mock, or add check
    this.partMetadata.set(partId, { ...metadata, status: newStatus });
    return { ok: true };
  },

  burnPart(caller: string, partId: bigint) {
    if (this.paused) return { err: 103 };
    const currentOwner = this.nftOwners.get(partId);
    if (!currentOwner) return { err: 102 };
    if (caller !== currentOwner) return { err: 106 };
    this.nftOwners.delete(partId);
    this.partOwners.delete(partId);
    const metadata = this.partMetadata.get(partId);
    if (metadata) {
      this.partMetadata.set(partId, { ...metadata, status: 1n }); // Retired
    }
    return { ok: true };
  },
};

describe("AeroSecure Parts Registry Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.lastPartId = 0n;
    mockContract.authorizedMinters = new Map();
    mockContract.partMetadata = new Map();
    mockContract.partOwners = new Map();
    mockContract.nftOwners = new Map();
  });

  it("should add a minter when called by admin", () => {
    const result = mockContract.addMinter(mockContract.admin, "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    expect(result).toEqual({ ok: true });
    expect(mockContract.authorizedMinters.get("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7")).toBe(true);
  });

  it("should prevent non-admin from adding minter", () => {
    const result = mockContract.addMinter("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    expect(result).toEqual({ err: 100 });
  });

  it("should mint a part when called by authorized minter", () => {
    mockContract.addMinter(mockContract.admin, "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    const result = mockContract.mintPart("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", "SERIAL123", "CERTABC", "Engine Part");
    expect(result).toEqual({ ok: 1n });
    expect(mockContract.partOwners.get(1n)).toBe("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    expect(mockContract.partMetadata.get(1n)?.serialNumber).toBe("SERIAL123");
  });

  it("should prevent minting by unauthorized caller", () => {
    const result = mockContract.mintPart("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", "SERIAL123", "CERTABC", "Engine Part");
    expect(result).toEqual({ err: 109 });
  });

  it("should transfer a part to a new owner", () => {
    mockContract.addMinter(mockContract.admin, "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    mockContract.mintPart("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", "SERIAL123", "CERTABC", "Engine Part");
    const result = mockContract.transferPart("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", 1n, "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
    expect(result).toEqual({ ok: true });
    expect(mockContract.partOwners.get(1n)).toBe("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
  });

  it("should prevent transfer by non-owner", () => {
    mockContract.addMinter(mockContract.admin, "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    mockContract.mintPart("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", "SERIAL123", "CERTABC", "Engine Part");
    const result = mockContract.transferPart("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP", 1n, "ST4J2GDYANH5150T25XSMR6TMNL5JGR8VFMSSNYh");
    expect(result).toEqual({ err: 106 });
  });

  it("should update status by owner", () => {
    mockContract.addMinter(mockContract.admin, "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    mockContract.mintPart("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", "SERIAL123", "CERTABC", "Engine Part");
    const result = mockContract.updateStatus("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", 1n, 1n); // Retired
    expect(result).toEqual({ ok: true });
    expect(mockContract.partMetadata.get(1n)?.status).toBe(1n);
  });

  it("should burn a part by owner", () => {
    mockContract.addMinter(mockContract.admin, "ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7");
    mockContract.mintPart("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", "SERIAL123", "CERTABC", "Engine Part");
    const result = mockContract.burnPart("ST2CY5V39NHDP5PWEEDAHR9H0A0EGZACPTAZQ6JZ7", 1n);
    expect(result).toEqual({ ok: true });
    expect(mockContract.nftOwners.has(1n)).toBe(false);
    expect(mockContract.partMetadata.get(1n)?.status).toBe(1n); // Retired
  });
});