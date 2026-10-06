import { redirect } from "next/navigation";
import { ROLE_PROFILES } from "@/domain/roles";
import { getCurrentUser } from "@/server/auth/current-user";

/** "/" has no content of its own: it sends each user to their role's home, or to sign-in (PLAN §8.1). */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? ROLE_PROFILES[user.role].home : "/login");
}
