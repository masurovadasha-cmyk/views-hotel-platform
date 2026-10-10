# Stage 6.3 — Analytics Worker & SLO

## Goal

Move analytics projection from a manual operation to a scheduler-ready, concurrency-safe worker model.

## Worker state

`analytics_worker_state` stores one row per organization + consumer:
- lease token
- lease expiry
- last start/completion
- last normalized error code
- consecutive failure count

## Tenant claim

`app.claim_analytics_projection_tenants(...)`:
- discovers organizations with relevant unconsumed outbox events;
- claims only expired/unleased tenants;
- uses row locking with SKIP LOCKED;
- assigns a bounded lease;
- returns only claimed organization IDs.

Multiple worker instances can run concurrently without intentionally processing the same tenant lease.

## Completion

`app.complete_analytics_projection_tenant(...)` releases a lease only when the worker token matches.

Success:
- clears error state;
- resets consecutive failures;
- records completion time.

Failure:
- stores only a normalized error code;
- increments consecutive failures;
- releases the lease for later retry.

## Worker cycle

`AnalyticsWorkerService.runCycle(tenantLimit,eventLimit)`:
1. claims a bounded tenant set;
2. processes each tenant using the normal analytics projector;
3. completes or fails the matching lease;
4. returns an operational cycle summary.

It is scheduler-ready but not tied to one scheduler implementation.

## Projection SLO

`analytics_projection_slo` extends lag health with worker state.

Status:
- healthy: lag < 5 minutes and no worker failures;
- degraded: lag >= 5 minutes or at least one consecutive failure;
- critical: lag >= 30 minutes or 3+ consecutive failures.

`GET /v1/analytics/health` returns:
- status
- pending event count
- oldest pending age
- last processed time
- worker start/completion time
- consecutive failures
- last normalized error code

## Acceptance

Integration tests verify:
- tenant lease claim;
- pending events are consumed;
- lease is released after completion;
- success resets failure state;
- tenant is not reclaimed when no relevant backlog remains;
- a 31-minute pending event produces critical SLO.

## Next

- connect the worker cycle to the production scheduler/runtime;
- emit SLO alert events;
- portfolio/city rollups;
- materialized rollups for long ranges;
- analytics cache and reporting/export layer.
