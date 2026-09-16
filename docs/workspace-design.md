# Workspace design

Heis uses Sai and T3 Code as its desktop visual foundation, with the public landing page's warm palette as an accent. The shared stylesheet is `components/workspace-theme.css`; it is scoped to `.heis-workspace` so the public landing page keeps its own design.

- Locally bundled DM Sans variable font, 13 px interface text, 12 px navigation and controls.
- A 1280 by 820 default window matching Sai, with a 1024 by 640 minimum for the media controls. A 248 px sidebar, 48 px window toolbar, 32 to 34 px compact controls, 6 to 10 px control and panel corners.
- Charcoal surfaces, fine neutral borders, warm white text, and restrained orange selections and primary actions. Light mode uses cream surfaces and a darker orange for contrast.
- One persistent main sidebar. Agent projects, threads, search, and connection controls render into that sidebar through a portal, preserving the existing conversation state and interactions.
- Shared compact studio empty-state mark and prompt composer styling. Media previews and domain-specific controls retain their functional layouts.
- No promotional banner, decorative stock-card stack, neon glow, or gradient navigation treatment.
- Theme preference persists as `heis.workspace.theme`. Reduced-motion preferences and visible keyboard focus are supported. macOS toolbar spacing reserves room for native window controls.

Legacy studio utility colors are mapped to the shared tokens in this stylesheet. New controls should use semantic tokens and named component classes instead of introducing new hardcoded colors. Media imagery must not be recolored or filtered by theme styles.

Validation: native Electron checks cover all ten active studios in both themes, a 1024 by 640 window, model selection menus, settings, and Codex approvals, questions, conversation persistence, and interruption. Screenshots are generated under `test-results/theme`. The shared Next.js application build also passes.
