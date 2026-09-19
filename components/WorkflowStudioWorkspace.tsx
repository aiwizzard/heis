import { useEffect, useState } from "react";
import {
  WorkflowWorkspace,
  type LegacyWorkflow,
} from "../packages/editor/src/WorkflowWorkspace";
export default function WorkflowStudioWorkspace({
  projectId,
}: {
  projectId?: string;
}) {
  const [legacy, setLegacy] = useState<LegacyWorkflow[]>([]);
  useEffect(() => {
    let live = true;
    void window.heis.projects.listWorkflows().then((result) => {
      if (live && result.ok)
        setLegacy(
          result.value.map((w) => ({ id: w.id, name: w.name, record: w })),
        );
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <WorkflowWorkspace
      bridge={window.heisEditor}
      projectId={projectId}
      legacy={legacy}
    />
  );
}
