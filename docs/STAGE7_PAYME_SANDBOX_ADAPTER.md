# Stage 7.20 — Payme Merchant API sandbox adapter

## Why Payme is the first provider

Payme Business exposes a public Merchant API specification and a dedicated
sandbox. Merchant API is inbound JSON-RPC: Payme Business calls the merchant
billing endpoint and the merchant returns a JSON-RPC result or error.

Official references:
- https://developer.help.paycom.uz/protokol-merchant-api/
- https://developer.help.paycom.uz/pesochnitsa/
- https://developer.help.paycom.uz/metody-merchant-api/
- https://developer.help.paycom.uz/initsializatsiya-platezhey/

The sandbox uses TEST_KEY, while production uses the live merchant key. Stage
7.20 deliberately supports only sandbox mode.

## Account mapping

VIEWS configures the Payme Account object as:

payment_intent_id=<VIEWS payment intent UUID>

This is a one-time account. The amount is VIEWS amount_minor. For UZS that maps
to the tiyin amount expected by Payme.

The sandbox checkout URL follows Payme's documented GET initialization format
using:
- merchant id;
- account.payment_intent_id;
- amount;
- language;
- HTTPS callback;
- currency code 860.

## Merchant API endpoint

POST /v1/payments/payme/merchant

The controller:
- always returns HTTP 200 for JSON-RPC protocol errors that reach the route;
- accepts Payme's documented text/json content type as a raw body;
- checks Basic HTTP authentication;
- resolves the true client IP only after the configured trusted proxy boundary;
- then enforces the official Payme Business source IP list;
- uses constant-time credential comparison.

In production mode the official Payme source list is fixed. The test CIDR
override is ignored in NODE_ENV=production.

## Implemented methods

- CheckPerformTransaction
- CreateTransaction
- PerformTransaction
- CancelTransaction
- CheckTransaction
- GetStatement

The transaction state is stored in payme_merchant_transactions.

State mapping follows Payme:
- 1 created;
- 2 performed;
- -1 cancelled before perform;
- -2 cancelled after perform.

Repeated CreateTransaction, PerformTransaction and CancelTransaction return the
same stable result. A second active Payme transaction for the same VIEWS payment
intent is rejected.

## Booking and ledger mapping

PerformTransaction is mapped to the existing verified payment capture pipeline.
This reuses:
- payment_webhook_inbox replay protection;
- provider_transactions;
- ledger posting;
- payment intent captured totals;
- booking confirmation.

CancelTransaction after perform is mapped to a full refund through the same
verified financial pipeline. If the reservation has already reached checked_in
or checked_out, cancellation is rejected with the Payme -31007 contract.

For a refundable sandbox reservation, full cancellation:
- records the refund;
- moves the Payme transaction to -2;
- marks the VIEWS reservation cancelled;
- releases the inventory period;
- emits booking.cancelled.

The existing automated refund worker is not used for Payme sandbox. The
PaymentProviderPort refund method explicitly rejects, because Merchant API
cancellation/refund semantics are inbound and Payme documentation describes
refund handling through the Merchant flow/cabinet rather than our generic
outbound refund API.

## Authentication

Payme Merchant API uses Basic HTTP authentication. Stage 7.20 expects:
- VIEWS_PAYME_MERCHANT_LOGIN
- VIEWS_PAYME_TEST_KEY

The official sandbox additionally requires a Merchant ID and TEST_KEY from the
merchant cabinet. No real merchant credential is committed or used by CI.

## Proof

The disposable Docker proof:
1. applies all migrations through 0036;
2. creates one UZS hold reservation and Payme payment intent;
3. starts Core with sandbox-only fixture credentials;
4. verifies invalid Basic auth returns -32504;
5. verifies malformed text/json returns -32700;
6. checks correct and incorrect amounts/accounts;
7. CreateTransaction twice => identical state 1 result;
8. a second active transaction for the same intent => -31008;
9. PerformTransaction twice => identical state 2 result;
10. CancelTransaction twice => identical state -2 result;
11. GetStatement returns the persistent transaction;
12. database evidence proves captured=refunded=500000;
13. provider capture/refund records are not duplicated;
14. reservation ends cancelled and ledger journals are posted.

This mirrors the repeat/idempotency behavior required by Payme sandbox without
pretending that the official external sandbox was invoked.

## Activation boundary

Stage 7.20 does NOT claim a live Payme sandbox connection.

A real sandbox run still requires:
- a Payme merchant account/web cash register;
- Merchant ID;
- Merchant API login;
- TEST_KEY;
- a persistent HTTPS staging Endpoint URL reachable by Payme.

Only after the official Payme sandbox scenarios pass should initialization be
tested against https://test.paycom.uz with the actual merchant credentials.

Production mode remains rejected by code.

## Next layer

After the official sandbox credential/endpoint is available:
- run Payme's own sandbox test suite against the persistent VIEWS staging URL;
- capture external evidence for both documented scenarios;
- verify the official source IPs through Cloudflare Tunnel;
- then design production credential rotation and fiscal receipt requirements.
