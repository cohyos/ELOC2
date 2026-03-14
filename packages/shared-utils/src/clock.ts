/**
 * Logical simulation clock.
 *
 * Tracks simulated time independently of wall-clock time, supporting
 * variable-speed playback, pause, step, and reset.
 */
export class SimulationClock {
  private _startTime: number;
  private _speedMultiplier: number;
  private _running = false;

  /** Wall-clock timestamp (ms) when the clock was last started / resumed. */
  private _wallStart = 0;

  /** Accumulated simulation-time offset from previous run segments (ms). */
  private _accumulated = 0;

  /**
   * @param startTime       The initial simulation time in milliseconds.
   * @param speedMultiplier How many simulated ms elapse per real ms (default 1).
   */
  constructor(startTime: number, speedMultiplier: number = 1) {
    this._startTime = startTime;
    this._speedMultiplier = speedMultiplier;
  }

  /** Start or resume the clock. */
  start(): void {
    if (this._running) return;
    this._running = true;
    this._wallStart = Date.now();
  }

  /** Pause the clock, preserving accumulated time. */
  pause(): void {
    if (!this._running) return;
    this._accumulated += (Date.now() - this._wallStart) * this._speedMultiplier;
    this._running = false;
  }

  /**
   * Advance the clock by a fixed simulation-time delta while paused.
   * If the clock is running this still adds the extra offset.
   *
   * @param dtMs Simulation-time increment in milliseconds.
   */
  step(dtMs: number): void {
    if (this._running) {
      // Freeze accumulated so far, then add the step.
      this._accumulated += (Date.now() - this._wallStart) * this._speedMultiplier;
      this._wallStart = Date.now();
    }
    this._accumulated += dtMs;
  }

  /** Change the playback speed multiplier. */
  setSpeed(multiplier: number): void {
    if (this._running) {
      // Freeze elapsed time at old speed, restart wall-clock reference.
      this._accumulated += (Date.now() - this._wallStart) * this._speedMultiplier;
      this._wallStart = Date.now();
    }
    this._speedMultiplier = multiplier;
  }

  /** Current simulation time in milliseconds. */
  now(): number {
    return this._startTime + this.elapsed();
  }

  /** Milliseconds elapsed in simulation time since the clock was created / reset. */
  elapsed(): number {
    let total = this._accumulated;
    if (this._running) {
      total += (Date.now() - this._wallStart) * this._speedMultiplier;
    }
    return total;
  }

  /** Whether the clock is currently running. */
  isRunning(): boolean {
    return this._running;
  }

  /**
   * Reset the clock. Optionally set a new start time.
   * The clock will be paused after a reset.
   */
  reset(startTime?: number): void {
    this._running = false;
    this._accumulated = 0;
    this._wallStart = 0;
    if (startTime !== undefined) {
      this._startTime = startTime;
    }
  }
}
