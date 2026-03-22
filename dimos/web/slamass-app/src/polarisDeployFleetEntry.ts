import type { PolarisOperatorFleetEntry } from "./polarisOperatorFleet";
import type { PolarisDeployPayloadV1 } from "./polarisDeploySession";
import {
  POLARIS_AS2_PREVIEW_URL,
  POLARIS_GO2_PREVIEW_URL,
  POLARIS_OPERATOR_MOUNT_GO2_EDU_URL,
  POLARIS_OPERATOR_SELECT_THUMB_URL,
  POLARIS_CREATE_PICK_SECOND_URL,
} from "./polarisAssets";

function taskFromUseCase(useCase: string): string {
  const line =
    useCase
      .trim()
      .split(/\r?\n/)[0]
      ?.trim()
      .replace(/\s+/g, " ")
      .slice(0, 72) ?? "";
  return line.length > 0 ? line : "New operator";
}

function mountThumbAndValue(
  manipulatorId: string | null,
): Pick<PolarisOperatorFleetEntry, "mountThumbUrl" | "mountValue" | "mountThumbHref"> {
  if (manipulatorId === "d1t") {
    return {
      mountThumbUrl: POLARIS_OPERATOR_MOUNT_GO2_EDU_URL,
      mountValue: "D1-T",
      mountThumbHref: "https://www.unitree.com/D1-T",
    };
  }
  if (manipulatorId === "z1") {
    return {
      mountThumbUrl: POLARIS_OPERATOR_SELECT_THUMB_URL,
      mountValue: "Z1 gripper",
    };
  }
  return { mountThumbUrl: null };
}

export function buildFleetEntryFromDeploy(
  payload: PolarisDeployPayloadV1,
): PolarisOperatorFleetEntry | null {
  const id = `deployed-${payload.deployedAt}`;
  const mount = mountThumbAndValue(payload.manipulatorId);
  const task = taskFromUseCase(payload.useCase);

  if (payload.pickId === "go2") {
    return {
      id,
      title: "Unitree Go2",
      category: { label: "Type", value: "Unitree Go2 X" },
      location: "Map",
      task,
      active: "blue",
      imageUrl: POLARIS_GO2_PREVIEW_URL,
      imageAlt: "Unitree Go2 robot",
      ...mount,
    };
  }
  if (payload.pickId === "g1") {
    return {
      id,
      title: "Unitree G1",
      category: { label: "Type", value: "Humanoid" },
      location: "Map",
      task,
      active: "blue",
      imageUrl: POLARIS_CREATE_PICK_SECOND_URL,
      imageAlt: "Unitree G1 humanoid robot",
      ...mount,
    };
  }
  if (payload.pickId === "as2") {
    return {
      id,
      title: "Unitree B2",
      category: { label: "Type", value: "Unitree B2" },
      location: "Map",
      task,
      active: "blue",
      imageUrl: POLARIS_AS2_PREVIEW_URL,
      imageAlt: "Unitree B2 robot",
      ...mount,
    };
  }
  return null;
}

export function fleetEntriesToHydrateJson(entries: PolarisOperatorFleetEntry[]): string {
  return JSON.stringify({ entries });
}

export function parseHydratedFleetEntries(json: string): PolarisOperatorFleetEntry[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === "object" && "entries" in parsed) {
      const entries = (parsed as { entries: unknown }).entries;
      if (Array.isArray(entries)) {
        return entries as PolarisOperatorFleetEntry[];
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}
