import type { Dispatch, SetStateAction } from "react";

export type HostApplication = "muapiapp" | "vadoo";

export interface UserIdentity {
  email?: string;
  name?: string;
  username?: string;
  profile?: string;
  profile_photo?: string;
}

export interface UserContext {
  user?: UserIdentity;
  serverDetails?: {
    user_details?: UserIdentity;
  };
}

export type UseUser = () => UserContext;

export interface HostProps {
  useUser?: UseUser;
  usedIn?: HostApplication;
}

export interface AgentThemeColors {
  background: string;
  foreground: string;
  muted: string;
  border: string;
  componentBg: string;
  componentHover: string;
  headerBg: string;
  userBubble: string;
  userText: string;
  agentBubble: string;
  agentText: string;
  inputBg: string;
  accent: string;
  accentText: string;
}

export interface AgentTheme {
  id: string;
  name: string;
  colors: AgentThemeColors;
}

export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
}

export interface AgentDetails {
  id?: string;
  agent_id?: string;
  name: string;
  description?: string;
  system_prompt?: string;
  icon_url?: string;
  skills?: AgentSkill[];
  skill_ids?: string[];
  theme?: string | AgentTheme;
  is_owner?: boolean;
  is_published?: boolean;
  is_template?: boolean;
  has_liked?: boolean;
  like_count?: number;
  owner_username?: string;
  owner_email?: string;
  welcome_message?: string;
  initial_suggestions?: AgentSuggestion[];
  created_at?: string;
}

export interface AgentSuggestion {
  label?: string;
  prompt?: string;
}

export interface ChatMessage {
  id?: string;
  role?: "user" | "assistant" | "system";
  type?: "pulse";
  content: string;
  thoughts?: string;
  status?: string[];
  suggestions?: AgentSuggestion[];
  attachments?: string[];
  timestamp?: string | Date;
}

export interface ConversationHistory {
  history: ChatMessage[];
  created_at?: string;
}

export interface AgentProfileData {
  agent: AgentDetails;
  total_messages: number;
  total_chats: number;
  recent_chats: Array<{
    conversation_id?: string;
    id?: string;
    title?: string;
    created_at?: string;
    updated_at?: string;
    agent_slug?: string;
    agent_id?: string;
    message_count?: number;
  }>;
}

export interface AgentFormData {
  name: string;
  description: string;
  system_prompt: string;
  icon_url: string;
  skill_ids: string[];
  theme: string;
  is_published: boolean;
  is_template: boolean;
}

export interface ChatPageProps extends HostProps {
  initialAgentDetails?: AgentDetails | null;
  useSidebar?: () => unknown;
  searchQuery?: string;
  setSearchQuery?: Dispatch<SetStateAction<string>>;
  getSearchItems?: () => unknown[];
  initialHistory?: ConversationHistory | null;
}

export interface UploadFields {
  key: string;
  [field: string]: string;
}

export interface SelectedMedia {
  type: "image" | "video";
  url: string;
}

export interface DebugLog {
  type: "error" | "warn" | "info";
  time: string;
  msg: string;
}
