import type { DesktopAPI } from '../electron/agent/types';
declare global { interface Window { heisAgent?: DesktopAPI } }
