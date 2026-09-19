import React, { useEffect, useState } from "react";
import type {
  ModelCapability,
  GenerationJob,
  GenerationRequest,
  ResultEnvelope,
} from "@heis/core";
import { accessMessage, needsAccount } from "./accessMessages";
import { reserveCredits } from "@heis/core";
export interface GenerationBridge {
  listCapabilities(
    mode: "managed",
  ): Promise<ResultEnvelope<readonly ModelCapability[]>>;
  submit(request: GenerationRequest): Promise<ResultEnvelope<GenerationJob>>;
  upload(
    mode: "managed",
    file: { name: string; type: string; bytes: ArrayBuffer },
  ): Promise<ResultEnvelope<{ url: string }>>;
}
export function GeneratePanel({
  api,
  onAdvanced,
  onAccount,
  accessRevision = 0,
}: {
  onAccount?: () => void;
  accessRevision?: number;
  api: GenerationBridge;
  onAdvanced: (id: string) => void;
}) {
  const [models, setModels] = useState<readonly ModelCapability[]>([]),
    [kind, setKind] = useState("video"),
    [modelId, setModelId] = useState(""),
    [inputs, setInputs] = useState<Record<string, unknown>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setError("");
    let cancelled = false;
    void api
      .listCapabilities("managed")
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setModels([]);
          setError(result.error.message);
          return;
        }
        setModels(result.value.filter((m) => m.enabled));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, accessRevision, retry]);
  const available = models.filter((m) => m.outputKind === kind),
    model = available.find((m) => m.id === modelId) || available[0];
  useEffect(() => {
    setInputs(
      Object.fromEntries(
        (model?.parameters || [])
          .filter((p) => p.default !== undefined)
          .map((p) => [p.name, p.default]),
      ),
    );
  }, [model?.id]);
  const submit = async () => {
    if (!model) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.submit({
        operation: model.operation,
        modelId: model.id,
        inputs,
        billing: {
          mode: "managed",
          accountId: "local",
          idempotencyKey: crypto.randomUUID(),
        },
      });
      if (!result.ok) throw new Error(result.error.message);
      setMessage(
        "Creating your asset. It will appear in this project’s library.",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="heis-generate">
      <div className="heis-generate-tabs">
        {["image", "video", "audio"].map((k) => (
          <button
            key={k}
            className={kind === k ? "active" : ""}
            onClick={() => {
              setKind(k);
              setModelId("");
            }}
          >
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
        <button onClick={() => onAdvanced(kind)}>↗</button>
      </div>
      {models.length > 0 && (
        <select
          aria-label="Generation model"
          value={model?.id || ""}
          onChange={(e) => setModelId(e.target.value)}
        >
          {available.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      )}
      {model?.parameters.map((p) => {
        const update = (v: unknown) =>
          setInputs((old) => ({ ...old, [p.name]: v }));
        return (
          <label key={`${model.id}-${p.name}`}>
            {p.name.replace(/_/g, " ")}
            {p.required ? " *" : ""}
            {p.type === "enum" ? (
              <select
                value={String(inputs[p.name] ?? "")}
                onChange={(e) => update(e.target.value)}
              >
                <option value="">Select</option>
                {p.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : p.type === "boolean" ? (
              <input
                type="checkbox"
                checked={Boolean(inputs[p.name])}
                onChange={(e) => update(e.target.checked)}
              />
            ) : p.type === "number" ? (
              <input
                type="number"
                min={p.minimum}
                max={p.maximum}
                value={String(inputs[p.name] ?? "")}
                onChange={(e) => update(Number(e.target.value))}
              />
            ) : p.type === "media" || p.type === "media-list" ? (
              <input
                type="file"
                multiple={p.type === "media-list"}
                accept="image/*,video/*,audio/*"
                onChange={async (e) => {
                  try {
                    const urls = [];
                    for (const file of Array.from(e.target.files || [])) {
                      const result = await api.upload("managed", {
                        name: file.name,
                        type: file.type,
                        bytes: await file.arrayBuffer(),
                      });
                      if (!result.ok) throw new Error(result.error.message);
                      urls.push(result.value.url);
                    }
                    update(p.type === "media-list" ? urls : urls[0]);
                  } catch (error) {
                    setError(String(error));
                  }
                }}
              />
            ) : p.type === "object" ? (
              <textarea
                aria-label={p.name}
                placeholder="JSON"
                onBlur={(e) => {
                  try {
                    update(JSON.parse(e.target.value));
                  } catch {
                    setError("Enter valid JSON for " + p.name);
                  }
                }}
              />
            ) : (
              <textarea
                aria-label={p.name}
                rows={p.name.includes("prompt") ? 3 : 1}
                value={String(inputs[p.name] ?? "")}
                onChange={(e) => update(e.target.value)}
              />
            )}
          </label>
        );
      })}
      {model && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy
            ? "Submitting…"
            : `Generate · up to ${reserveCredits(model.maximumEstimatedCostUsd)} credits`}
        </button>
      )}
      {loading && <p role="status">Loading generation tools…</p>}
      {error && <p role="alert">{accessMessage(error)}</p>}
      {message && <p>{message}</p>}
      {!loading && needsAccount(error) && onAccount && (
        <button onClick={onAccount}>Sign in or manage account</button>
      )}
      {!loading && !models.length && !needsAccount(error) && (
        <button onClick={() => setRetry((v) => v + 1)}>
          Retry generation tools
        </button>
      )}
    </section>
  );
}
