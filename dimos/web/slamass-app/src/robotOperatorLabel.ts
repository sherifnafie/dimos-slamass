import { POLARIS_GO2_PREVIEW_URL } from "./polarisAssets";

/**
 * Label for the map robot marker hover card. Set `VITE_ROBOT_OPERATOR_LABEL` in `.env`
 * (e.g. fleet name or robot ID); otherwise `fallback` is used.
 */
export function resolveRobotOperatorLabel(fallback: string): string {
  const raw = import.meta.env.VITE_ROBOT_OPERATOR_LABEL as string | undefined;
  const trimmed = raw?.trim();
  return trimmed || fallback;
}

export type RobotOperatorActive = "green" | "blue" | "grey";

/** Compact “operator row” content for the map robot hover game-card. */
export type RobotOperatorHoverCard = {
  /** Main card title (e.g. robot model). */
  instanceName: string;
  /** Secondary line under the title (e.g. session / fleet from env). */
  modelTitle?: string;
  /** Shown as Type · … (optional). */
  typeLine?: string;
  location?: string;
  task?: string;
  imageUrl: string;
  imageAlt: string;
  active?: RobotOperatorActive;
};

/**
 * Default hover card matching the first Polaris operator row (Go2). Optional
 * `VITE_ROBOT_OPERATOR_IMAGE_URL` overrides the preview image.
 */
export function defaultRobotOperatorHoverCard(
  preset: "slamass" | "navigator",
): RobotOperatorHoverCard {
  const envLabel = (import.meta.env.VITE_ROBOT_OPERATOR_LABEL as string | undefined)?.trim();
  const modelTitle =
    preset === "navigator" ? envLabel || undefined : envLabel || "Slamass operator";
  const imageOverride = (
    import.meta.env.VITE_ROBOT_OPERATOR_IMAGE_URL as string | undefined
  )?.trim();
  return {
    instanceName: "Unitree Go2",
    modelTitle,
    typeLine: "Unitree Go2 X",
    location: "Floor lab",
    task: preset === "navigator" ? "Live session" : "Patrol",
    imageUrl: imageOverride || POLARIS_GO2_PREVIEW_URL,
    imageAlt: "Unitree Go2 robot",
    active: "green",
  };
}
