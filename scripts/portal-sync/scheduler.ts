/**
 * Coalescing runner: at most one run at a time; any number of requests made while a run is in
 * progress collapse into exactly one follow-up run.
 */
export class CoalescingRunner<T> {
  private current: Promise<void> | null = null;
  private pendingReason: string | null = null;
  lastResult: T | null = null;

  constructor(
    private readonly task: (reason: string) => Promise<T>,
    private readonly onError: (error: unknown) => void = () => {},
  ) {}

  get running(): boolean {
    return this.current !== null;
  }

  get pending(): boolean {
    return this.pendingReason !== null;
  }

  /** Returns 'started' or 'queued' (a follow-up run is/was already queued). */
  request(reason: string): 'started' | 'queued' {
    if (this.current) {
      this.pendingReason ??= reason;
      return 'queued';
    }
    this.current = this.loop(reason);
    return 'started';
  }

  /** Resolves when the current run and any queued follow-up finish. */
  async idle(): Promise<void> {
    while (this.current) await this.current;
  }

  private async loop(reason: string): Promise<void> {
    let next: string | null = reason;
    while (next !== null) {
      try {
        this.lastResult = await this.task(next);
      } catch (error) {
        this.onError(error);
      }
      next = this.pendingReason;
      this.pendingReason = null;
    }
    this.current = null;
  }
}
