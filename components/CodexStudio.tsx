
'use client';
import { useState } from 'react';
import { App } from './agent/App';
import './agent/styles.css';
export default function CodexStudio({ sidebarTarget, projectDirectory, design, workflow, compact = false }: { sidebarTarget?: HTMLElement | null; projectDirectory?: string; design?: {projectId:string;sessionId:string}; workflow?:{projectId:string;workflowId:string}; compact?: boolean }) {
 const [key,setKey]=useState('');const [message,setMessage]=useState('');
 return <div className="flex h-full min-h-0 flex-col">
 <details className="border-b border-white/10 px-4 py-2 text-xs text-white/50"><summary className="cursor-pointer">Optional OpenAI API key</summary>
 <form className="flex gap-2 py-2" onSubmit={async e=>{e.preventDefault();try {const result=await window.heis.secrets.set('openaiApiKey',key);if(!result.ok)throw new Error(result.error.message);setKey('');await window.heisAgent.refreshCodex();setMessage('Key saved securely.');}catch(e){setMessage(String(e));}}}>
 <input aria-label="OpenAI API key" type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder="Use your existing Codex login, or enter a key" className="flex-1 rounded bg-white/5 p-2"/>
 <button disabled={!key.trim()} className="rounded border border-white/20 px-3">Save key</button></form>{message&&<p role="status">{message}</p>}</details>
 <div className="heis-agent-root flex-1"><App sidebarTarget={sidebarTarget} projectDirectory={projectDirectory} design={design} workflow={workflow} compact={compact} /></div></div>;
}
