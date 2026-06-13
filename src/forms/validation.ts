import type { FormErrors, FormSchemaAdapter } from "../core/types";

export type { FormErrors, FormSchemaAdapter } from "../core/types";

type ZodLikeSchema<TValues> = {
  safeParse: (values: TValues) => { success: true } | { success: false; error: unknown };
};

type YupLikeSchema<TValues> = {
  validate: (values: TValues, options?: { abortEarly?: boolean }) => Promise<unknown> | unknown;
};

type ValibotLikeSchema = {
  "~standard"?: unknown;
};

type StandardSchemaLike<TValues> = {
  "~standard": {
    validate: (values: TValues) => Promise<{ issues?: unknown[]; value?: unknown }> | { issues?: unknown[]; value?: unknown };
  };
};

/** Create a StateMesh form schema adapter from a Zod-like schema. */
export function zodSchema<TValues extends Record<string, unknown>>(schema: ZodLikeSchema<TValues>): FormSchemaAdapter<TValues> {
  return {
    validate(values) {
      const result = schema.safeParse(values);
      if (result.success) return {};
      return issuesToErrors<TValues>(readIssues(result.error));
    }
  };
}

/** Create a StateMesh form schema adapter from a Yup-like schema. */
export function yupSchema<TValues extends Record<string, unknown>>(schema: YupLikeSchema<TValues>): FormSchemaAdapter<TValues> {
  return {
    async validate(values) {
      try {
        await schema.validate(values, { abortEarly: false });
        return {};
      } catch (error) {
        return issuesToErrors<TValues>(readIssues(error));
      }
    }
  };
}

/** Create a StateMesh form schema adapter from a Standard Schema or Valibot-like schema. */
export function standardSchema<TValues extends Record<string, unknown>>(
  schema: StandardSchemaLike<TValues> | ValibotLikeSchema
): FormSchemaAdapter<TValues> {
  return {
    async validate(values) {
      const standard = (schema as StandardSchemaLike<TValues>)["~standard"];
      if (!standard || typeof standard.validate !== "function") return {};
      const result = await standard.validate(values);
      return issuesToErrors<TValues>(result.issues ?? []);
    }
  };
}

function readIssues(error: unknown): unknown[] {
  if (!error || typeof error !== "object") return [];
  const record = error as Record<string, unknown>;
  if (Array.isArray(record.issues)) return record.issues;
  if (Array.isArray(record.inner)) return record.inner;
  if (Array.isArray(record.errors)) return record.errors;
  return [error];
}

function issuesToErrors<TValues extends Record<string, unknown>>(issues: unknown[]): FormErrors<TValues> {
  const errors: FormErrors<TValues> = {};
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") continue;
    const record = issue as Record<string, unknown>;
    const field = readIssuePath(record);
    const message = typeof record.message === "string" ? record.message : "Invalid value";
    if (field && !errors[field as keyof TValues & string]) {
      errors[field as keyof TValues & string] = message;
    }
  }
  return errors;
}

function readIssuePath(issue: Record<string, unknown>): string | null {
  if (typeof issue.path === "string") return issue.path;
  if (Array.isArray(issue.path)) return issue.path.join(".");
  if (typeof issue.key === "string") return issue.key;
  return null;
}
