import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

/**
 * End-to-end exercise of the workspace lifecycle against the real storage
 * layer (the local JSON backend), rather than mocks. This catches the wiring
 * that the pure authz tests cannot: id construction, persistence shape, and
 * whether a member admitted by one route is actually visible to another.
 */

process.env.LOCAL_DEMO_STORAGE = "true";

let workdir: string;

// Imported lazily so MINDBASE_DATA_DIR is set before the module reads it.
type Mod = typeof import("@/lib/workspaces");
let ws: Mod;

beforeAll(async () => {
  workdir = await fs.mkdtemp(path.join(os.tmpdir(), "mindbase-test-"));
  process.env.MINDBASE_DATA_DIR = workdir;
  ws = await import("@/lib/workspaces");
}, 60_000); // firebase-admin is a large graph to import once.

afterAll(async () => {
  delete process.env.MINDBASE_DATA_DIR;
  await fs.rm(workdir, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(path.join(workdir, "mindbase.json"), { force: true });
});

const ann = {
  userId: "uid-ann",
  email: "ann@acme.test",
  displayName: "Ann",
};
const bob = { userId: "uid-bob", email: "bob@acme.test", displayName: "Bob" };

describe("workspace creation", () => {
  it("seeds the creator as owner in the same step", async () => {
    const workspace = await ws.createWorkspace({
      name: "Acme",
      type: "org",
      owner: ann,
    });

    const membership = await ws.getMembership(workspace.id, ann.userId);
    expect(membership?.role).toBe("owner");
    expect(membership?.accessLevel).toBe("management-investees");
  });

  it("gives org workspaces a join code and personal ones none", async () => {
    const org = await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    const personal = await ws.ensurePersonalWorkspace(bob);

    expect(org.joinCode).toMatch(/^[A-Z2-9]{8}$/);
    expect(personal.joinCode).toBeUndefined();
  });

  it("is idempotent for the personal workspace", async () => {
    const first = await ws.ensurePersonalWorkspace(ann);
    const second = await ws.ensurePersonalWorkspace(ann);
    expect(second.id).toBe(first.id);
    expect(await ws.listWorkspacesForUser(ann.userId)).toHaveLength(1);
  });
});

describe("join by code", () => {
  it("finds a workspace by its code, case-insensitively", async () => {
    const org = await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    const found = await ws.findWorkspaceByJoinCode(org.joinCode!.toLowerCase());
    expect(found?.id).toBe(org.id);
  });

  it("returns nothing for an unknown code", async () => {
    await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    expect(await ws.findWorkspaceByJoinCode("ZZZZZZZZ")).toBeNull();
  });

  it("does not create a second pending request when asked twice", async () => {
    const org = await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    await ws.createJoinRequest({ workspaceId: org.id, user: bob });
    await ws.createJoinRequest({ workspaceId: org.id, user: bob });

    const pending = await ws.listJoinRequests(org.id, "pending");
    expect(pending).toHaveLength(1);
  });
});

describe("admission", () => {
  it("makes an approved requester a real member", async () => {
    const org = await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    const request = await ws.createJoinRequest({
      workspaceId: org.id,
      user: bob,
    });

    await ws.saveMembership({
      id: ws.membershipId(org.id, bob.userId),
      workspaceId: org.id,
      userId: bob.userId,
      email: bob.email,
      role: "member",
      accessLevel: "all-team",
      joinedAt: new Date().toISOString(),
    });
    await ws.saveJoinRequest({ ...request, status: "approved" });

    expect((await ws.getMembership(org.id, bob.userId))?.role).toBe("member");
    expect(await ws.listMembers(org.id)).toHaveLength(2);
    // And the workspace now shows up for Bob, not just for Ann.
    expect(
      (await ws.listWorkspacesForUser(bob.userId)).map((w) => w.id),
    ).toContain(org.id);
  });

  it("removes a member without touching anyone else", async () => {
    const org = await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    await ws.saveMembership({
      id: ws.membershipId(org.id, bob.userId),
      workspaceId: org.id,
      userId: bob.userId,
      email: bob.email,
      role: "member",
      accessLevel: "all-team",
      joinedAt: new Date().toISOString(),
    });

    await ws.removeMembership(org.id, bob.userId);

    expect(await ws.getMembership(org.id, bob.userId)).toBeNull();
    expect(await ws.getMembership(org.id, ann.userId)).not.toBeNull();
  });
});

describe("notifications", () => {
  it("delivers a direct notice to its recipient only", async () => {
    const org = await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    await ws.createNotification({
      workspaceId: org.id,
      userId: bob.userId,
      fromUserId: ann.userId,
      body: "Please re-upload the Q3 deck.",
    });

    expect(await ws.listNotificationsFor(org.id, bob.userId)).toHaveLength(1);
    expect(await ws.listNotificationsFor(org.id, ann.userId)).toHaveLength(0);
  });

  it("delivers a broadcast to everyone", async () => {
    const org = await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    await ws.createNotification({
      workspaceId: org.id,
      userId: null,
      fromUserId: ann.userId,
      body: "Office closed Friday.",
    });

    expect(await ws.listNotificationsFor(org.id, bob.userId)).toHaveLength(1);
    expect(await ws.listNotificationsFor(org.id, ann.userId)).toHaveLength(1);
  });

  it("does not leak notifications across workspaces", async () => {
    const a = await ws.createWorkspace({ name: "A", type: "org", owner: ann });
    const b = await ws.createWorkspace({ name: "B", type: "org", owner: ann });
    await ws.createNotification({
      workspaceId: a.id,
      userId: null,
      fromUserId: ann.userId,
      body: "Only for A.",
    });

    expect(await ws.listNotificationsFor(b.id, ann.userId)).toHaveLength(0);
  });

  // A broadcast is one shared row; one reader must not mark it read for all.
  it("will not let a reader mark a broadcast read for everyone", async () => {
    const org = await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    const notice = await ws.createNotification({
      workspaceId: org.id,
      userId: null,
      fromUserId: ann.userId,
      body: "All hands.",
    });

    await ws.markNotificationRead(notice.id, bob.userId);

    const [seen] = await ws.listNotificationsFor(org.id, ann.userId);
    expect(seen.readAt).toBeUndefined();
  });
});

describe("audit trail", () => {
  it("records privileged actions newest first", async () => {
    const org = await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    await ws.recordAudit({
      workspaceId: org.id,
      actor: ann,
      action: "member.removed",
      targetType: "member",
      targetId: bob.userId,
      detail: "first",
    });
    await ws.recordAudit({
      workspaceId: org.id,
      actor: ann,
      action: "document.deleted-by-admin",
      targetType: "document",
      targetId: "doc-9",
      detail: "second",
    });

    const events = await ws.listAudit(org.id);
    expect(events).toHaveLength(2);
    expect(events[0].detail).toBe("second");
    expect(events[0].actorEmail).toBe(ann.email);
  });

  it("scopes the trail to one workspace", async () => {
    const a = await ws.createWorkspace({ name: "A", type: "org", owner: ann });
    const b = await ws.createWorkspace({ name: "B", type: "org", owner: ann });
    await ws.recordAudit({
      workspaceId: a.id,
      actor: ann,
      action: "notification.sent",
      targetType: "member",
      targetId: "all",
    });

    expect(await ws.listAudit(b.id)).toHaveLength(0);
  });
});

describe("settings", () => {
  it("persists an upload restriction", async () => {
    const org = await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    await ws.updateWorkspaceSettings(org.id, {
      allowedFileTypes: ["pdf", "md"],
      maxFileSizeMb: 10,
    });

    const reloaded = await ws.getWorkspace(org.id);
    expect(reloaded?.settings.allowedFileTypes).toEqual(["pdf", "md"]);
    expect(reloaded?.settings.maxFileSizeMb).toBe(10);
  });

  it("defaults to unrestricted uploads", async () => {
    const org = await ws.createWorkspace({ name: "Acme", type: "org", owner: ann });
    expect(org.settings.allowedFileTypes).toBeNull();
  });
});
