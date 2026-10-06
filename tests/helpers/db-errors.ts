/**
 * Runs a statement that must fail and returns the database's own error message.
 * Drizzle wraps driver errors, so the trigger's text (e.g. "HARD_STOP: …") sits in `cause`.
 */
export async function rejectionMessage(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return innermostMessage(error);
  }
  throw new Error("Expected the database to reject the statement, but it succeeded");
}

function innermostMessage(error: unknown): string {
  let current = error;
  while (current instanceof Error && current.cause instanceof Error) {
    current = current.cause;
  }
  return current instanceof Error ? current.message : String(current);
}
