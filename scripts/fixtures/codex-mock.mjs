#!/usr/bin/env node
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const notify = (method, params) => emit({ method, params });
let provider = "provider-test";
let turnId = "turn-1";
let prompt = "";
let signedIn = process.env.HEIS_TEST_SIGNED_OUT !== "1";
const finish = () => {
  notify("item/agentMessage/delta", {
    threadId: provider,
    itemId: "assistant-" + turnId,
    delta: "Hello from ",
  });
  setTimeout(() => {
    notify("item/agentMessage/delta", {
      threadId: provider,
      itemId: "assistant-" + turnId,
      delta: "Codex.",
    });
    notify("item/completed", {
      threadId: provider,
      item: {
        id: "assistant-" + turnId,
        type: "agentMessage",
        text: "Hello from Codex.",
      },
    });
    notify("turn/completed", {
      threadId: provider,
      turn: { id: turnId, status: "completed", items: [] },
    });
  }, 80);
};
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (process.env.HEIS_TEST_LOG)
    appendFileSync(process.env.HEIS_TEST_LOG, JSON.stringify(m) + "\n");
  if (!m.method) {
    if (m.id === "approval-1") {
      if (prompt === "approval-input" && m.result?.decision === "accept")
        emit({
          id: "question-1",
          method: "item/tool/requestUserInput",
          params: {
            threadId: provider,
            turnId,
            itemId: "question",
            questions: [
              {
                id: "color",
                question: "Which color?",
                options: [{ label: "Blue", description: "Use blue" }],
              },
            ],
          },
        });
      else finish();
    } else if (m.id === "question-1") finish();
    return;
  }
  const response = (result) => emit({ id: m.id, result });
  switch (m.method) {
    case "initialize":
      response({ userAgent: "mock/1.0" });
      break;
    case "initialized":
      break;
    case "account/read":
      response({
        account: signedIn
          ? { type: "chatgpt", email: "test@example.com", planType: "pro" }
          : null,
        requiresOpenaiAuth: true,
      });
      break;
    case "model/list":
      response({
        data: [
          { model: "test-model", displayName: "Test model", isDefault: true },
        ],
      });
      break;
    case "account/login/start":
      response({
        type: "chatgpt",
        loginId: "login-test",
        authUrl: "https://auth.openai.com/authorize?test=1",
      });
      break;
    case "account/login/cancel":
      response({});
      notify("account/login/completed", {
        success: false,
        error: "Sign-in cancelled.",
      });
      break;
    case "thread/start":
      provider = "provider-" + Date.now();
      response({
        thread: { id: provider },
        model: "test-model",
        cwd: m.params.cwd,
      });
      break;
    case "thread/resume":
      provider = m.params.threadId;
      response({ thread: { id: provider }, model: "test-model" });
      break;
    case "turn/start": {
      prompt = m.params.input[0].text;
      turnId = "turn-" + Date.now();
      notify("turn/started", { threadId: provider, turn: { id: turnId } });
      response({ turn: { id: turnId, status: "inProgress" } });
      if (prompt === "crash") {
        setTimeout(() => process.exit(1), 30);
        break;
      }
      if (prompt === "design-tool") {
        void (async()=>{
          const call=async(name,args={})=>{const r=await fetch(process.env.HEIS_MCP_BRIDGE_URL+'/tools/'+name,{method:'POST',headers:{Authorization:'Bearer '+process.env.HEIS_MCP_BRIDGE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(args)});const body=await r.json();if(!r.ok)throw new Error(body.error);return body;};
          const info=await call('heis_design_info');
          let blocked=false;try{await call('heis_edit',{projectId:info.session.projectId});}catch{blocked=true;}
          if(!blocked)throw new Error('Design unexpectedly allowed timeline edits');
          await call('heis_design_generate',{revision:info.session.revision,action:'edit',sourceAssetId:info.session.referenceAssetIds[0],prompt:'Make a second orange variation'});
          finish();
        })().catch(error=>{notify('item/completed',{threadId:provider,item:{id:'error-'+turnId,type:'agentMessage',text:String(error)}});notify('turn/completed',{threadId:provider,turn:{id:turnId,status:'failed',items:[]}});});
        break;
      }
      if (prompt === "hold") break;
      if (prompt.startsWith("approval")) {
        notify("item/started", {
          threadId: provider,
          item: {
            id: "cmd-1",
            type: "commandExecution",
            command: "echo hello",
            status: "inProgress",
          },
        });
        emit({
          id: "approval-1",
          method:
            prompt === "approval-file"
              ? "item/fileChange/requestApproval"
              : "item/commandExecution/requestApproval",
          params: {
            threadId: provider,
            turnId,
            itemId: "cmd-1",
            reason: "Test permission",
            command: "echo hello",
            cwd: m.params.cwd,
          },
        });
      } else finish();
      break;
    }
    case "turn/interrupt":
      response({});
      notify("turn/completed", {
        threadId: provider,
        turn: { id: turnId, status: "interrupted", items: [] },
      });
      break;
    default:
      if (m.id !== undefined)
        emit({ id: m.id, error: { code: -32601, message: "Unknown method" } });
  }
});
