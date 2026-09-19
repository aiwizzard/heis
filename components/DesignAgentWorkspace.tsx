import { DesignWorkspace } from "../packages/editor/src/DesignWorkspace";
import CodexStudio from "./CodexStudio";
export default function DesignAgentWorkspace({
  projectId,
  input,
}: {
  projectId?: string;
  input?: { url: string; name: string };
}) {
  return (
    <DesignWorkspace
      bridge={window.heisEditor}
      projectId={projectId}
      input={input}
      chat={(directory, scope) => (
        <CodexStudio
          key={scope.sessionId}
          projectDirectory={directory}
          design={scope}
          compact
        />
      )}
    />
  );
}
