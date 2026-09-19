
'use client';
import { App } from './agent/App';
import './agent/styles.css';
export default function CodexStudio({ sidebarTarget, projectDirectory, design, workflow, compact = false }: { sidebarTarget?: HTMLElement | null; projectDirectory?: string; design?: {projectId:string;sessionId:string}; workflow?:{projectId:string;workflowId:string}; compact?: boolean }) {
 return <div className="flex h-full min-h-0 flex-col">
 <div className="heis-agent-root flex-1"><App sidebarTarget={sidebarTarget} projectDirectory={projectDirectory} design={design} workflow={workflow} compact={compact} /></div></div>;
}
