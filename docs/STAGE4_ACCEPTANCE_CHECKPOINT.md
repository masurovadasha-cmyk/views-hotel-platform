# Stage 4 Acceptance Checkpoint

Purpose: trigger an isolated Stage 4 Acceptance run for the outbox leasing release-readiness slice.

Runtime code under test is inherited from commit `d987a081cdbb52160c52e488ebf7c26be9238a3c`.

Required outcomes:
- CI green;
- D1 migration chain green through `0011_outbox_leases.sql`;
- Local Pages + D1 Golden Flow green;
- recovery tooling validation green;
- outbox pending/retrying/dead-letter/leased state clean after processing.
