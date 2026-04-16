import React from 'react';
import { LogPanel } from '../panels/log/LogPanel.jsx';
import { NugetPanel } from '../panels/nuget/NugetPanel.jsx';
import { ConfigPanel } from '../panels/ConfigPanel.jsx';
import { DbPanel } from '../panels/db/DbPanel.jsx';
import { VarsPanel } from '../panels/VarsPanel.jsx';
import { TocPanel } from '../panels/TocPanel.jsx';
import { LibraryPanel } from '../panels/library/LibraryPanel.jsx';
import { FilesPanel } from '../panels/FilesPanel.jsx';
import { ApiPanel } from '../panels/ApiPanel.jsx';
import { GraphPanel } from '../panels/GraphPanel.jsx';
import { TodoPanel } from '../panels/TodoPanel.jsx';
import { RegexPanel } from '../panels/RegexPanel.jsx';
import { HistoryPanel } from '../panels/HistoryPanel.jsx';
import { DependencyPanel } from '../panels/DependencyPanel.jsx';
import { ApiEditorPanel } from '../panels/ApiEditorPanel.jsx';
import { GitPanel } from '../panels/GitPanel.jsx';
import { EmbedPanel } from '../panels/EmbedPanel.jsx';

export function renderPanelContent(panelId, p) {
  if (!p) return null;
  switch (panelId) {
    case 'log':     return <LogPanel {...p} />;
    case 'nuget':   return <NugetPanel {...p} />;
    case 'config':  return <ConfigPanel {...p} />;
    case 'db':      return <DbPanel {...p} />;
    case 'vars':    return <VarsPanel {...p} />;
    case 'toc':     return <TocPanel {...p} />;
    case 'library': return <LibraryPanel {...p} />;
    case 'files':   return <FilesPanel {...p} />;
    case 'api':     return <ApiPanel {...p} />;
    case 'api-editor': return <ApiEditorPanel {...p} />;
    case 'git': return <GitPanel {...p} />;
    case 'graph':   return <GraphPanel {...p} />;
    case 'todo':    return <TodoPanel {...p} />;
    case 'regex':   return <RegexPanel {...p} />;
    case 'history': return <HistoryPanel {...p} />;
    case 'deps':    return <DependencyPanel {...p} />;
    case 'embed':   return <EmbedPanel {...p} />;
    default:        return null;
  }
}
