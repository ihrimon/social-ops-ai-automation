import { describe, expect, it, vi, beforeEach } from "vitest";

const graphGetMock = vi.fn();

vi.mock("../../src/integrations/facebook/graph-client.js", () => ({
  graphGet: graphGetMock,
}));

const { extractFacebookPostId, getPostEngagement } =
  await import("../../src/modules/content/engagement.service.js");

describe("extractFacebookPostId", () => {
  it("prefers post_id (photo post response shape)", () => {
    expect(extractFacebookPostId({ id: "photo-id-1", post_id: "page_123" })).toBe("page_123");
  });

  it("falls back to id (text post response shape)", () => {
    expect(extractFacebookPostId({ id: "page_456" })).toBe("page_456");
  });

  it("returns null for a missing/malformed response", () => {
    expect(extractFacebookPostId(null)).toBeNull();
    expect(extractFacebookPostId(undefined)).toBeNull();
    expect(extractFacebookPostId({})).toBeNull();
    expect(extractFacebookPostId({ id: 12345 })).toBeNull();
  });
});

describe("getPostEngagement", () => {
  beforeEach(() => {
    graphGetMock.mockReset();
  });

  it("reads likes/comments/shares/permalink from the Graph API response", async () => {
    graphGetMock.mockResolvedValue({
      data: {
        likes: { summary: { total_count: 10 } },
        comments: { summary: { total_count: 3 } },
        shares: { count: 2 },
        permalink_url: "https://facebook.com/page/posts/123",
      },
    });

    const result = await getPostEngagement("page_unique-1");

    expect(result).toEqual({
      likes: 10,
      comments: 3,
      shares: 2,
      permalinkUrl: "https://facebook.com/page/posts/123",
    });
  });

  it("treats a missing shares field as zero, not an error", async () => {
    graphGetMock.mockResolvedValue({
      data: {
        likes: { summary: { total_count: 1 } },
        comments: { summary: { total_count: 0 } },
        // no `shares` key at all -- Facebook omits it when the count is 0
      },
    });

    const result = await getPostEngagement("page_unique-2");

    expect(result?.shares).toBe(0);
  });

  it("returns null (rather than throwing) when the Graph API call fails", async () => {
    graphGetMock.mockRejectedValue(new Error("Facebook Graph API request failed: rate limited"));

    const result = await getPostEngagement("page_unique-3");

    expect(result).toBeNull();
  });

  it("serves a cached result on a second call without hitting the Graph API again", async () => {
    graphGetMock.mockResolvedValue({
      data: { likes: { summary: { total_count: 5 } }, comments: { summary: { total_count: 1 } } },
    });

    const first = await getPostEngagement("page_unique-4");
    const second = await getPostEngagement("page_unique-4");

    expect(first).toEqual(second);
    expect(graphGetMock).toHaveBeenCalledOnce();
  });
});
