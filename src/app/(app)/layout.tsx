import { AppHeader } from "@/components/layout/app-header";
import { requireUser } from "@/server/auth/current-user";

/** Every page in (app) needs a signed-in user; anyone else is sent to /login. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
