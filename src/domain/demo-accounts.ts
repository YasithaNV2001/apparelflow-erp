import type { Role } from "./constants";

/**
 * Public demo credentials (PLAN §6.3, D22). They are meant to be seen: the login page shows
 * them, the README lists them and the seed creates them. Real logins, never a backdoor.
 */
export const DEMO_PASSWORD = "ApparelFlow#2026";

export interface DemoAccount {
  role: Role;
  email: string;
  fullName: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    role: "cutting_supervisor",
    email: "cutting.supervisor@apparelflow.test",
    fullName: "Demo Cutting Supervisor",
  },
  {
    role: "cutting_verifier",
    email: "cutting.verifier@apparelflow.test",
    fullName: "Demo Cutting Verifier",
  },
  {
    role: "sewing_supervisor",
    email: "sewing.supervisor@apparelflow.test",
    fullName: "Demo Sewing Supervisor",
  },
];
