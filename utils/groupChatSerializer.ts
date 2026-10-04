// One place that shapes a group chat message for the client - used by the
// history GET/POST (app/api/group-chat/route.ts) and by the edit / pin /
// react / report PATCH (app/api/group-chat/[messageId]/route.ts), which used
// to each keep their own copy.
//
// Pictures never ride along as data URIs: the message JSON is polled every
// few seconds, so each picture is served from its own cacheable address
// (app/api/group-chat/image/[messageId]) instead.
import { maskPhone } from "@/utils/maskPhone";

// Allowed reactions, in display order. Anything else is rejected on write.
export const REACTION_EMOJIS = ["👍", "❤️", "🔥", "😂", "😮", "👏"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isReactionEmoji(v: unknown): v is ReactionEmoji {
  return typeof v === "string" && (REACTION_EMOJIS as readonly string[]).includes(v);
}

interface SerializableGroupMessage {
  _id: { toString(): string };
  user: { toString(): string };
  phone: string;
  role: "USER" | "ADMIN";
  nickname?: string | null;
  text: string;
  image?: string | null;
  imageBytes?: number;
  replyTo?: {
    messageId: { toString(): string };
    user: { toString(): string };
    role: "USER" | "ADMIN";
    phone: string;
    nickname?: string | null;
    text: string;
  } | null;
  pinned: boolean;
  reactions?: Record<string, { toString(): string }[]> | null;
  reports?: { toString(): string }[] | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
  editedAt?: Date | string | null;
}

export interface SerializeOptions {
  senderBlocked: boolean;
  viewerId: string;
  viewerIsAdmin: boolean;
  /** Pass when the message was loaded WITHOUT its image field (the feed
   *  queries do that on purpose); otherwise presence is read from `image`. */
  hasImage?: boolean;
}

export function toClientMessage(msg: SerializableGroupMessage, opts: SerializeOptions) {
  const id = msg._id.toString();
  const hasImage = opts.hasImage ?? !!msg.image;

  const reactionMap = msg.reactions ?? {};
  const reactions = REACTION_EMOJIS.map((emoji) => {
    const users = (reactionMap[emoji] ?? []).map((u) => u.toString());
    return { emoji, count: users.length, mine: users.includes(opts.viewerId) };
  }).filter((r) => r.count > 0);

  const reports = (msg.reports ?? []).map((u) => u.toString());

  return {
    _id: id,
    user: msg.user.toString(),
    phone: maskPhone(msg.phone),
    role: msg.role,
    nickname: msg.nickname || null,
    senderBlocked: opts.senderBlocked,
    text: msg.text,
    image: hasImage ? `/api/group-chat/image/${id}?v=${msg.imageBytes ?? 0}` : null,
    replyTo: msg.replyTo
      ? {
          messageId: msg.replyTo.messageId.toString(),
          user: msg.replyTo.user.toString(),
          role: msg.replyTo.role,
          phone: maskPhone(msg.replyTo.phone),
          nickname: msg.replyTo.nickname || null,
          text: msg.replyTo.text,
        }
      : null,
    pinned: msg.pinned,
    reactions,
    // Only admins learn how many people flagged a message; everyone else
    // just learns whether THEY already did (to hide the button).
    reportCount: opts.viewerIsAdmin ? reports.length : 0,
    reportedByMe: reports.includes(opts.viewerId),
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt ?? msg.createdAt,
    editedAt: msg.editedAt ?? null,
  };
}
