import { Poi, SemanticItem, SemanticItemRef, YoloObject } from "./types";

export function semanticKey(item: SemanticItemRef | null): string {
  if (!item) {
    return "none";
  }
  return `${item.kind}:${item.entity_id}`;
}

export function isSameSemanticRef(
  left: SemanticItemRef | null | undefined,
  right: SemanticItemRef | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }
  return left.kind === right.kind && left.entity_id === right.entity_id;
}

export function refFromPoi(poiId: string): SemanticItemRef {
  return { kind: "vlm_poi", entity_id: poiId };
}

export function refFromYoloObject(objectId: string): SemanticItemRef {
  return { kind: "yolo_object", entity_id: objectId };
}

export function resolveSelectedPoi(
  pois: Poi[],
  selected: SemanticItemRef | null,
): Poi | null {
  if (!selected || selected.kind !== "vlm_poi") {
    return null;
  }
  return pois.find((poi) => poi.poi_id === selected.entity_id) ?? null;
}

export function resolveSelectedYoloObject(
  objects: YoloObject[],
  selected: SemanticItemRef | null,
): YoloObject | null {
  if (!selected || selected.kind !== "yolo_object") {
    return null;
  }
  return objects.find((object) => object.object_id === selected.entity_id) ?? null;
}

export function mergePoi(existing: Poi[], nextPoi: Poi): Poi[] {
  const index = existing.findIndex((poi) => poi.poi_id === nextPoi.poi_id);
  if (index === -1) {
    return [...existing, nextPoi];
  }
  const copy = existing.slice();
  copy[index] = nextPoi;
  return copy;
}

export function mergeYoloObject(existing: YoloObject[], nextObject: YoloObject): YoloObject[] {
  const index = existing.findIndex((object) => object.object_id === nextObject.object_id);
  if (index === -1) {
    return [...existing, nextObject];
  }
  const copy = existing.slice();
  copy[index] = nextObject;
  return copy;
}

export function buildSemanticItems(pois: Poi[], yoloObjects: YoloObject[]): SemanticItem[] {
  const poiItems = pois
    .filter((poi) => poi.status !== "deleted")
    .map<SemanticItem>((poi) => {
      const summary = poi.summary?.trim();
      return {
        kind: "vlm_poi",
        entity_id: poi.poi_id,
        title: poi.title,
        subtitle: poi.category,
        world_x: poi.target_x,
        world_y: poi.target_y,
        world_yaw: poi.anchor_yaw,
        thumbnail_url: poi.thumbnail_url,
        updated_at: poi.updated_at,
        summary: summary && summary.length > 0 ? summary : undefined,
      };
    });

  const yoloItems = yoloObjects
    .filter((object) => object.status !== "deleted")
    .map<SemanticItem>((object) => ({
      kind: "yolo_object",
      entity_id: object.object_id,
      title: object.label,
      subtitle: `${Math.round(object.best_confidence * 100)}%`,
      world_x: object.world_x,
      world_y: object.world_y,
      world_yaw: object.best_view_yaw,
      thumbnail_url: object.thumbnail_url,
      updated_at: object.updated_at,
    }));

  return [...poiItems, ...yoloItems].sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at),
  );
}
