/** Ollama LLM configuration */
export const OLLAMA_CONFIG = {
  baseUrl: 'http://localhost:11434',
  model: 'alibayram/smollm3',
  maxTokens: 150,
  temperature: 0.7,
  timeoutMs: 3000,
  openingMaxTokens: 420,
  openingTemperature: 0.35,
  openingTimeoutMs: 12000,
  healthCheckIntervalMs: 10000,
};

/** AI tuning constants. Avoid magic numbers in logic files. */
export const AI_CONFIG = {
  /** Score delta required to switch away from current intent */
  switchThreshold: 5,

  /** Base scores for each intent type */
  baseScores: {
    advance_to_point: 10,
    protect_target: 8,
    focus_enemy: 9,
    retreat_to_point_emergency: 12,
    retreat_to_point_normal: 2,
    hold_position: 5,
    use_skill: 6,
  },

  /** HP threshold below which retreat gets emergency base score */
  retreatHpThreshold: 0.4,

  /** Personality modifier ranges [min, max] applied via trait 0-1 */
  personality: {
    advanceBoldness: [-10, 15] as [number, number],
    advanceCaution: [0, 12] as [number, number],
    retreatCaution: [-5, 20] as [number, number],
    retreatBoldness: [0, 10] as [number, number],
    protectEmpathy: [-5, 18] as [number, number],
    focusBoldness: [-3, 12] as [number, number],
    holdDiscipline: [-2, 10] as [number, number],
  },

  /** Command boost ranges scaled by discipline */
  commandBoost: {
    protect: [0, 15] as [number, number],
    advance: [0, 12] as [number, number],
    hold: [0, 10] as [number, number],
    focus: [0, 12] as [number, number],
  },

  /** Decisiveness → minimum hold time mapping: 1s at 0.0, 4s at 1.0 */
  minHoldTime: { base: 1, scale: 3 },

  /** Recheck interval: 1s at decisiveness=1.0, 3s at decisiveness=0.0 */
  recheckInterval: { base: 1, scale: 2 },
};
