import type { Edge, Node, NodeProps } from "reactflow";

export type PrimitiveValue = string | number | boolean | null;
export type FormValue =
  | PrimitiveValue
  | File
  | FormValue[]
  | { [key: string]: FormValue };
export type FormValues = Record<string, FormValue>;

export interface EnumOption {
  label?: string;
  name?: string;
  value: PrimitiveValue;
}

export interface SchemaField {
  type?: string;
  title?: string;
  name?: string;
  description?: string;
  default?: FormValue;
  examples?: FormValue[];
  enum?: Array<PrimitiveValue | EnumOption>;
  properties?: SchemaProperties;
  items?: SchemaField;
  required?: boolean | string[];
  minimum?: number;
  maximum?: number;
  min?: number;
  max?: number;
  step?: number;
  format?: string;
  handle?: string;
  handleType?: string;
  accept?: string;
  placeholder?: string;
  field?: string;
  allowManual?: boolean;
  maxItems?: number;
  minValue?: number;
  maxValue?: number;
  ui?: { can_link_from_node?: boolean };
}

export interface DynamicSchemaEntry {
  model_id?: string;
  schema?: { input_schema?: SchemaProperties };
}

export interface ApiWorkflowSchemaModel extends ModelDefinition {
  input_schema?: SchemaProperties;
  dynamic_schemas?: Record<string, DynamicSchemaEntry>;
}

export type SchemaProperties = Record<string, SchemaField>;

export interface ModelDefinition {
  id: string;
  name?: string;
  category?: string;
  model_type?: string;
  model_name?: string;
  cost?: number | null;
  input_params?: {
    properties?: SchemaProperties;
    required?: string[];
  };
  output_params?: {
    properties?: SchemaProperties;
  };
}

export interface NodeOutput {
  name?: string;
  type?: string;
  value?: FormValue;
}

export interface OutputHistoryEntry {
  runId?: string;
  node_run_id?: string;
  started_at?: string;
  status?: string;
  timestamp?: string;
  result?: {
    id?: string;
    outputs?: NodeOutput[];
  };
  error?: string;
}

export interface WorkflowSchemaModel extends ModelDefinition {
  input_schema?: {
    schemas?: {
      input_data?: {
        properties?: SchemaProperties;
        required?: string[];
      };
    };
  };
}

export interface WorkflowNodeSchemas {
  categories?: Record<string, {
    models?: Record<string, WorkflowSchemaModel>;
  }>;
}

export type ConnectedEdge = Edge & { target: string };

export interface WorkflowNodeData {
  modelId?: string;
  selectedModel?: ModelDefinition | null;
  formValues?: FormValues;
  taskData?: SchemaProperties;
  nodeSchemas?: WorkflowNodeSchemas;
  dynamicSchemas?: Record<string, DynamicSchemaEntry & { model_type?: string }>;
  outputHistory?: OutputHistoryEntry[];
  outputs?: NodeOutput[];
  resultUrl?: FormValue;
  runId?: string | null;
  cost?: number | null;
  loading?: number;
  isLoading?: boolean;
  errorMsg?: string | null;
  triggerRun?: boolean;
  triggerInputs?: boolean;
  exposedHandles?: string[];
  connectedEdges?: ConnectedEdge[];
  activeHandleColor?: string | null;
  interactionMode?: string;
  viewingOutput?: FormValue;
  handleTypes?: Record<string, string>;
  workflowName?: string;
  template?: boolean;
  onDataChange: (
    nodeId: string,
    update: Partial<WorkflowNodeData>,
    targetId?: string,
  ) => void;
  duplicateNode: (nodeId: string) => void;
  publishWorkflow?: () => void;
  handleSaveWorkFlow: () => Promise<string | null>;
}

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowNodeProps = NodeProps<WorkflowNodeData>;

export interface WorkflowData {
  workflow_id?: string;
  run_id?: string;
  name?: string;
  nodes?: WorkflowNode[];
  edges?: Edge[];
  is_template?: boolean;
}

export interface WorkflowBuilderProps {
  apiKey?: string;
  initialNodeSchemas?: WorkflowNodeSchemas | null;
  initialWorkflowData?: WorkflowApiResponse | null;
  onGenerationStart?: () => void;
  onGenerationEnd?: () => void;
  onGenerationComplete?: (result: FormValue | { type: "workflow" }) => void;
  onGenerationError?: (message: string) => void;
}

export interface UploadFields {
  key: string;
  [field: string]: string;
}

export interface WorkflowChatMessage {
  role: "user" | "assistant" | "agent";
  content: string;
  suggestions?: string[];
  timestamp: string;
}

export interface SerializedWorkflowNode {
  id: string;
  category: string;
  model: string;
  position?: { x?: number; y?: number };
  input_params?: FormValues;
  params?: FormValues;
  output_params?: {
    outputs?: NodeOutput[];
    resultUrl?: FormValue;
  };
}

export interface SerializedWorkflow {
  nodes: SerializedWorkflowNode[];
  edges?: Edge[];
}

export interface WorkflowApiResponse {
  data?: SerializedWorkflow;
  edges?: Edge[];
  run_history?: Record<string, OutputHistoryEntry[]>;
  workflow_id?: string;
  run_id?: string;
  name?: string;
  category?: string;
  is_owner?: boolean;
  is_published?: boolean;
  show_temp_button?: boolean;
  is_template?: boolean;
}

export type NodeRunStatus = Record<string, OutputHistoryEntry[]>;
