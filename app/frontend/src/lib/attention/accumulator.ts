// Time accumulation with look-away debouncing. Pure w.r.t. its timestamp input
// (caller passes the clock reading), so it is unit-testable without a real clock.
//
// Each `update(ts, attentive)` advances two running totals by the elapsed time
// since the previous frame: `totalMs` always, `attentiveMs` when the parent is
// looking at the screen — OR when they briefly looked away but are still inside
// the grace window, so a blink or a momentary glance doesn't chip away at the
// count. Frame gaps larger than `maxFrameGapMs` (tab hidden, model stall) are
// capped so a stall can't inflate either total.

export class AttentionAccumulator {
  private attentiveMs = 0
  private totalMs = 0
  private lastTs: number | null = null
  private lastAttentiveTs: number | null = null
  private graceMs: number
  private maxFrameGapMs: number

  constructor(graceMs = 1500, maxFrameGapMs = 500) {
    this.graceMs = graceMs
    this.maxFrameGapMs = maxFrameGapMs
  }

  update(ts: number, attentive: boolean): void {
    if (this.lastTs === null) {
      this.lastTs = ts
      if (attentive) this.lastAttentiveTs = ts
      return
    }

    let dt = ts - this.lastTs
    this.lastTs = ts
    if (dt <= 0) return
    if (dt > this.maxFrameGapMs) dt = this.maxFrameGapMs

    this.totalMs += dt
    if (attentive) {
      this.attentiveMs += dt
      this.lastAttentiveTs = ts
    } else if (this.lastAttentiveTs !== null && ts - this.lastAttentiveTs <= this.graceMs) {
      this.attentiveMs += dt
    }
  }

  /**
   * Credit a period we know was inattentive but couldn't measure per-frame — e.g.
   * the browser tab was hidden, so gaze can't be read but the parent has clearly
   * left the screen. Advances total only, and cancels the grace window (leaving the
   * tab is a deliberate look-away, not a brief glance). This is what stops a parent
   * from fooling the timer by switching tabs.
   */
  addInattentive(ms: number): void {
    if (ms <= 0) return
    this.totalMs += ms
    this.lastAttentiveTs = null
  }

  /** Re-anchor the frame clock to `ts` without accruing (after an accounted gap). */
  resync(ts: number): void {
    this.lastTs = ts
  }

  get attentiveSeconds(): number {
    return Math.round(this.attentiveMs / 1000)
  }

  get totalSeconds(): number {
    return Math.round(this.totalMs / 1000)
  }

  /** Attentive fraction 0..1 (0 when no time has accrued yet). */
  get ratio(): number {
    return this.totalMs > 0 ? this.attentiveMs / this.totalMs : 0
  }
}
