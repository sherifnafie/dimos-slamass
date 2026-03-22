const PENDING_KEY = "polaris.deploy.pending.v1";
const HYDRATE_KEY = "polaris.deploy.hydrate.v1";

export type PolarisDeployPayloadV1 = {
  v: 1;
  pickId: string;
  useCase: string;
  deployedAt: number;
  manipulatorId: string | null;
};

/** Stash create-wizard choices; caller navigates to `/polaris/navigator` after UI delay. */
export function writePolarisDeployPendingPayload(
  payload: Omit<PolarisDeployPayloadV1, "v" | "deployedAt">,
): void {
  if (typeof window === "undefined") {
    return;
  }
  const full: PolarisDeployPayloadV1 = {
    v: 1,
    pickId: payload.pickId,
    useCase: payload.useCase,
    manipulatorId: payload.manipulatorId,
    deployedAt: Date.now(),
  };
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(full));
}

/** Entries to restore operator list after React Strict Mode remount (pending already consumed). */
export function readPolarisDeployHydratedFleetJson(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(HYDRATE_KEY);
}

export function writePolarisDeployHydratedFleetJson(json: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(HYDRATE_KEY, json);
}

export function takePolarisDeployPendingPayload(): PolarisDeployPayloadV1 | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(PENDING_KEY);
  if (!raw) {
    return null;
  }
  window.sessionStorage.removeItem(PENDING_KEY);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as PolarisDeployPayloadV1).v === 1 &&
      typeof (parsed as PolarisDeployPayloadV1).pickId === "string"
    ) {
      return parsed as PolarisDeployPayloadV1;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function polarisNavigatorPath(): string {
  const base = import.meta.env.BASE_URL;
  const path = "/polaris/navigator";
  if (!base || base === "/") {
    return path;
  }
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${prefix}${path}`;
}
