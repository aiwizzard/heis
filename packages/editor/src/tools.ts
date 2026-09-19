export interface EditorTool {
  id: string;
  name: string;
  group: "Create" | "Clip" | "Image" | "Workflow";
  available: boolean;
  input?: "video" | "image";
  note?: string;
}
export const editorTools: EditorTool[] = [
  { id: "image", name: "Generate image", group: "Create", available: true },
  { id: "video", name: "Generate video", group: "Create", available: true },
  { id: "audio", name: "Voice and music", group: "Create", available: true },
  { id: "cinema", name: "Cinema", group: "Create", available: true },
  {
    id: "lipsync",
    name: "Lip sync",
    group: "Clip",
    available: true,
    input: "video",
  },
  {
    id: "motion-control",
    name: "Motion control",
    group: "Clip",
    available: true,
    input: "video",
  },
  {
    id: "body-swap",
    name: "Body swap",
    group: "Clip",
    available: true,
    input: "video",
  },
  {
    id: "vibe-motion",
    name: "Motion graphics",
    group: "Create",
    available: true,
  },
  {
    id: "marketing",
    name: "Marketing video",
    group: "Workflow",
    available: true,
  },
  {
    id: "ai-influencer",
    name: "AI influencer",
    group: "Workflow",
    available: true,
  },
  {
    id: "layers",
    name: "Image layers",
    group: "Image",
    available: true,
    input: "image",
  },
  {
    id: "clipping",
    name: "AI clipping",
    group: "Clip",
    available: true,
    input: "video",
  },
  {
    id: "workflows",
    name: "Automation workflows",
    group: "Workflow",
    available: false,
    note: "Workflow execution is being migrated.",
  },
  {
    id: "design-agent",
    name: "Design agent",
    group: "Workflow",
    available: false,
    note: "Design tools are being migrated.",
  },
];
