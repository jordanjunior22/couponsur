import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type PostAuthorRole = "USER" | "ADMIN";
export type PollOption = "A" | "B";

// Same "denormalized at write time" reasoning as GroupMessage.phone — a
// comment renders without a join, and a deleted/renamed account doesn't
// blank out old comments. Masked only on the way out (maskPhone), same as
// group chat.
export interface IPostComment {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  phone: string;
  role: PostAuthorRole;
  text: string;
  createdAt: Date;
}

// Never exposed to the client as a list — only aggregate counts + the
// requesting viewer's own entry (see app/api/posts/route.ts). This is what
// makes a vote here an anonymous-ballot poll, not a public "who voted for
// what" log.
export interface IPostVote {
  user: Types.ObjectId;
  option: PollOption;
}

export interface IPoll {
  optionALabel: string;
  optionBLabel: string;
}

// Admin-authored news feed content — text + an optional photo, buyers
// like/comment/share, and a post can optionally carry a two-option
// "team vs team" poll (the post's own photo doubles as the matchup
// graphic; the poll itself is just the two vote labels + tallies).
export interface IPost extends Document {
  text: string;
  image: string | null; // data URI, same convention as GroupMessage.image
  imageBytes: number;
  poll: IPoll | null;
  votes: Types.DocumentArray<IPostVote>;
  likes: Types.ObjectId[]; // user ids — toggle via $addToSet/$pull, count via .length
  // DocumentArray (not a plain array) so comments.id(commentId) resolves a
  // single subdocument for deletion (see the comment-delete route).
  comments: Types.DocumentArray<IPostComment>;
  shareCount: number;
  // Same draft/publish convention as Picks.is_published — lets an admin
  // stage a post (or unpublish one) without deleting it outright.
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PostCommentSchema = new Schema<IPostComment>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    phone: { type: String, required: true },
    role: { type: String, enum: ["USER", "ADMIN"], required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const PostVoteSchema = new Schema<IPostVote>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    option: { type: String, enum: ["A", "B"], required: true },
  },
  { _id: false }
);

const PollSchema = new Schema<IPoll>(
  {
    optionALabel: { type: String, required: true, trim: true, maxlength: 60 },
    optionBLabel: { type: String, required: true, trim: true, maxlength: 60 },
  },
  { _id: false }
);

const PostSchema = new Schema<IPost>(
  {
    text: { type: String, default: "", trim: true, maxlength: 2000 },
    image: { type: String, default: null },
    imageBytes: { type: Number, default: 0 },
    poll: { type: PollSchema, default: null },
    votes: { type: [PostVoteSchema], default: [] },
    likes: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    comments: { type: [PostCommentSchema], default: [] },
    shareCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Feed reads are always "published, newest first".
PostSchema.index({ isPublished: 1, createdAt: -1 });

const PostModel: Model<IPost> =
  mongoose.models.Post || mongoose.model<IPost>("Post", PostSchema, "posts");

export default PostModel;
