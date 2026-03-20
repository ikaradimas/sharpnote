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
    default:        return null;
  }
}
