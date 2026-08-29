import { describe, expect, it, vi } from "vitest";
import type { Model } from "mongoose";
import {
  getLeadStats,
  getLeadStatus,
  getLeadStatusesForUsers,
  listLeads,
  setLeadStatus,
} from "../../src/modules/messenger/lead.store.js";
import type { LeadDoc } from "../../src/modules/messenger/lead.model.js";

vi.mock("../../src/config/env.js", () => ({
  mongoConfig: {
    leadsCollection: "leads",
    conversationsCollection: "conversation_messages",
  },
}));

function chainable(resolvedValue: unknown) {
  const node: {
    sort: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    lean: ReturnType<typeof vi.fn>;
  } = {
    sort: vi.fn(() => node),
    limit: vi.fn(() => node),
    select: vi.fn(() => node),
    lean: vi.fn().mockResolvedValue(resolvedValue),
  };
  return node;
}

function fakeModel(overrides: Record<string, unknown>) {
  return overrides as unknown as Model<LeadDoc>;
}

describe("setLeadStatus", () => {
  it("upserts the status, note, and a fresh markedAt", async () => {
    const updateOne = vi.fn().mockResolvedValue({});
    const model = fakeModel({ updateOne });

    await setLeadStatus("user-1", "lead", "interested in ecommerce site", model);

    expect(updateOne).toHaveBeenCalledOnce();
    const [filter, update, options] = updateOne.mock.calls[0];
    expect(filter).toEqual({ userId: "user-1" });
    expect(update.$set.status).toBe("lead");
    expect(update.$set.note).toBe("interested in ecommerce site");
    expect(update.$set.markedAt).toBeInstanceOf(Date);
    expect(options).toEqual({ upsert: true });
  });
});

describe("getLeadStatus", () => {
  it("returns null when the user has never been marked", async () => {
    const findOne = vi.fn(() => chainable(null));
    const model = fakeModel({ findOne });

    expect(await getLeadStatus("user-1", model)).toBeNull();
  });

  it("returns the stored status/note/markedAt", async () => {
    const markedAt = new Date("2026-01-01T00:00:00Z");
    const findOne = vi.fn(() => chainable({ status: "sale", note: "closed", markedAt }));
    const model = fakeModel({ findOne });

    expect(await getLeadStatus("user-1", model)).toEqual({
      status: "sale",
      note: "closed",
      markedAt,
    });
  });
});

describe("getLeadStatusesForUsers", () => {
  it("returns an empty map without querying for an empty user list", async () => {
    const find = vi.fn();
    const model = fakeModel({ find });

    const result = await getLeadStatusesForUsers([], model);

    expect(result.size).toBe(0);
    expect(find).not.toHaveBeenCalled();
  });

  it("builds a userId -> status map from the batch query", async () => {
    const find = vi.fn(() =>
      chainable([
        { userId: "user-1", status: "lead" },
        { userId: "user-2", status: "sale" },
      ])
    );
    const model = fakeModel({ find });

    const result = await getLeadStatusesForUsers(["user-1", "user-2", "user-3"], model);

    expect(result.get("user-1")).toBe("lead");
    expect(result.get("user-2")).toBe("sale");
    expect(result.has("user-3")).toBe(false);
  });
});

describe("listLeads", () => {
  it("defaults to excluding status none", async () => {
    const find = vi.fn(() => chainable([]));
    const model = fakeModel({ find });

    await listLeads({}, model);

    expect(find).toHaveBeenCalledWith({ status: { $ne: "none" } });
  });

  it("filters by an explicit status when given", async () => {
    const find = vi.fn(() => chainable([]));
    const model = fakeModel({ find });

    await listLeads({ status: "sale" }, model);

    expect(find).toHaveBeenCalledWith({ status: "sale" });
  });
});

describe("getLeadStats", () => {
  it("combines distinct conversation count with lead/sale counts", async () => {
    const leadModel = fakeModel({
      countDocuments: vi
        .fn()
        .mockResolvedValueOnce(5) // status: "lead"
        .mockResolvedValueOnce(2), // status: "sale"
    });
    const conversationModel = {
      distinct: vi.fn().mockResolvedValue(["u1", "u2", "u3", "u4", "u5", "u6", "u7"]),
    };

    const stats = await getLeadStats(leadModel, conversationModel as any);

    expect(stats).toEqual({ totalConversations: 7, totalLeads: 5, totalSales: 2 });
  });
});
