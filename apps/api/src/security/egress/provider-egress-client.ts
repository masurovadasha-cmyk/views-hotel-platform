import {performance} from "node:perf_hooks";
import {Delivery, EgressCall, EgressError, ProviderRegistry, RequestPlan} from "./provider-policy";

export type EgressResponse = Readonly<{status: number; contentType: string; body: Buffer}>;
export interface EgressTransport {
  send(plan: RequestPlan, authorization: string | undefined, signal: AbortSignal): Promise<EgressResponse>;
}
export type EgressAudit = Readonly<{
  schemaVersion: 1; event: "started" | "completed" | "failed";
  providerId: string; operationId: string; requestId: string;
  attempt: 1; deadlineMs: number; elapsedMs: number;
  delivery: Delivery; status?: number; code?: string;
}>;
export interface EgressAuditSink { write(event: EgressAudit): Promise<void>; }
export type CredentialResolver = (ref: string) => string | undefined;

/** No implicit retries, ambient proxy settings, caller URLs or response logging. */
export class ProviderEgressClient {
  private inFlight = 0;
  constructor(private readonly registry: ProviderRegistry,
    private readonly transport: EgressTransport,
    private readonly credentials: CredentialResolver,
    private readonly audit: EgressAuditSink,
    private readonly maxInFlight = 16) {
    if (!Number.isInteger(maxInFlight) || maxInFlight < 1 || maxInFlight > 128) throw new EgressError("EGRESS_CONCURRENCY_INVALID");
  }
  async execute(call: EgressCall, callerSignal?: AbortSignal): Promise<EgressResponse> {
    const plan = this.registry.plan(call);
    if (callerSignal?.aborted) throw new EgressError("EGRESS_ABORTED");
    if (this.inFlight >= this.maxInFlight) throw new EgressError("EGRESS_BUSY");
    this.inFlight++;
    const started = performance.now();
    const control = new AbortController();
    let deadline = false;
    let delivery: Delivery = "not-sent";
    const timer = setTimeout(() => { deadline = true; control.abort(); }, plan.timeoutMs);
    const cancel = () => control.abort();
    callerSignal?.addEventListener("abort", cancel, {once: true});
    const event = (kind: EgressAudit["event"], extra: Partial<EgressAudit> = {}): EgressAudit => Object.freeze({
      schemaVersion: 1, event: kind, providerId: plan.providerId, operationId: plan.operationId,
      requestId: plan.requestId, attempt: 1, deadlineMs: plan.timeoutMs,
      elapsedMs: Math.round(performance.now() - started), delivery, ...extra
    });
    const abortError = () => new EgressError(deadline ? "EGRESS_DEADLINE" : "EGRESS_ABORTED", delivery);
    const record = async (value: EgressAudit) => {
      try { await bounded(this.audit.write(value), control.signal, abortError); }
      catch (error) { if (control.signal.aborted) throw abortError(); throw new EgressError("EGRESS_AUDIT_FAILED", delivery); }
    };
    try {
      let authorization: string | undefined;
      if (plan.credentialRef) {
        try { authorization = this.credentials(plan.credentialRef); }
        catch { throw new EgressError("EGRESS_CREDENTIAL_UNAVAILABLE"); }
        if (!authorization || authorization.length > 8192 || /[^\x20-\x7e]/.test(authorization)) throw new EgressError("EGRESS_CREDENTIAL_UNAVAILABLE");
      }
      // A durable sink is supplied by the adapter integration; failure before
      // this event prevents dispatch. This library supplies no silent no-op sink.
      await record(event("started"));
      if (control.signal.aborted) throw abortError();
      delivery = "unknown";
      let response: EgressResponse;
      try { response = await bounded(this.transport.send(plan, authorization, control.signal), control.signal, abortError); }
      catch (error) {
        const safe = error instanceof EgressError ? error : new EgressError("EGRESS_TRANSPORT_FAILED", delivery);
        delivery = safe.delivery;
        if (!control.signal.aborted) await record(event("failed", {code: safe.code}));
        throw control.signal.aborted ? abortError() : safe;
      }
      delivery = "response";
      if (!Number.isInteger(response.status) || response.status < 200 || response.status > 599 ||
          response.body.length > plan.maxResponseBytes) throw new EgressError("EGRESS_RESPONSE_INVALID", delivery);
      if (response.status >= 300 && response.status < 400) throw new EgressError("EGRESS_REDIRECT_BLOCKED", delivery);
      await record(event("completed", {status: response.status}));
      return response;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", cancel);
      control.abort();
      this.inFlight--;
    }
  }
}
function bounded<T>(promise: Promise<T>, signal: AbortSignal, error: () => EgressError): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { promise.catch(() => undefined); reject(error()); return; }
    const abort = () => reject(error());
    signal.addEventListener("abort", abort, {once: true});
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
