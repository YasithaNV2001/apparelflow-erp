import type { Role } from "./constants";

export interface RoleProfile {
  /** Shown in badges, the role switcher and the demo panel. */
  label: string;
  /** One-line duty for the demo panel (PLAN §8.1). */
  duty: string;
  /** Where the role lands after signing in; the only area its navigation shows. */
  home: string;
  /** Navigation label for that area. */
  areaName: string;
}

export const ROLE_PROFILES: Readonly<Record<Role, RoleProfile>> = {
  cutting_supervisor: {
    label: "Cutting Supervisor",
    duty: "Creates cutting orders from recipes and logs the fabric used.",
    home: "/cutting",
    areaName: "Cutting orders",
  },
  cutting_verifier: {
    label: "Cutting Verifier",
    duty: "Counts every cut component and approves or rejects the batch.",
    home: "/verification",
    areaName: "Verification queue",
  },
  sewing_supervisor: {
    label: "Sewing Supervisor",
    duty: "Receives verified batches and starts sewing assembly.",
    home: "/sewing",
    areaName: "Sewing queue",
  },
};
