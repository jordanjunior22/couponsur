// ─── scripts/bootstrap-super-admin.ts ────────────────────────────────────────
//
// One-time setup: flips isSuperAdmin: true on your own account. There's no
// UI path to create the first super admin — every UI/API gate that creates
// admins or sets revenue shares requires already being one — so this has to
// be done by hand, once, directly against the DB.
//
// RUN WITH:
//   npx tsx scripts/bootstrap-super-admin.ts <phone>
//
// REQUIRES:
//   MONGODB_URI available in your environment the same way your app loads
//   it (see utils/ConnectDb.ts) — export it in your shell, or run via
//   `npx dotenv -e .env.local -- npx tsx scripts/bootstrap-super-admin.ts <phone>`
//   if you keep it in .env.local.
//
// After running, log out and back in — isSuperAdmin is baked into the JWT
// at login, same as role, so an already-issued token won't see the change
// until it's reissued.
// ─────────────────────────────────────────────────────────────────────────────

import { connectDB } from "../utils/ConnectDb";
import UserModel, { UserRole } from "../models/Users";
import { normalizeUserPhone } from "../utils/normalizeUserPhone";

async function main() {
  const rawPhone = process.argv[2];
  if (!rawPhone) {
    console.error("Usage: npx tsx scripts/bootstrap-super-admin.ts <phone>");
    process.exit(1);
  }

  const phone = normalizeUserPhone(rawPhone);
  await connectDB();

  const user = await UserModel.findOne({ phone });
  if (!user) {
    console.error(`No account found for phone ${phone}`);
    process.exit(1);
  }

  user.role = UserRole.ADMIN;
  user.isSuperAdmin = true;
  await user.save();

  console.log(`✅ ${phone} is now the super admin (role: ${user.role}, isSuperAdmin: true).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("BOOTSTRAP SUPER ADMIN ERROR:", err);
  process.exit(1);
});
