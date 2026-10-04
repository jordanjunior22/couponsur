// Shapes a support-chat Conversation for the client. The one job: a message's
// picture (a large data URI) must never ride along inside the conversation
// JSON — the widget polls it every few seconds. Instead each picture message
// gets a URL to /api/chat/image/[conversationId]/[messageId], which the
// browser downloads once and caches. `v` (the stored byte size) only changes
// if the picture does.
//
// Accepts a lean object or a hydrated document; routes that load messages
// with `.select("-messages.image")` rely on `imageBytes` (always written
// together with `image`) to know a picture exists.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function serializeConversation(conv: any) {
  if (!conv) return conv;
  const plain = typeof conv.toObject === "function" ? conv.toObject() : conv;
  const conversationId = String(plain._id);

  return {
    ...plain,
    messages: (plain.messages ?? []).map((m: any) => {
      const { image, imageBytes, ...rest } = m;
      const hasImage = !!image || (imageBytes ?? 0) > 0;
      return {
        ...rest,
        _id: m._id ? String(m._id) : m._id,
        image: hasImage ? `/api/chat/image/${conversationId}/${String(m._id)}?v=${imageBytes ?? 0}` : null,
      };
    }),
  };
}
