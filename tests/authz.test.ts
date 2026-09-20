import { describe, expect, it } from "vitest";
import {
  accessLevelsFor,
  canAssignRole,
  canDeleteDocument,
  canInspectDocumentAsAdmin,
  canManageMember,
  canReadChat,
  canRetrieveChunk,
  canRetrieveDocument,
  checkFileAllowed,
  normaliseExtension,
  roleAtLeast,
  scopeFromMembership,
} from "@/lib/authz";
import type {
  AccessLevel,
  AccessScope,
  ChatRecord,
  ChunkRecord,
  DocumentRecord,
  DocVisibility,
  MemberRole,
  Membership,
  WorkspaceSettings,
} from "@/lib/types";

const WS = "ws-acme";
const OTHER_WS = "ws-other";

function scope(over: Partial<AccessScope> = {}): AccessScope {
  return {
    workspaceId: WS,
    userId: "user-ann",
    role: "member",
    accessLevels: ["all-team"],
    ...over,
  };
}

function doc(over: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: "doc-1",
    workspaceId: WS,
    ownerId: "user-ann",
    ownerEmail: "ann@acme.test",
    visibility: "shared",
    title: "Q3 forecast",
    description: "",
    accessLevel: "all-team",
    uploadedAt: "2026-01-01T00:00:00.000Z",
    status: "ready",
    chunkCount: 1,
    ...over,
  };
}

function chunk(over: Partial<ChunkRecord> = {}): ChunkRecord {
  return {
    id: "chunk-1",
    workspaceId: WS,
    ownerId: "user-ann",
    visibility: "shared",
    documentId: "doc-1",
    documentTitle: "Q3 forecast",
    chunkIndex: 0,
    text: "revenue",
    maskedText: "revenue",
    embedding: [],
    embeddingModel: "m",
    embeddingDimensions: 0,
    embeddingVersion: 1,
    accessLevel: "all-team",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function member(over: Partial<Membership> = {}): Membership {
  return {
    id: `${WS}:user-bob`,
    workspaceId: WS,
    userId: "user-bob",
    email: "bob@acme.test",
    role: "member",
    accessLevel: "all-team",
    joinedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const settings = (over: Partial<WorkspaceSettings> = {}): WorkspaceSettings => ({
  allowedFileTypes: null,
  maxFileSizeMb: 25,
  ...over,
});

describe("tenancy isolation", () => {
  it("never returns a document from another workspace, even to an owner", () => {
    const god = scope({
      role: "owner",
      accessLevels: ["all-team", "management", "management-investees"],
    });
    expect(
      canRetrieveDocument(god, doc({ workspaceId: OTHER_WS, ownerId: god.userId })),
    ).toBe(false);
  });

  it("never returns a chunk from another workspace", () => {
    expect(canRetrieveChunk(scope(), chunk({ workspaceId: OTHER_WS }))).toBe(false);
  });
});

describe("private documents", () => {
  it("are retrievable by their owner", () => {
    const ann = scope({ userId: "user-ann" });
    expect(canRetrieveDocument(ann, doc({ visibility: "private", ownerId: "user-ann" }))).toBe(true);
  });

  it("are not retrievable by another member", () => {
    const bob = scope({ userId: "user-bob" });
    expect(canRetrieveDocument(bob, doc({ visibility: "private", ownerId: "user-ann" }))).toBe(false);
  });

  // The product promise: admins get governance access through the audited
  // admin surface, never silent retrieval inside someone else's answer.
  it.each<MemberRole>(["admin", "owner"])(
    "are NOT retrievable in chat by a %s",
    (role) => {
      const boss = scope({
        userId: "user-boss",
        role,
        accessLevels: ["all-team", "management", "management-investees"],
      });
      expect(
        canRetrieveDocument(boss, doc({ visibility: "private", ownerId: "user-ann" })),
      ).toBe(false);
    },
  );

  it("ARE inspectable by an admin through the admin surface", () => {
    const boss = scope({ userId: "user-boss", role: "admin" });
    expect(
      canInspectDocumentAsAdmin(boss, doc({ visibility: "private", ownerId: "user-ann" })),
    ).toBe(true);
  });

  it("are not inspectable by a plain member", () => {
    const bob = scope({ userId: "user-bob", role: "member" });
    expect(canInspectDocumentAsAdmin(bob, doc({ ownerId: "user-ann" }))).toBe(false);
  });
});

describe("access tiers", () => {
  it("are cumulative and never reach above the member's own tier", () => {
    expect(accessLevelsFor("all-team")).toEqual(["all-team"]);
    expect(accessLevelsFor("management")).toEqual(["all-team", "management"]);
    expect(accessLevelsFor("management-investees")).toEqual([
      "all-team",
      "management",
      "management-investees",
    ]);
  });

  it("falls back to the lowest tier for an unrecognised value", () => {
    expect(accessLevelsFor("nonsense" as AccessLevel)).toEqual(["all-team"]);
  });

  it("blocks a shared document above the member's tier", () => {
    const junior = scope({ accessLevels: accessLevelsFor("all-team") });
    expect(canRetrieveDocument(junior, doc({ accessLevel: "management" }))).toBe(false);
  });

  it("allows a shared document at or below the member's tier", () => {
    const mgr = scope({ accessLevels: accessLevelsFor("management") });
    expect(canRetrieveDocument(mgr, doc({ accessLevel: "management" }))).toBe(true);
    expect(canRetrieveDocument(mgr, doc({ accessLevel: "all-team" }))).toBe(true);
  });

  // Regression guard for the original bug: privileges came from the request
  // body, so a caller could simply claim the top tier.
  it("cannot be widened by the caller naming a higher tier", () => {
    const claimed = scope({ accessLevels: accessLevelsFor("all-team") });
    expect(canRetrieveDocument(claimed, doc({ accessLevel: "management-investees" }))).toBe(false);
  });
});

describe("conversations", () => {
  const chat = (over: Partial<ChatRecord> = {}): ChatRecord => ({
    id: "chat-1",
    workspaceId: WS,
    userId: "user-ann",
    question: "q",
    answer: "a",
    sources: [],
    viewerRole: "team-member",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  });

  it("are readable by their author", () => {
    expect(canReadChat(scope({ userId: "user-ann" }), chat())).toBe(true);
  });

  it.each<MemberRole>(["member", "admin", "owner"])(
    "are NOT readable by anyone else, including a %s",
    (role) => {
      const other = scope({
        userId: "user-boss",
        role,
        accessLevels: ["all-team", "management", "management-investees"],
      });
      expect(canReadChat(other, chat({ userId: "user-ann" }))).toBe(false);
    },
  );

  it("are not readable across workspaces", () => {
    expect(canReadChat(scope({ userId: "user-ann" }), chat({ workspaceId: OTHER_WS }))).toBe(false);
  });
});

describe("member management", () => {
  it("lets an admin manage a plain member", () => {
    expect(canManageMember(scope({ userId: "user-boss", role: "admin" }), member())).toBe(true);
  });

  it("stops an admin removing another admin", () => {
    expect(
      canManageMember(scope({ userId: "user-boss", role: "admin" }), member({ role: "admin" })),
    ).toBe(false);
  });

  it("stops an admin removing the owner", () => {
    expect(
      canManageMember(scope({ userId: "user-boss", role: "admin" }), member({ role: "owner" })),
    ).toBe(false);
  });

  it("lets the owner manage an admin", () => {
    expect(
      canManageMember(scope({ userId: "user-root", role: "owner" }), member({ role: "admin" })),
    ).toBe(true);
  });

  it("stops a plain member managing anyone", () => {
    expect(canManageMember(scope({ userId: "user-x", role: "member" }), member())).toBe(false);
  });

  it("stops anyone acting on themselves through the admin surface", () => {
    const self = member({ userId: "user-boss", role: "member" });
    expect(canManageMember(scope({ userId: "user-boss", role: "admin" }), self)).toBe(false);
  });

  it("stops management across workspaces", () => {
    expect(
      canManageMember(
        scope({ userId: "user-boss", role: "owner" }),
        member({ workspaceId: OTHER_WS }),
      ),
    ).toBe(false);
  });
});

describe("role assignment", () => {
  it("lets an admin promote a member to admin", () => {
    expect(canAssignRole(scope({ userId: "user-boss", role: "admin" }), member(), "admin")).toBe(true);
  });

  // Ownership transfer must be a deliberate act by the owner, not something an
  // admin can grant themselves a peer for.
  it("stops an admin minting an owner", () => {
    expect(canAssignRole(scope({ userId: "user-boss", role: "admin" }), member(), "owner")).toBe(false);
  });

  it("lets the owner appoint an admin", () => {
    expect(canAssignRole(scope({ userId: "user-root", role: "owner" }), member(), "admin")).toBe(true);
  });
});

describe("document deletion", () => {
  it("is allowed for the owner of the document", () => {
    expect(canDeleteDocument(scope({ userId: "user-ann" }), doc({ ownerId: "user-ann" }))).toBe(true);
  });

  it("is allowed for an admin", () => {
    expect(
      canDeleteDocument(scope({ userId: "user-boss", role: "admin" }), doc({ ownerId: "user-ann" })),
    ).toBe(true);
  });

  it("is refused for an unrelated member", () => {
    expect(
      canDeleteDocument(scope({ userId: "user-bob", role: "member" }), doc({ ownerId: "user-ann" })),
    ).toBe(false);
  });

  it("is refused across workspaces even for an owner", () => {
    expect(
      canDeleteDocument(scope({ userId: "user-root", role: "owner" }), doc({ workspaceId: OTHER_WS })),
    ).toBe(false);
  });
});

describe("upload restrictions", () => {
  it("allows anything when unrestricted", () => {
    expect(checkFileAllowed(settings(), "notes.exe").ok).toBe(true);
  });

  it("allows a permitted extension", () => {
    expect(checkFileAllowed(settings({ allowedFileTypes: ["pdf", "md"] }), "report.PDF").ok).toBe(true);
  });

  it("refuses a disallowed extension", () => {
    const result = checkFileAllowed(settings({ allowedFileTypes: ["pdf"] }), "notes.md");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(".pdf");
  });

  // An empty list is a real choice ("block everything"), distinct from null.
  it("treats an empty allow-list as blocking every upload", () => {
    expect(checkFileAllowed(settings({ allowedFileTypes: [] }), "a.pdf").ok).toBe(false);
  });

  it("still allows pasted text, which has no filename", () => {
    expect(checkFileAllowed(settings({ allowedFileTypes: ["pdf"] }), undefined).ok).toBe(true);
  });

  it("refuses a file with no extension when restricted", () => {
    expect(checkFileAllowed(settings({ allowedFileTypes: ["pdf"] }), "README").ok).toBe(false);
  });

  it("enforces the size limit", () => {
    const result = checkFileAllowed(settings({ maxFileSizeMb: 1 }), "a.pdf", 2 * 1024 * 1024);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("1 MB");
  });

  it("accepts a file at exactly the limit", () => {
    expect(checkFileAllowed(settings({ maxFileSizeMb: 1 }), "a.pdf", 1024 * 1024).ok).toBe(true);
  });

  it("parses extensions predictably", () => {
    expect(normaliseExtension("a.b.PDF")).toBe("pdf");
    expect(normaliseExtension("noext")).toBeNull();
    expect(normaliseExtension(".hidden")).toBeNull();
    expect(normaliseExtension("trailing.")).toBeNull();
  });
});

describe("scope construction", () => {
  it("derives retrievable tiers from the stored membership", () => {
    const s = scopeFromMembership(member({ role: "admin", accessLevel: "management" }));
    expect(s).toEqual({
      workspaceId: WS,
      userId: "user-bob",
      role: "admin",
      accessLevels: ["all-team", "management"],
    });
  });
});

describe("role ranking", () => {
  it("orders member < admin < owner", () => {
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("admin", "admin")).toBe(true);
    expect(roleAtLeast("member", "admin")).toBe(false);
  });

  it("treats an unknown role as least privileged", () => {
    expect(roleAtLeast("superuser" as MemberRole, "admin")).toBe(false);
  });
});

describe("cross-cutting: a shared document is visible to a peer", () => {
  it("lets a colleague retrieve a shared document at their tier", () => {
    const bob = scope({ userId: "user-bob" });
    const shared: DocVisibility = "shared";
    expect(canRetrieveDocument(bob, doc({ ownerId: "user-ann", visibility: shared }))).toBe(true);
  });
});
