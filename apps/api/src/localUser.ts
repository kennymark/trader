import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { user } from "./db/schema.js";

export const LOCAL_USER_ID = process.env.LOCAL_USER_ID || "local-user";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};

export async function ensureLocalUser(): Promise<SessionUser> {
  const [existing] = await db.select().from(user).where(eq(user.id, LOCAL_USER_ID));
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      image: existing.image,
    };
  }

  const local: SessionUser = {
    id: LOCAL_USER_ID,
    name: "Local",
    email: process.env.LOCAL_USER_EMAIL || "local@trader.local",
    image: null,
  };

  await db.insert(user).values({
    id: local.id,
    name: local.name,
    email: local.email,
    emailVerified: true,
    image: null,
  });

  return local;
}
