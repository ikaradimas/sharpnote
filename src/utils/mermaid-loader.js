// Lazily load mermaid — the single largest renderer dependency — so it stays out of the
// startup bundle and is only pulled in (and initialised once) the first time a diagram is
// actually rendered. Shared by MarkdownCell, MarkdownOutput, and the API-editor
// ModelDiagram so they all use the same initialised singleton.
let mermaidPromise = null;

export function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const mermaid = m.default;
      mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
      return mermaid;
    });
  }
  return mermaidPromise;
}
