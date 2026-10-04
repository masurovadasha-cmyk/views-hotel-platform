export class BookingConflictError extends Error{
  constructor(message="UNIT_NOT_AVAILABLE"){super(message);this.name="BookingConflictError"}
}
export class IdempotencyConflictError extends Error{
  constructor(){super("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");this.name="IdempotencyConflictError"}
}
export class HoldExpiredError extends Error{
  constructor(){super("HOLD_EXPIRED");this.name="HoldExpiredError"}
}
