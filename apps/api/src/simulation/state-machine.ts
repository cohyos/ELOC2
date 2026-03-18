/**
 * Simulation state machine (REQ-13).
 *
 * Prevents conflicts between running scenarios, injections, and timeline
 * operations by enforcing a strict set of allowed state transitions.
 */

export type SimulationState = 'idle' | 'running' | 'paused' | 'seeking' | 'resetting';

export type SimulationAction =
  | 'start' | 'pause' | 'resume' | 'stop' | 'reset'
  | 'seek' | 'seek_complete'
  | 'inject' | 'inject_complete';

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
  newState?: SimulationState;
}

/**
 * Transition table.
 *
 * Each entry maps `(currentState, action)` → `newState`.
 * A `null` newState means "stay in current state" (used for inject).
 */
const TRANSITIONS: Record<string, SimulationState | null> = {
  // idle
  'idle:start': 'running',
  'idle:reset': 'resetting',

  // running
  'running:pause': 'paused',
  'running:stop': 'idle',
  'running:reset': 'resetting',
  'running:inject': null, // stays running
  'running:inject_complete': null,

  // paused
  'paused:resume': 'running',
  'paused:start': 'running', // alias: start from paused = resume
  'paused:stop': 'idle',
  'paused:reset': 'resetting',
  'paused:seek': 'seeking',
  'paused:inject': null, // stays paused
  'paused:inject_complete': null,

  // seeking
  'seeking:seek_complete': 'paused',

  // resetting
  'resetting:reset': 'idle', // terminal transition for reset completion
};

export class SimulationStateMachine {
  private state: SimulationState = 'idle';

  get currentState(): SimulationState {
    return this.state;
  }

  getState(): SimulationState {
    return this.state;
  }

  tryTransition(action: SimulationAction): TransitionResult {
    const key = `${this.state}:${action}`;
    const target = TRANSITIONS[key];

    if (target === undefined) {
      return {
        allowed: false,
        reason: `Action '${action}' is not allowed in state '${this.state}'`,
      };
    }

    // null means stay in current state (e.g. inject while running)
    const newState = target ?? this.state;
    this.state = newState;

    return { allowed: true, newState };
  }

  getAllowedActions(): SimulationAction[] {
    const allActions: SimulationAction[] = [
      'start', 'pause', 'resume', 'stop', 'reset',
      'seek', 'seek_complete',
      'inject', 'inject_complete',
    ];

    return allActions.filter(action => {
      const key = `${this.state}:${action}`;
      return TRANSITIONS[key] !== undefined;
    });
  }

  /**
   * Force state (for internal use during composite operations like seek
   * which internally calls pause → reset → replay → resume).
   */
  forceState(state: SimulationState): void {
    this.state = state;
  }
}
