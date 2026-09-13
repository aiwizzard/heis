"use client"

import React from "react";
import { ReactFlowProvider } from "reactflow";
import NodeFlow from "./components/NodeFlow";
import type { WorkflowBuilderProps } from "./types";

export default function Home({
  apiKey,
  initialNodeSchemas,
  initialWorkflowData,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
}: WorkflowBuilderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-full">
      <ReactFlowProvider>
        <NodeFlow
          apiKey={apiKey}
          initialNodeSchemas={initialNodeSchemas}
          initialWorkflowData={initialWorkflowData}
          onGenerationStart={onGenerationStart}
          onGenerationEnd={onGenerationEnd}
          onGenerationComplete={onGenerationComplete}
          onGenerationError={onGenerationError}
        />
      </ReactFlowProvider>
    </div>
  );
}
