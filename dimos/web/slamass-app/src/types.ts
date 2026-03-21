export interface RobotPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface PovState {
  available: boolean;
  seq: number;
  updated_at: string | null;
  image_url: string;
}

export interface MapState {
  map_id: string;
  resolution: number;
  origin_x: number;
  origin_y: number;
  width: number;
  height: number;
  updated_at: string;
  image_version: number;
  image_url: string;
}

export interface UiCameraState {
  center_x: number | null;
  center_y: number | null;
  zoom: number;
}

export interface UiState {
  revision: number;
  camera: UiCameraState;
  selected_poi_id: string | null;
  highlighted_poi_ids: string[];
}

export interface Poi {
  poi_id: string;
  map_id: string;
  world_x: number;
  world_y: number;
  world_yaw: number;
  title: string;
  summary: string;
  category: string;
  interest_score: number;
  status: string;
  objects: string[];
  created_at: string;
  updated_at: string;
  thumbnail_url: string;
  hero_image_url: string;
}

export interface InspectionState {
  status: string;
  message: string;
  poi_id: string | null;
}

export interface AppState {
  connected: boolean;
  robot_pose: RobotPose | null;
  path: Array<[number, number]>;
  pov: PovState;
  map: MapState | null;
  pois: Poi[];
  inspection: InspectionState;
  ui: UiState;
}
