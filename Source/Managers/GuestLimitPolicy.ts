import { GuestSongLimit } from "../../Shared/Constants";

export class GuestLimitError extends Error {
  public constructor(
    public readonly currentCount: number,
    public readonly incomingCount: number
  ) {
    super("Guest song limit reached");
  }
}

export class GuestLimitPolicy {
  public constructor(public readonly limit: number = GuestSongLimit) {}

  public wouldExceed(currentCount: number, incomingCount: number): boolean {
    return currentCount + incomingCount > this.limit;
  }

  public assertAllowed(currentCount: number, incomingCount: number): void {
    if (this.wouldExceed(currentCount, incomingCount)) {
      throw new GuestLimitError(currentCount, incomingCount);
    }
  }

  public remaining(currentCount: number): number {
    return Math.max(0, this.limit - currentCount);
  }
}
