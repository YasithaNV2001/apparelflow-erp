// JSON shapes of our API responses (PLAN §7.1). Shared by the server services that build them
// and the browser code that reads them, so both sides agree at compile time.
import type {
  ComponentStatus,
  OrderStatus,
  Role,
  VerificationDecision,
} from "@/domain/constants";
import type { CountSummary } from "@/domain/traffic-light";

export interface RecipeComponentDto {
  id: number;
  name: string;
  piecesPerGarment: number;
  imageUrl: string | null;
}

export interface RecipeDto {
  id: number;
  code: string;
  name: string;
  category: string;
  stdFabricYards: number;
  wastageCap: number;
  components: RecipeComponentDto[];
}

export interface UserRefDto {
  id: number;
  fullName: string;
}

export interface UserDto extends UserRefDto {
  email: string;
  role: Role;
}

export interface OrderItemDto {
  componentId: number;
  componentName: string;
  piecesPerGarment: number;
  expectedQty: number;
  /** null = not counted yet. */
  actualQty: number | null;
  /** actual − expected; null while not counted. */
  variance: number | null;
  status: ComponentStatus;
}

export interface VarianceDto {
  componentId: number;
  componentName: string;
  expected: number;
  actual: number | null;
  variance: number | null;
  status: ComponentStatus;
}

export interface VerificationLogDto {
  id: number;
  decision: VerificationDecision;
  verifier: UserRefDto;
  rejectionNote: string | null;
  approvalNote: string | null;
  verificationRound: number;
  wastagePct: number;
  wastageExceedsCap: boolean;
  variances: VarianceDto[];
  createdAt: string;
}

/** Fields every order view shares (list rows and detail). */
export interface OrderSummaryDto {
  id: number;
  orderNo: string;
  status: OrderStatus;
  verificationRound: number;
  recipe: { id: number; code: string; name: string; category: string };
  targetQty: number;
  fabricRollId: string;
  actualFabricYds: number;
  expectedFabricYds: number;
  wastagePct: number;
  wastageCap: number;
  wastageExceedsCap: boolean;
  summary: CountSummary;
  createdBy: UserRefDto;
  createdAt: string;
  submittedAt: string | null;
}

export interface OrderListItemDto extends OrderSummaryDto {
  /** The most recent verifier decision, shown in the supervisor's table. */
  latestLog: VerificationLogDto | null;
}

export interface OrderDto extends OrderSummaryDto {
  items: OrderItemDto[];
  /** Every decision, oldest first. */
  logs: VerificationLogDto[];
}

/**
 * A batch as the sewing supervisor receives it (PLAN §7.2): its counts and the approval that
 * released it. Earlier rejections never travel to sewing.
 */
export interface SewingOrderDto extends OrderSummaryDto {
  items: OrderItemDto[];
  approval: VerificationLogDto;
  /** Who pressed "Start Sewing Assembly", and when; null while the batch waits in the queue. */
  sewingStartedBy: UserRefDto | null;
  sewingStartedAt: string | null;
}
