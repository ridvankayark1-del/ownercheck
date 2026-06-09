export const OWNER_EVALUATION_CRITERIA: Record<string, string[]> = {
  Headphones: [
    "Comfort",
    "Sound quality",
    "Noise cancellation",
    "Microphone quality",
    "Battery life",
    "Build quality",
    "App/device compatibility",
    "Value",
  ],
  Microphones: [
    "Voice quality",
    "Noise rejection",
    "Setup difficulty",
    "Build quality",
    "Mounting/accessories",
    "Compatibility",
    "Value",
  ],
  Camera: [
    "Image quality",
    "Video quality",
    "Stabilization",
    "Autofocus",
    "Battery life",
    "Ease of use",
    "Audio setup",
    "Value",
  ],
  "Audio Interface": [
    "Sound quality",
    "Latency",
    "Driver stability",
    "Setup difficulty",
    "Input/output flexibility",
    "Build quality",
    "Value",
  ],
  Lighting: [
    "Brightness",
    "Color quality",
    "Control options",
    "Mounting/setup",
    "Build quality",
    "Heat/noise",
    "Value",
  ],
  Keyboard: [
    "Typing feel",
    "Layout",
    "Noise level",
    "Build quality",
    "Connectivity",
    "Battery life",
    "Value",
  ],
  Controller: [
    "Button/layout usefulness",
    "Software support",
    "Setup difficulty",
    "Build quality",
    "Workflow improvement",
    "Compatibility",
    "Value",
  ],
};

export const FALLBACK_OWNER_EVALUATION_CRITERIA = [
  "Ease of use",
  "Build quality",
  "Compatibility",
  "Reliability",
  "Value",
];

export function getOwnerEvaluationCriteria(category?: string | null) {
  const normalized = (category || "").trim().toLowerCase();
  const match = Object.entries(OWNER_EVALUATION_CRITERIA).find(
    ([key]) => key.toLowerCase() === normalized
  );

  return match?.[1] || FALLBACK_OWNER_EVALUATION_CRITERIA;
}

export function getAverageScore(scores: Record<string, number>) {
  const values = Object.values(scores).filter(
    (score) => Number.isFinite(score) && score >= 1 && score <= 5
  );

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, score) => sum + score, 0) / values.length;
}
