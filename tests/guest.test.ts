import { describe, expect, it } from "vitest";
import { HttpError, requireFullAccount } from "@/lib/auth";

const member = { userId: "u1", email: "ann@acme.test" };
const guest = { userId: "g1", email: "guest-g1@demo.invalid", guest: true };

describe("demo guests", () => {
  it("lets a full account through", () => {
    expect(() => requireFullAccount(member, "join a workspace")).not.toThrow();
  });

  it("refuses a guest with a 403 that says what to do", () => {
    try {
      requireFullAccount(guest, "join a workspace");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(403);
      expect((error as HttpError).message).toBe("Create an account to join a workspace.");
    }
  });
});
