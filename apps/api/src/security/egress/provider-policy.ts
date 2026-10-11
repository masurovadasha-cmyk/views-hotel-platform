import {isIP} from "node:net";

export type Delivery = "not-sent" | "unknown" | "response";
export class EgressError extends Error {
  readonly retryable = false;
  constructor(readonly code: string, readonly delivery: Delivery = "not-sent") {
    super(code);
    this.name = "EgressError";
  }
}
export type OperationPolicy = Readonly<{
  method: "GET" | "POST";
  path: string;
  queryKeys?: readonly string[];
  requireIdempotencyKey?: boolean;
}>;
export type ProviderPolicy = Readonly<{
  id: string;
  enabled: boolean;
  origin: string;
  credentialRef?: string;
  timeoutMs: number;
  maxRequestBytes: number;
  maxResponseBytes: number;
  operations: Readonly<Record<string, OperationPolicy>>;
}>;
export type EgressCall = Readonly<{
  providerId: string;
  operationId: string;
  requestId: string;
  query?: Readonly<Record<string, string>>;
  body?: unknown;
  idempotencyKey?: string;
}>;
export type RequestPlan = Readonly<{
  providerId: string;
  operationId: string;
  requestId: string;
  hostname: string;
  path: string;
  method: "GET" | "POST";
  body: Buffer | undefined;
  headers: Readonly<Record<string, string>>;
  credentialRef: string | undefined;
  timeoutMs: number;
  maxResponseBytes: number;
}>;
const ID = /^[a-z][a-z0-9._-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATH = /^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/;
const KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
function reject(code: string): never { throw new EgressError(code); }
function integer(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Trusted, reviewed configuration only. Request callers never supply URLs. */
export class ProviderRegistry {
  private readonly policies = new Map<string, ProviderPolicy>();
  constructor(policies: readonly ProviderPolicy[] = []) {
    for (const policy of policies) {
      if (!ID.test(policy.id) || this.policies.has(policy.id) || typeof policy.enabled !== "boolean") reject("EGRESS_POLICY_INVALID");
      let url: URL;
      try { url = new URL(policy.origin); } catch { return reject("EGRESS_ORIGIN_INVALID"); }
      // No suffix matching, IP coercion, userinfo, alternate ports, path or query.
      if (url.protocol !== "https:" || url.origin !== policy.origin || url.port ||
          url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
          !validHostname(url.hostname)) reject("EGRESS_ORIGIN_INVALID");
      if (!integer(policy.timeoutMs, 100, 30000) ||
          !integer(policy.maxRequestBytes, 1, 1048576) ||
          !integer(policy.maxResponseBytes, 1, 1048576)) reject("EGRESS_LIMITS_INVALID");
      if (policy.credentialRef !== undefined && !/^[A-Z][A-Z0-9_]{1,127}$/.test(policy.credentialRef)) reject("EGRESS_CREDENTIAL_REF_INVALID");
      if (!isPlain(policy.operations) || !Object.keys(policy.operations).length) reject("EGRESS_OPERATIONS_REQUIRED");
      const operations: Record<string, OperationPolicy> = Object.create(null);
      for (const [id, op] of Object.entries(policy.operations)) {
        if (!ID.test(id) || !["GET", "POST"].includes(op.method) || !PATH.test(op.path) ||
            (op.requireIdempotencyKey !== undefined && typeof op.requireIdempotencyKey !== "boolean")) reject("EGRESS_OPERATION_INVALID");
        const keys = [...(op.queryKeys || [])];
        if (keys.length > 20 || new Set(keys).size !== keys.length || keys.some(key => !KEY.test(key))) reject("EGRESS_QUERY_POLICY_INVALID");
        operations[id] = Object.freeze({...op, queryKeys: Object.freeze(keys)});
      }
      this.policies.set(policy.id, Object.freeze({...policy, operations: Object.freeze(operations)}));
    }
  }
  plan(call: EgressCall): RequestPlan {
    if (!call || !ID.test(call.providerId) || !ID.test(call.operationId) || !UUID.test(call.requestId)) reject("EGRESS_CALL_INVALID");
    const policy = this.policies.get(call.providerId);
    if (!policy?.enabled) reject("EGRESS_PROVIDER_DISABLED");
    const operation = Object.hasOwn(policy.operations, call.operationId) ? policy.operations[call.operationId] : undefined;
    if (!operation) reject("EGRESS_OPERATION_DENIED");
    if (call.idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{8,128}$/.test(call.idempotencyKey)) reject("EGRESS_IDEMPOTENCY_INVALID");
    if (operation.requireIdempotencyKey && !call.idempotencyKey) reject("EGRESS_IDEMPOTENCY_REQUIRED");
    const query = new URLSearchParams();
    if (call.query !== undefined) {
      if (!isPlain(call.query) || Object.keys(call.query).length > 20) reject("EGRESS_QUERY_INVALID");
      for (const [key, value] of Object.entries(call.query)) {
        if (!operation.queryKeys?.includes(key) || typeof value !== "string" || value.length > 512 || /[\x00-\x1f\x7f]/.test(value)) reject("EGRESS_QUERY_DENIED");
        query.set(key, value);
      }
      query.sort();
    }
    let body: Buffer | undefined;
    if (call.body !== undefined) {
      if (operation.method !== "POST") reject("EGRESS_BODY_DENIED");
      validateJson(call.body, new Set(), 0, {nodes: 0});
      const serialized = JSON.stringify(call.body);
      body = Buffer.from(serialized, "utf8");
      if (body.length > policy.maxRequestBytes) reject("EGRESS_REQUEST_TOO_LARGE");
    }
    const headers: Record<string, string> = {
      accept: "application/json", "accept-encoding": "identity", "x-request-id": call.requestId
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(body.length);
    }
    if (call.idempotencyKey) headers["idempotency-key"] = call.idempotencyKey;
    const suffix = query.toString();
    return Object.freeze({providerId: policy.id, operationId: call.operationId,
      requestId: call.requestId, hostname: new URL(policy.origin).hostname,
      path: operation.path + (suffix ? "?" + suffix : ""), method: operation.method,
      body, headers: Object.freeze(headers), credentialRef: policy.credentialRef,
      timeoutMs: policy.timeoutMs, maxResponseBytes: policy.maxResponseBytes});
  }
}
export function validHostname(host: string): boolean {
  return host.length <= 253 && host.includes(".") && !isIP(host) &&
    !/^(?:localhost|metadata)(?:\.|$)/.test(host) &&
    !/\.(?:localhost|local|internal|arpa)$/.test(host) &&
    host.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    /[a-z]/.test(host.split(".").at(-1)!);
}
function isPlain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function validateJson(value: unknown, seen: Set<object>, depth: number, budget: {nodes: number}): void {
  if (++budget.nodes > 10000 || depth > 20) reject("EGRESS_JSON_LIMIT");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > 1048576) reject("EGRESS_REQUEST_TOO_LARGE");
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object" || (!Array.isArray(value) && !isPlain(value)) || seen.has(value)) reject("EGRESS_JSON_INVALID");
  seen.add(value);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Array.isArray(value) && key === "length") continue;
    if (!descriptor.enumerable || descriptor.get || descriptor.set || ["__proto__", "prototype", "constructor", "toJSON"].includes(key)) reject("EGRESS_JSON_INVALID");
    validateJson(descriptor.value, seen, depth + 1, budget);
  }
  if (Object.getOwnPropertySymbols(value).length) reject("EGRESS_JSON_INVALID");
  seen.delete(value);
}
