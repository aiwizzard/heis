export type ChatItem = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  title?: string;
  state?: string;
};
export type Question = {
  id: string;
  question: string;
  isSecret?: boolean;
  options?: { label: string; description?: string }[];
};
export type PendingRequest = {
  id: string;
  kind: "command" | "file" | "input";
  title: string;
  detail: string;
  questions?: Question[];
  canAccept: boolean;
};
export type Thread = {
  id: string;
  title: string;
  project: string | null;
  design?: { projectId: string; sessionId: string };
  providerId?: string;
  model?: string;
  items: ChatItem[];
  status: "idle" | "starting" | "running" | "waiting" | "error";
  error?: string;
  requests: PendingRequest[];
  draft?: string;
};
export type CodexStatus = {
  state: "connecting" | "ready" | "signed-out" | "error";
  message: string;
  binary?: string;
  account?: string;
  loginPending?: boolean;
};
export type Model = { id: string; name: string; isDefault: boolean };
export type Snapshot = {
  revision: number;
  projects: string[];
  threads: Thread[];
  codex: CodexStatus;
  models: Model[];
};
export type SendInput = {
  design?: { projectId: string; sessionId: string };
  threadId?: string;
  project: string;
  text: string;
  model?: string;
};
export type RequestAnswer = {
  threadId: string;
  requestId: string;
  decision?: "accept" | "decline" | "cancel";
  answers?: Record<string, string>;
};
export interface DesktopAPI {
  platform: string;
  chooseDirectory(): Promise<string | null>;
  snapshot(): Promise<Snapshot>;
  refreshCodex(): Promise<void>;
  login(): Promise<void>;
  cancelLogin(): Promise<void>;
  chooseCodex(): Promise<void>;
  send(input: SendInput): Promise<string>;
  stop(threadId: string): Promise<void>;
  answer(input: RequestAnswer): Promise<void>;
  importDrafts(data: unknown): Promise<void>;
  onSnapshot(callback: (snapshot: Snapshot) => void): () => void;
}
