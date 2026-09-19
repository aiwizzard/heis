import { useEffect, useState } from "react";
import { ClippingWorkspace } from "../packages/editor/src/ClippingWorkspace";
import DesignAgentWorkspace from "./DesignAgentWorkspace";
import StandaloneShell from "./StandaloneShell";

export default function EditorToolWorkspace({
  id,
  projectId,
  locale,
  input,
  onResult,
}: {
  id: string;
  projectId: string;
  locale: string;
  input?: { url: string; name: string };
  onResult: (urls: string[], jobId: string) => void;
}) {
  const [files, setFiles] = useState<File[] | undefined>(),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setFiles(undefined);
    if (input && id !== "clipping" && id !== "design-agent")
      void fetch(input.url)
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not load selected media");
          const blob = await response.blob();
          if (!cancelled)
            setFiles([new File([blob], input.name, { type: blob.type })]);
        })
        .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [input?.url, id]);
  if (id === "design-agent") return <DesignAgentWorkspace projectId={projectId} input={input}/>;
  if (id === "clipping") return <ClippingWorkspace bridge={window.heisEditor} api={window.heis.generation} input={input} />;
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <StandaloneShell
        locale={locale}
        routeParams={{ slug: [id] }}
        initialDroppedFiles={files}
        onProjectResult={(data) => {
          const raw = data?.outputs || data?.clips || [data];
          const urls = (Array.isArray(raw) ? raw : [raw])
            .map((item) =>
              typeof item === "string"
                ? item
                : item?.url || item?.video || item?.image,
            )
            .filter(Boolean);
          if (urls.length)
            onResult(urls, data?.jobId || data?.id || urls.join("|"));
        }}
      />
    </>
  );
}
