export const LINEAR_SPEED = 0.45;
export const ANGULAR_SPEED = 0.9;
export const PUBLISH_RATE_HZ = 10;

export const teleopKeys = new Set(["w", "a", "s", "d", "q", "e", " ", "Shift"]);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
}

export function normalizeTeleopKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export type TeleopCommand = {
  linear_x: number;
  linear_y: number;
  linear_z: number;
  angular_x: number;
  angular_y: number;
  angular_z: number;
};

export function calculateTeleopCommand(keys: Set<string>): TeleopCommand {
  if (keys.has(" ")) {
    return {
      linear_x: 0,
      linear_y: 0,
      linear_z: 0,
      angular_x: 0,
      angular_y: 0,
      angular_z: 0,
    };
  }

  const speedMultiplier = keys.has("Shift") ? 2.0 : 1.0;

  let linearX = 0.0;
  let linearY = 0.0;
  let angularZ = 0.0;

  if (keys.has("w")) {
    linearX = LINEAR_SPEED * speedMultiplier;
  } else if (keys.has("s")) {
    linearX = -LINEAR_SPEED * speedMultiplier;
  }

  if (keys.has("a")) {
    linearY = LINEAR_SPEED * speedMultiplier;
  } else if (keys.has("d")) {
    linearY = -LINEAR_SPEED * speedMultiplier;
  }

  if (keys.has("q")) {
    angularZ = ANGULAR_SPEED * speedMultiplier;
  } else if (keys.has("e")) {
    angularZ = -ANGULAR_SPEED * speedMultiplier;
  }

  return {
    linear_x: linearX,
    linear_y: linearY,
    linear_z: 0,
    angular_x: 0,
    angular_y: 0,
    angular_z: angularZ,
  };
}
