import { getCapability } from "./catalog";
import type { GenerationRequest, ModelCapability, ModelParameter } from "./types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

function validateParameter(parameter: ModelParameter, value: unknown): void {
  if (isMissing(value)) {
    if (parameter.required) throw new Error(`MISSING_REQUIRED_PARAMETER_${parameter.name.toUpperCase()}`);
    return;
  }
  if (parameter.type === "string" || parameter.type === "media") {
    if (typeof value !== "string") throw new Error(`INVALID_PARAMETER_TYPE_${parameter.name.toUpperCase()}`);
    if (value.length > 20_000_000) throw new Error(`PARAMETER_TOO_LARGE_${parameter.name.toUpperCase()}`);
  } else if (parameter.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`INVALID_PARAMETER_TYPE_${parameter.name.toUpperCase()}`);
    if (parameter.minimum !== undefined && value < parameter.minimum) throw new Error(`PARAMETER_BELOW_MINIMUM_${parameter.name.toUpperCase()}`);
    if (parameter.maximum !== undefined && value > parameter.maximum) throw new Error(`PARAMETER_ABOVE_MAXIMUM_${parameter.name.toUpperCase()}`);
  } else if (parameter.type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`INVALID_PARAMETER_TYPE_${parameter.name.toUpperCase()}`);
  } else if (parameter.type === "enum") {
    if (!parameter.options?.includes(String(value))) throw new Error(`INVALID_PARAMETER_OPTION_${parameter.name.toUpperCase()}`);
  } else if (parameter.type === "media-list") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) throw new Error(`INVALID_PARAMETER_TYPE_${parameter.name.toUpperCase()}`);
  } else if (parameter.type === "object" && !isPlainObject(value)) {
    throw new Error(`INVALID_PARAMETER_TYPE_${parameter.name.toUpperCase()}`);
  }
}

export function validateGenerationRequest(request: GenerationRequest): ModelCapability {
  if (!request || !isPlainObject(request.inputs)) throw new Error("INVALID_GENERATION_REQUEST");
  if (request.billing?.mode !== "managed") throw new Error("UNSUPPORTED_BILLING_MODE");
  const capability = getCapability(request.modelId);
  if (!capability?.enabled) throw new Error("UNKNOWN_OR_DISABLED_MODEL");
  if (request.operation !== capability.operation) throw new Error("MODEL_OPERATION_MISMATCH");
  if (!request.billing?.idempotencyKey || !request.billing.accountId) throw new Error("INVALID_BILLING_CONTEXT");
  for (const parameter of capability.parameters) validateParameter(parameter, request.inputs[parameter.name]);
  return capability;
}
