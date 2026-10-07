import type { ApiClientError } from "@/lib/api-client";

interface HardStopDetail {
  component: string;
  shortBy?: number;
}

function isHardStopDetail(value: unknown): value is HardStopDetail {
  return typeof value === "object" && value !== null && typeof (value as HardStopDetail).component === "string";
}

/** The components a 422 hard stop names, e.g. "Sleeve Cuffs (short by 4)". */
function hardStopComponents(error: ApiClientError): string[] {
  if (!error.code.startsWith("HARD_STOP") || !Array.isArray(error.details)) {
    return [];
  }
  return error.details
    .filter(isHardStopDetail)
    .map((detail) =>
      detail.shortBy === undefined ? detail.component : `${detail.component} (short by ${detail.shortBy})`,
    );
}

/** A refused approve or reject, with the server's reason and any components it names. */
export function DecisionError({ error }: { error: ApiClientError }) {
  const components = hardStopComponents(error);
  return (
    <div role="alert" className="rounded-md border border-error bg-status-red px-3 py-2 text-sm text-status-red-ink">
      <p className="font-semibold">{error.message}</p>
      {components.length > 0 ? (
        <ul className="mt-1 list-disc pl-5">
          {components.map((component) => (
            <li key={component}>{component}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
