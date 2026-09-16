import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  Folder,
  FolderOpen,
  MessageSquare,
  PanelLeft,
  Plus,
  Search,
  Sparkles,
  Sun,
  Moon,
  X,
  Square,
  Settings2,
} from "lucide-react";
import type { Snapshot } from "../../electron/agent/types";
import { ApprovalCard } from "./ApprovalCard";
const basename = (value: string) =>
  value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
const initial: Snapshot = {
  revision: -1,
  projects: [],
  threads: [],
  models: [],
  codex: { state: "connecting", message: "Connecting to Codex..." },
};
const api = typeof window === "undefined" ? undefined : window.heisAgent;
export function App() {
  const [workspace, setWorkspace] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [model, setModel] = useState("");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [light, setLight] = useState(false);
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const active = workspace.threads.find((t) => t.id === activeId);
  const draftKey = activeId ?? "new";
  const draft = drafts[draftKey] ?? active?.draft ?? "";
  const setDraft = (value: string) =>
    setDrafts((state) => ({ ...state, [draftKey]: value }));
  const running = workspace.threads.find((t) =>
    ["starting", "running", "waiting"].includes(t.status),
  );
  const currentProject = active?.providerId ? active.project : project;
  const visibleThreads = workspace.threads.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase()),
  );
  const connected = workspace.codex.state === "ready";
  useEffect(() => {
    if (!api) {
      setNotice(
        "Open Heis desktop to connect to Codex. This browser preview does not run agents.",
      );
      return;
    }
    const apply = (snapshot: Snapshot) =>
      setWorkspace((previous) =>
        snapshot.revision >= previous.revision ? snapshot : previous,
      );
    const unsubscribe = api.onSnapshot(apply);
    void (async () => {
      try {
        let legacy: unknown;
        try {
          legacy = JSON.parse(localStorage.getItem("heis.agent.drafts") ?? "null");
        } catch {
          /* No valid legacy drafts. */
        }
        await api.importDrafts(legacy);
        apply(await api.snapshot());
        await api.refreshCodex();
      } catch (error) {
        setNotice(String(error));
      }
    })();
    return unsubscribe;
  }, []);
  useEffect(() => {
    const el = feed.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240)
      el.scrollTop = el.scrollHeight;
  }, [workspace.revision]);
  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [activeId]);
  function newThread() {
    setActiveId(null);
    input.current?.focus();
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setActiveId(null);
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  async function action(fn: () => Promise<unknown>) {
    try {
      await fn();
      setNotice("");
    } catch (error) {
      setNotice(String(error));
    }
  }
  async function openProject() {
    if (!api) {
      setNotice("Use the desktop app to choose a folder.");
      return;
    }
    await action(async () => {
      const folder = await api.chooseDirectory();
      if (folder) {
        setProject(folder);
        if (active?.providerId) setActiveId(null);
      }
    });
  }
  async function send() {
    if (!api || submitting || running || !draft.trim()) return;
    if (!currentProject) {
      setNotice("Choose a project folder first.");
      return;
    }
    if (!connected) {
      setSettings(true);
      return;
    }
    const message = draft;
    setSubmitting(true);
    try {
      const id = await api.send({
        threadId: active?.id,
        project: currentProject,
        text: message,
        ...(model ? { model } : {}),
      });
      setDrafts((state) => ({ ...state, [draftKey]: "", [id]: "" }));
      setActiveId(id);
      setNotice("");
    } catch (error) {
      setNotice(String(error));
    } finally {
      setSubmitting(false);
    }
  }
  // Show a newly created thread while turn/start is still awaiting its response.
  useEffect(() => {
    if (submitting && running) setActiveId(running.id);
  }, [submitting, running?.id]);
  const composer = (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <textarea
        ref={input}
        aria-label="Message Codex"
        placeholder={
          active
            ? "Continue the conversation..."
            : "Describe what you want to work on..."
        }
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <div className="composer-footer">
        <button
          type="button"
          className="project-picker"
          onClick={() => void openProject()}
          title={currentProject ?? "Choose a project"}
        >
          <Folder size={14} />
          <span>
            {currentProject ? basename(currentProject) : "Choose project"}
          </span>
          <ChevronDown size={12} />
        </button>
        <select
          aria-label="Codex model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={!!running}
        >
          <option value="">{active?.model || "Codex default"}</option>
          {workspace.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {running?.id === activeId ? (
          <button
            type="button"
            className="send stop"
            aria-label="Stop Codex"
            onClick={() => void action(() => api!.stop(running.id))}
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            className="send"
            type="submit"
            aria-label="Send to Codex"
            disabled={!draft.trim() || !!running || submitting || !api}
          >
            <ArrowUp size={17} />
          </button>
        )}
      </div>
    </form>
  );
  return (
    <div
      className={`app ${light ? "light" : ""} `}
    >
      {sidebar && (
        <aside className="sidebar">
          <div className="sidebar-chrome drag-region" />
          <div className="brand">
            <span className="brand-icon">s</span>
            <strong>heis</strong>
            <span className="alpha">CODEX</span>
          </div>
          <nav aria-label="Workspace">
            <button className="nav-item primary-nav" onClick={newThread}>
              <Plus size={16} />
              New thread<kbd>{api?.platform === "darwin" ? "⌘" : "Ctrl"} N</kbd>
            </button>
            <button
              className="nav-item"
              onClick={() => setSearching(!searching)}
            >
              <Search size={16} />
              Search threads
            </button>
          </nav>
          {searching && (
            <input
              className="search"
              aria-label="Search threads"
              placeholder="Search threads..."
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <div className="section-label">
            <span>PROJECTS</span>
            <button aria-label="Add project" onClick={() => void openProject()}>
              <Plus size={14} />
            </button>
          </div>
          <div className="project-list">
            {workspace.projects.length ? (
              workspace.projects.map((p) => (
                <button
                  title={p}
                  key={p}
                  className={`nav-item ${currentProject === p ? "selected" : ""}`}
                  onClick={() => {
                    setProject(p);
                    setActiveId(null);
                  }}
                >
                  <Folder size={15} />
                  <span className="truncate">{basename(p)}</span>
                </button>
              ))
            ) : (
              <button
                className="nav-item muted"
                onClick={() => void openProject()}
              >
                <FolderOpen size={15} />
                Open your first project
              </button>
            )}
          </div>
          <div className="section-label threads-label">
            THREADS<span>{workspace.threads.length || ""}</span>
          </div>
          <div className="thread-list">
            {visibleThreads.length ? (
              visibleThreads.map((t) => (
                <button
                  key={t.id}
                  className={`nav-item ${activeId === t.id ? "selected" : ""}`}
                  onClick={() => {
                    setActiveId(t.id);
                    setProject(t.project);
                  }}
                >
                  <MessageSquare size={14} />
                  <span className="truncate">{t.title}</span>
                  {t.status === "waiting" ? (
                    <span
                      className="activity-dot waiting"
                      title="Needs your input"
                    />
                  ) : ["running", "starting"].includes(t.status) ? (
                    <span className="activity-dot" title="Working" />
                  ) : null}
                </button>
              ))
            ) : (
              <p className="sidebar-empty">
                {search ? "No matching threads" : "Your ideas start here."}
              </p>
            )}
          </div>
          <button className="nav-item" onClick={() => setSettings(!settings)}>
            <Settings2 size={15} />
            Connection settings
          </button>
          <div className="sidebar-footer">
            <span>
              <i className={connected ? "" : "offline"} />
              {connected ? "Codex connected" : "Codex offline"}
            </span>
            <button
              onClick={() => setLight(!light)}
              aria-label={light ? "Use dark theme" : "Use light theme"}
            >
              {light ? <Moon size={15} /> : <Sun size={15} />}
            </button>
          </div>
        </aside>
      )}
      <main>
        <header className="topbar drag-region">
          <button
            aria-label="Toggle sidebar"
            onClick={() => setSidebar(!sidebar)}
          >
            <PanelLeft size={16} />
          </button>
          <span className="breadcrumb">
            {currentProject ? basename(currentProject) : "Workspace"}
          </span>
          <span className="divider">/</span>
          <span className="truncate">{active?.title ?? "New thread"}</span>
          <button className="version" onClick={() => setSettings(!settings)}>
            Codex <span>0.2</span>
          </button>
        </header>
        {notice && (
          <div className="notice" role="alert">
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {(settings || (api && workspace.codex.state !== "ready")) && (
          <section className="connection-panel" aria-label="Codex connection">
            <div>
              <strong>{workspace.codex.message}</strong>
              {workspace.codex.account && <p>{workspace.codex.account}</p>}
              {settings && workspace.codex.binary && (
                <code>{workspace.codex.binary}</code>
              )}
            </div>
            <div className="connection-actions">
              {workspace.codex.state === "signed-out" &&
                !workspace.codex.loginPending && (
                  <button
                    className="secondary-button"
                    onClick={() => void action(() => api!.login())}
                  >
                    Sign in with ChatGPT
                  </button>
                )}
              {workspace.codex.loginPending && (
                <button
                  className="secondary-button"
                  onClick={() => void action(() => api!.cancelLogin())}
                >
                  Cancel sign-in
                </button>
              )}
              <button
                className="secondary-button"
                disabled={workspace.codex.state === "connecting" || !api}
                onClick={() => void action(() => api!.refreshCodex())}
              >
                Reconnect
              </button>
              {settings && (
                <button
                  className="secondary-button"
                  disabled={!!running || !api}
                  onClick={() => void action(() => api!.chooseCodex())}
                >
                  Choose Codex executable
                </button>
              )}
            </div>
          </section>
        )}
        {active ? (
          <>
            <div className="conversation" ref={feed}>
              <section className="conversation-inner">
                <h1>{active.title}</h1>
                {active.items.map((item) => (
                  <article key={item.id} className={`chat-item ${item.role}`}>
                    {item.role === "tool" ? (
                      <details>
                        <summary>
                          {item.title || "Command output"}{" "}
                          <span>{item.state}</span>
                        </summary>
                        <pre>{item.text}</pre>
                      </details>
                    ) : (
                      <>
                        <div className="message-author">
                          {item.role === "user"
                            ? "You"
                            : item.role === "assistant"
                              ? "Codex"
                              : "Status"}
                        </div>
                        <div className="message-text">{item.text || "..."}</div>
                      </>
                    )}
                  </article>
                ))}
                {!active.items.length && (
                  <p className="draft-info">
                    {active.draft
                      ? "Your saved draft is ready to send. Choose a project to start."
                      : "Starting your conversation..."}
                  </p>
                )}
                {active.error && (
                  <div className="turn-error" role="alert">
                    {active.error}
                  </div>
                )}
                {active.requests.map((request) => (
                  <ApprovalCard
                    key={request.id}
                    request={request}
                    threadId={active.id}
                    answer={(value) => api!.answer(value)}
                  />
                ))}
                {running?.id === active.id && (
                  <div className="working-status" role="status">
                    {active.status === "waiting"
                      ? "Waiting for your response"
                      : active.status === "starting"
                        ? "Starting Codex..."
                        : "Codex is working..."}
                  </div>
                )}
              </section>
            </div>
            <div className="conversation-composer">
              {composer}
              <p className="composer-hint">
                {running && running.id !== active.id
                  ? "Another thread is running. Select it to view progress or stop."
                  : "Codex can edit this project. Permission requests appear above. Cmd/Ctrl+Enter to send."}
              </p>
            </div>
          </>
        ) : (
          <div className="content">
            <section className="welcome">
              <div className="welcome-mark">
                <Sparkles size={27} strokeWidth={1.4} />
              </div>
              <div className="eyebrow">
                A LITTLE SPACE FOR YOUR NEXT BIG IDEA
              </div>
              <h1>What would you like to build?</h1>
              <p className="subtitle">
                Your project. Your Codex. One workspace.
              </p>
              {composer}
              <div className="quick-actions">
                <button
                  onClick={() => {
                    setDraft("Build a new app that ");
                    input.current?.focus();
                  }}
                >
                  <Plus size={14} />
                  Build something new
                </button>
                <button onClick={() => void openProject()}>
                  <FolderOpen size={14} />
                  Open a project
                </button>
              </div>
              <p className="local-note">
                Connected through your local Codex CLI.
                <br />
                <span>
                  Conversations are saved on this device. Prompts are sent
                  through your Codex account.
                </span>
              </p>
            </section>
          </div>
        )}
        <footer className="statusbar">
          <span>
            <i className={connected ? "" : "offline"} />
            {running
              ? "Codex active"
              : connected
                ? "Codex ready"
                : "Not connected"}
          </span>
          <span>
            {currentProject ? basename(currentProject) : "No project selected"}
            <span className="status-separator">·</span>Workspace access
          </span>
        </footer>
      </main>
    </div>
  );
}
