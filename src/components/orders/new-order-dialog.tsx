"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import {
  checkNewOrderForm,
  previewOrder,
  type NewOrderFormValues,
} from "@/domain/order-form";
import type { OrderDto, RecipeDto } from "@/lib/api-types";
import { formatYards } from "@/lib/format";
import { serverFieldErrors, useCreateOrder, useRecipes } from "./order-queries";
import { WastageValue } from "./wastage-value";

const EMPTY_FORM: NewOrderFormValues = {
  recipeId: "",
  targetQty: "",
  fabricRollId: "",
  actualFabricYds: "",
};

type Field = keyof NewOrderFormValues;

interface NewOrderDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (order: OrderDto) => void;
}

/**
 * The New Cutting Order form (PLAN §8.2). Every keystroke re-checks the fields with the same
 * parsers and schemas the API uses and updates the live preview of counts, fabric and wastage.
 */
export function NewOrderDialog({ open, onClose, onCreated }: NewOrderDialogProps) {
  const recipes = useRecipes();
  const createOrder = useCreateOrder();
  const [form, setForm] = useState<NewOrderFormValues>(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const recipeSelectId = useId();
  const recipeErrorId = `${recipeSelectId}-error`;

  const check = checkNewOrderForm(form);
  const serverErrors = serverFieldErrors(createOrder.error);
  const recipe = recipes.data?.find((candidate) => candidate.id === check.values.recipeId) ?? null;

  /** Errors appear as soon as a field has content or has been left, never on a pristine form. */
  function errorFor(field: Field): string | undefined {
    const visible = touched[field] === true || form[field] !== "";
    return (visible ? check.errors[field] : undefined) ?? serverErrors[field];
  }

  function update(field: Field, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function markTouched(field: Field) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function close() {
    setForm(EMPTY_FORM);
    setTouched({});
    createOrder.reset();
    onClose();
  }

  function create(submitForVerification: boolean) {
    if (!check.payload) {
      return;
    }
    createOrder.mutate(
      { ...check.payload, submitForVerification },
      {
        onSuccess: (order) => {
          onCreated(order);
          close();
        },
      },
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create(true);
  }

  const recipeError = errorFor("recipeId");
  const isBlocked = check.payload === null || createOrder.isPending;

  return (
    <Dialog open={open} title="New cutting order" onClose={close}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor={recipeSelectId} className="text-sm font-medium text-ink">
              Recipe
            </label>
            <select
              id={recipeSelectId}
              value={form.recipeId}
              onChange={(event) => update("recipeId", event.target.value)}
              onBlur={() => markTouched("recipeId")}
              aria-invalid={recipeError ? true : undefined}
              aria-describedby={recipeError ? recipeErrorId : undefined}
              className="min-h-11 rounded-md px-3 text-base aria-invalid:border-2 aria-invalid:border-error"
            >
              <option value="">{recipes.isPending ? "Loading recipes…" : "Choose a recipe"}</option>
              {recipes.data?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.code})
                </option>
              ))}
            </select>
            {recipeError ? (
              <p id={recipeErrorId} className="text-sm font-medium text-error">
                {recipeError}
              </p>
            ) : null}
            {recipes.error ? (
              <p role="alert" className="text-sm font-medium text-error">
                Recipes could not be loaded: {recipes.error.message}
              </p>
            ) : null}
          </div>
          <TextField
            label="Target quantity (garments)"
            inputMode="numeric"
            autoComplete="off"
            hint="Whole number, 1–10,000."
            value={form.targetQty}
            onChange={(event) => update("targetQty", event.target.value)}
            onBlur={() => markTouched("targetQty")}
            error={errorFor("targetQty")}
          />
          <TextField
            label="Fabric roll ID"
            autoComplete="off"
            hint="For example FAB-ROLL-882."
            value={form.fabricRollId}
            onChange={(event) => update("fabricRollId", event.target.value)}
            onBlur={() => markTouched("fabricRollId")}
            error={errorFor("fabricRollId")}
          />
          <TextField
            label="Actual fabric used (yards)"
            inputMode="decimal"
            autoComplete="off"
            hint="Up to 2 decimals, for example 94.5."
            value={form.actualFabricYds}
            onChange={(event) => update("actualFabricYds", event.target.value)}
            onBlur={() => markTouched("actualFabricYds")}
            error={errorFor("actualFabricYds")}
          />
        </div>

        <OrderPreview
          recipe={recipe}
          targetQty={check.values.targetQty ?? null}
          actualFabricYds={check.values.actualFabricYds ?? null}
        />

        {createOrder.error && Object.keys(serverErrors).length === 0 ? (
          <p role="alert" className="rounded-md border border-error bg-status-red px-3 py-2 text-sm font-medium text-status-red-ink">
            {createOrder.error.message}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={isBlocked} onClick={() => create(false)}>
            Save as Cutting In-Progress
          </Button>
          <Button type="submit" disabled={isBlocked}>
            {createOrder.isPending ? "Creating…" : "Create & Submit for Verification"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function OrderPreview({
  recipe,
  targetQty,
  actualFabricYds,
}: {
  recipe: RecipeDto | null;
  targetQty: number | null;
  actualFabricYds: number | null;
}) {
  if (!recipe) {
    return (
      <p className="rounded-md border border-field-border bg-page px-3 py-2 text-sm text-ink-muted">
        Choose a recipe to preview the components to cut.
      </p>
    );
  }
  const preview = previewOrder(recipe, targetQty, actualFabricYds);

  return (
    <section aria-label="Live preview" className="flex flex-col gap-3 rounded-md border border-field-border bg-page p-4">
      <table className="w-full text-left text-sm text-ink">
        <caption className="mb-2 text-left font-semibold">Components to cut</caption>
        <thead>
          <tr className="border-b border-field-border">
            <th scope="col" className="py-1.5 pr-3 font-medium">Component</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">Pieces per garment</th>
            <th scope="col" className="py-1.5 text-right font-medium">Expected</th>
          </tr>
        </thead>
        <tbody>
          {preview.components.map((component) => (
            <tr key={component.id} className="border-b border-field-border/40">
              <td className="py-1.5 pr-3">{component.name}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{component.piecesPerGarment}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{component.expectedQty ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="grid gap-2 text-sm text-ink sm:grid-cols-2">
        <div>
          <dt className="font-medium">Expected fabric</dt>
          <dd className="tabular-nums">
            {preview.expectedFabricYds === null ? "—" : formatYards(preview.expectedFabricYds)}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Wastage (cap {recipe.wastageCap}%)</dt>
          <dd>
            {preview.wastage === null ? (
              "—"
            ) : (
              <WastageValue
                wastagePct={preview.wastage.wastagePct}
                wastageCap={recipe.wastageCap}
                exceedsCap={preview.wastage.exceedsCap}
              />
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
