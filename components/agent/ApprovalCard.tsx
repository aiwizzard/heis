import { useState } from "react";
import type { PendingRequest, RequestAnswer } from "../../electron/agent/types";
export function ApprovalCard({
  request,
  threadId,
  answer,
}: {
  request: PendingRequest;
  threadId: string;
  answer: (value: RequestAnswer) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  async function submit(value: Partial<RequestAnswer>) {
    setSending(true);
    setError("");
    try {
      await answer({ threadId, requestId: request.id, ...value });
    } catch (error) {
      setError(String(error));
      setSending(false);
    }
  }
  return (
    <section className="approval-card" aria-label={request.title}>
      <h3>{request.title}</h3>
      {request.detail && <pre>{request.detail}</pre>}
      {request.kind === "input" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit({ answers: values });
          }}
        >
          {request.questions?.map((q) => (
            <fieldset key={q.id} className="question">
              <legend>{q.question}</legend>
              {q.options && (
                <div className="answer-options">
                  {q.options.map((o) => (
                    <button
                      type="button"
                      key={o.label}
                      title={o.description}
                      onClick={() => setValues({ ...values, [q.id]: o.label })}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              <input
                aria-label={q.question}
                type={q.isSecret ? "password" : "text"}
                required
                value={values[q.id] ?? ""}
                onChange={(e) =>
                  setValues({ ...values, [q.id]: e.target.value })
                }
              />
            </fieldset>
          ))}
          <button className="secondary-button approve" disabled={sending}>
            Send answers
          </button>
        </form>
      ) : (
        <div className="approval-buttons">
          {request.canAccept && (
            <button
              className="secondary-button approve"
              disabled={sending}
              onClick={() => void submit({ decision: "accept" })}
            >
              Allow once
            </button>
          )}
          <button
            className="secondary-button"
            disabled={sending}
            onClick={() => void submit({ decision: "decline" })}
          >
            Decline
          </button>
          <button
            className="secondary-button"
            disabled={sending}
            onClick={() => void submit({ decision: "cancel" })}
          >
            Cancel request
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
