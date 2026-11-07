import type { ServoRange, ServoTarget } from './servoService';

export interface ServoJog { target: ServoTarget; angle: number; servoRange?: ServoRange; }
// One request at a time. Fast taps replace the unsent target, avoiding a long
// replay of obsolete positions on a slow connection.
export class ServoPreviewQueue {
  private pending?: ServoJog;
  private running?: Promise<void>;
  private touched = false;
  private closed = false;
  constructor(private readonly move: (jog: ServoJog) => Promise<void>,
    private readonly halt: () => Promise<void>, private readonly failed: (error: unknown) => void) {}
  submit(jog: ServoJog) {
    if (this.closed) return;
    this.pending = jog;
    if (!this.running) this.running = this.drain().finally(() => { this.running = undefined; });
  }
  cancelPending() { this.pending = undefined; }
  private async drain() {
    while (this.pending && !this.closed) {
      const jog = this.pending; this.pending = undefined; this.touched = true;
      try { await this.move(jog); }
      catch (error) { this.pending = undefined; this.failed(error); }
    }
  }
  async flush() { await this.running; }
  async stop() {
    this.pending = undefined;
    await this.running;
    if (this.touched) { await this.halt(); this.touched = false; }
  }
  async close() { this.closed = true; await this.stop(); }
}
