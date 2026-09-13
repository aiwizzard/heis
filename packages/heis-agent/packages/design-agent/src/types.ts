import type { ReactNode } from "react";

export type AssetKind = "image" | "video" | "audio" | "text" | string;

export interface Asset {
  asset_label: string;
  url?: string;
  kind: AssetKind;
  source_tool?: string;
  model?: string | null;
  prompt?: string | null;
}

export interface Skill {
  name: string;
  inputs?: string[];
  description?: string;
  icon?: string;
  [key: string]: unknown;
}

export interface Session {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  asset_count?: number;
}

export interface PlanNode {
  id: string;
  tool: string;
  label?: string;
  depends?: string[];
  est_credits?: number;
}

export interface ExecutionPlan {
  title: string;
  total_credits: number;
  nodes: PlanNode[];
  notes?: string[];
}

export interface AgentEvent {
  id?: string;
  type: string;
  job_id?: string;
  content?: string;
  message?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: {
    ok?: boolean;
    model?: string;
    ask_user?: boolean;
    choices?: string[];
    question?: string;
    error?: string;
    source_asset_id?: string;
    [key: string]: unknown;
  };
  asset?: Asset;
  title?: string;
  nodes?: PlanNode[];
  total_credits?: number;
  handled?: boolean;
  needs_approval?: boolean;
  onAction?: (jobId: string, action: "approve" | "reject") => void;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  events?: AgentEvent[];
  attachments?: Asset[];
  timestamp: string;
  skill_name?: string;
}

export interface EventEnvelope {
  id?: string;
  type: string;
  job_id?: string;
  approved?: boolean | null;
  payload?: {
    op?: string;
    args?: Record<string, unknown>;
    content?: string;
    message?: string;
    name?: string;
    result?: Record<string, unknown>;
    asset?: Asset;
    title?: string;
    nodes?: PlanNode[];
    total_credits?: number;
    job_id?: string;
    [key: string]: unknown;
  };
}

export interface CanvasItem {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex?: number;
  locked?: boolean;
  hidden?: boolean;
  scaleX?: number;
  scaleY?: number;
  offsetX?: number;
  offsetY?: number;
  assetLabel?: string | null;
  src?: string;
  image?: HTMLImageElement | HTMLVideoElement;
  text?: string;
  fontSize?: number;
  fill?: string;
  label?: string;
  draggable?: boolean;
}

export interface CanvasStateNode {
  asset_id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  locked: boolean;
}

export interface CanvasSnapshot {
  viewport: { w: number; h: number; zoom: number; pan: [number, number] };
  selected: string | null;
  nodes: CanvasStateNode[];
}

export interface CanvasMove {
  asset_id: string;
  x: number;
  y: number;
}

export interface TaskOutput {
  value?: string;
  url?: string;
  image_url?: string;
  type?: string;
}

export interface ActiveTask {
  taskId: string;
  modelName: string;
  status: string;
  x?: number;
  y?: number;
  assetLabel?: string;
  addedToCanvas?: boolean;
  fullyMounted?: boolean;
  resultUrl?: {
    rawOutputs?: Array<string | TaskOutput>;
    examples?: Array<string | TaskOutput>;
  };
}

export interface CanvasAreaHandle {
  addImage: (src: string, x?: number, y?: number, width?: number, height?: number, onLoaded?: () => void, assetLabel?: string) => void;
  addVideo: (src: string, x?: number, y?: number, width?: number, height?: number, onLoaded?: () => void, assetLabel?: string) => void;
  addAudio: (src: string, x?: number, y?: number, label?: string, assetLabel?: string) => void;
  getCanvasState: () => CanvasSnapshot;
  moveNode: (assetLabel: string, x: number, y: number) => void;
  placeNextToSource: (sourceLabel: string, newUrl: string, newKind: string, newAssetLabel: string) => void;
  replaceAt: (sourceLabel: string, newUrl: string, newKind: string, newAssetLabel: string) => void;
  arrangeNodes: (moves: CanvasMove[]) => number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export interface DesignUser {
  username?: string;
  balance?: number | string;
  email?: string;
  profile_photo?: string;
  [key: string]: unknown;
}

export interface NavLink {
  icon?: ReactNode;
  label: string;
  path: string;
}
