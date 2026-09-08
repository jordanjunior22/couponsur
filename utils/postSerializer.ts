// Shapes an IPost document (lean or hydrated) for the client — shared by
// every route that returns a post (the feed GET, and like/vote/comment
// mutations that hand back the updated post) so there's one place that
// decides what a viewer is and isn't allowed to see:
//   - `votes` is NEVER sent as a list, only aggregate counts + the
//     viewer's own choice (`myVote`) — that's what keeps a poll an
//     anonymous ballot instead of a public "who voted for what" log.
//   - comment phones are masked the same way group chat already masks
//     them (maskPhone), never sent in full.
import { maskPhone } from "@/utils/maskPhone";

// Loosely typed on purpose — the same document can arrive here either
// hydrated (a Mongoose Document, e.g. right after post.save()) or lean
// (a plain object from .lean()), and only the handful of fields actually
// read below matter for serialization. Mirrors LeanGroupMessage's role in
// app/api/group-chat/route.ts.
interface SerializablePost {
  _id: { toString(): string };
  authorName?: string;
  text: string;
  image: string | null;
  shareCount?: number;
  createdAt: Date | string;
  poll?: { optionALabel: string; optionBLabel: string } | null;
  votes?: { user: { toString(): string }; option: "A" | "B" }[];
  likes?: { toString(): string }[];
  comments?: {
    _id: { toString(): string };
    user: { toString(): string };
    phone: string;
    role: "USER" | "ADMIN";
    text: string;
    createdAt: Date | string;
  }[];
}

export function toClientPost(post: SerializablePost, viewerId: string | null) {
  const likes = post.likes || [];
  const likedByMe = !!viewerId && likes.some((id) => id.toString() === viewerId);

  let poll = null;
  if (post.poll) {
    const votes = post.votes || [];
    const countA = votes.filter((v) => v.option === "A").length;
    const countB = votes.filter((v) => v.option === "B").length;
    const mine = viewerId ? votes.find((v) => v.user.toString() === viewerId) : undefined;
    poll = {
      optionALabel: post.poll.optionALabel,
      optionBLabel: post.poll.optionBLabel,
      counts: { a: countA, b: countB },
      total: countA + countB,
      myVote: mine ? mine.option : null,
    };
  }

  return {
    _id: post._id.toString(),
    // Documents written before this field existed have no authorName at
    // all — same "missing means the old default" fallback used throughout
    // this codebase (e.g. groupChatEnabled's `!== false`).
    authorName: post.authorName || "Coupon Sûr",
    text: post.text,
    image: post.image,
    poll,
    likeCount: likes.length,
    likedByMe,
    shareCount: post.shareCount || 0,
    comments: (post.comments || []).map((c) => ({
      _id: c._id.toString(),
      user: c.user.toString(),
      phone: maskPhone(c.phone),
      role: c.role,
      text: c.text,
      createdAt: c.createdAt,
      isMine: !!viewerId && c.user.toString() === viewerId,
    })),
    createdAt: post.createdAt,
  };
}
