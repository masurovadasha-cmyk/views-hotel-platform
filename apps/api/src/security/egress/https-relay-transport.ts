import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import {isIP, Socket} from "node:net";
import {Delivery, EgressError, RequestPlan, validHostname} from "./provider-policy";
import type {EgressResponse, EgressTransport} from "./provider-egress-client";

export type RelayOptions = Readonly<{host: string; port: number; ca?: string}>;
export const PRIVATE_RELAY: RelayOptions = Object.freeze({host: "172.31.0.3", port: 3128});

/** Only the relay gets a TCP connection. Origin DNS is resolved by the relay;
 * TLS identity remains the exact approved hostname. No fallback direct route. */
export class HttpsRelayTransport implements EgressTransport {
  private readonly options: RelayOptions;
  constructor(options: RelayOptions = PRIVATE_RELAY) {
    if (!isIP(options.host) || !Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new EgressError("EGRESS_RELAY_INVALID");
    this.options = Object.freeze({...options});
  }
  send(plan: RequestPlan, authorization: string | undefined, signal: AbortSignal): Promise<EgressResponse> {
    if (signal.aborted) return Promise.reject(new EgressError("EGRESS_ABORTED"));
    if (!validHostname(plan.hostname) || !plan.path.startsWith("/") || /[\r\n]/.test(plan.path)) return Promise.reject(new EgressError("EGRESS_PLAN_INVALID"));
    return new Promise((resolve, reject) => {
      let done = false;
      let delivery: Delivery = "not-sent";
      let tunnel: Socket | undefined;
      let secure: tls.TLSSocket | undefined;
      let request: http.ClientRequest | undefined;
      let agent: https.Agent | undefined;
      let connectRequest: http.ClientRequest | undefined;
      const cleanup = () => {
        signal.removeEventListener("abort", abort);
        request?.destroy(); secure?.destroy(); tunnel?.destroy(); agent?.destroy(); connectRequest?.destroy();
      };
      const fail = (code: string) => {
        if (done) return;
        done = true; cleanup(); reject(new EgressError(code, delivery));
      };
      const abort = () => fail("EGRESS_ABORTED");
      signal.addEventListener("abort", abort, {once: true});
      connectRequest = http.request({host: this.options.host, port: this.options.port,
        method: "CONNECT", path: plan.hostname + ":443", agent: false,
        maxHeaderSize: 8192, headers: {host: plan.hostname + ":443"}});
      connectRequest.once("error", () => fail("EGRESS_PROXY_UNAVAILABLE"));
      connectRequest.once("response", res => { res.destroy(); fail("EGRESS_PROXY_PROTOCOL"); });
      connectRequest.once("connect", (res, socket, head) => {
        tunnel = socket;
        if (done) { socket.destroy(); return; }
        if (res.statusCode !== 200) { fail("EGRESS_PROXY_DENIED"); return; }
        if (head.length) { fail("EGRESS_PROXY_PROTOCOL"); return; }
        secure = tls.connect({socket, servername: plan.hostname, rejectUnauthorized: true,
          checkServerIdentity: tls.checkServerIdentity, minVersion: "TLSv1.2",
          ALPNProtocols: ["http/1.1"], ca: this.options.ca});
        secure.once("error", () => fail("EGRESS_TLS_FAILED"));
        secure.once("secureConnect", () => {
          if (done) return;
          if (!secure?.authorized) { fail("EGRESS_TLS_FAILED"); return; }
          agent = new https.Agent({keepAlive: false, maxCachedSessions: 0});
          // The agent must use this authenticated tunnel, never open another socket.
          agent.createConnection = () => secure!;
          const headers: Record<string, string> = {...plan.headers, host: plan.hostname, connection: "close"};
          if (authorization) headers.authorization = authorization;
          request = https.request({hostname: plan.hostname, port: 443, path: plan.path,
            method: plan.method, headers, agent, maxHeaderSize: 8192}, response => {
            delivery = "response";
            const status = response.statusCode || 0;
            if (status >= 300 && status < 400) { fail("EGRESS_REDIRECT_BLOCKED"); response.destroy(); return; }
            const encoding = String(response.headers["content-encoding"] || "identity");
            const contentType = String(response.headers["content-type"] || "");
            if (encoding !== "identity") { fail("EGRESS_ENCODING_DENIED"); response.destroy(); return; }
            if (status !== 204 && !/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(contentType)) {
              fail("EGRESS_CONTENT_TYPE_DENIED"); response.destroy(); return;
            }
            const declared = response.headers["content-length"];
            if (declared && (!/^\d+$/.test(declared) || Number(declared) > plan.maxResponseBytes)) {
              fail("EGRESS_RESPONSE_TOO_LARGE"); response.destroy(); return;
            }
            const chunks: Buffer[] = [];
            let length = 0;
            response.on("data", (chunk: Buffer) => {
              length += chunk.length;
              if (length > plan.maxResponseBytes) { fail("EGRESS_RESPONSE_TOO_LARGE"); response.destroy(); }
              else chunks.push(chunk);
            });
            response.once("aborted", () => fail("EGRESS_RESPONSE_INCOMPLETE"));
            response.once("error", () => fail("EGRESS_RESPONSE_INCOMPLETE"));
            response.once("end", () => {
              if (done) return;
              done = true;
              const result = Object.freeze({status, contentType, body: Buffer.concat(chunks, length)});
              cleanup(); resolve(result);
            });
          });
          request.once("error", () => fail("EGRESS_TRANSPORT_FAILED"));
          delivery = "unknown";
          request.end(plan.body);
        });
      });
      connectRequest.end();
    });
  }
}
