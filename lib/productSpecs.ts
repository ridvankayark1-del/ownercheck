export type SpecLike = {
  key: string;
  label?: string | null;
  value?: unknown;
  status?: string | null;
};

const SPEC_GROUPS = [
  {
    label: "Sound",
    keys: [
      "bass_amount",
      "treble_amount",
      "sound_signature",
      "sound_profile",
      "frequency_response",
      "audio_reproduction_accuracy",
    ],
  },
  {
    label: "Design",
    keys: [
      "type",
      "enclosure",
      "wireless",
      "transducer",
      "noise_cancelling",
      "mic",
    ],
  },
  {
    label: "Connectivity",
    keys: [
      "bluetooth_version",
      "codec_support",
      "connection",
      "latency",
      "app_support",
    ],
  },
  {
    label: "Battery",
    keys: ["battery_life", "charge_time", "total_battery_life", "quick_charge"],
  },
  {
    label: "Comfort / Build",
    keys: ["weight", "water_resistance", "fit", "controls"],
  },
] as const;

export function normalizeSpecKey(value: string) {
  return value
    .replace(/^spec:/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function formatSpecLabel(value: string) {
  return normalizeSpecKey(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getGroupedSpecs<T extends SpecLike>(items: T[]) {
  const filledItems = items.filter((item) => String(item.value || "").trim());
  const usedKeys = new Set<string>();
  const groups = SPEC_GROUPS.map((group) => {
    const groupItems = filledItems.filter((item) => {
      const key = normalizeSpecKey(item.key);
      const match = group.keys.includes(key as never);
      if (match) usedKeys.add(item.key);
      return match;
    });

    return {
      label: group.label as string,
      items: groupItems,
    };
  }).filter((group) => group.items.length > 0);
  const otherItems = filledItems.filter((item) => !usedKeys.has(item.key));

  if (otherItems.length > 0) {
    groups.push({
      label: "Other",
      items: otherItems,
    });
  }

  return groups;
}
