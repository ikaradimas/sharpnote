import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Wrench } from 'lucide-react';
import {
  IconReset, IconConfig, IconPackages, IconLogs, IconDB,
  IconVars, IconToC, IconLibrary, IconFiles, IconApi,
  IconGraph, IconTodo, IconRegex, IconKafka, IconData, IconDeps, IconHistory, IconApiEditor, IconGit, IconEmbed,
} from './Icons.jsx';

export function ToolsMenu({
  onReset,
  logPanelOpen, onToggleLogs,
  nugetPanelOpen, onToggleNuget,
  configPanelOpen, onToggleConfig, configCount,
  dbPanelOpen, onToggleDb,
  varsPanelOpen, onToggleVars,
  tocPanelOpen, onToggleToC,
  libraryPanelOpen, onToggleLibrary,
  filesPanelOpen, onToggleFiles,
  gitPanelOpen, onToggleGit,
  apiPanelOpen, onToggleApi,
  apiEditorPanelOpen, onToggleApiEditor,
  graphPanelOpen, onToggleGraph,
  todoPanelOpen, onToggleTodo,
  regexPanelOpen, onToggleRegex,
  kafkaPanelOpen, onToggleKafka,
  depsPanelOpen, onToggleDeps,
  historyPanelOpen, onToggleHistory,
  embedPanelOpen, onToggleEmbed,
  onCloseAllPanels,
  onImportData,
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popupRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({});
  const popupPosRef = useRef({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reposition after every render so the menu tracks the button through layout shifts.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const top = r.bottom + 4;
    const right = window.innerWidth - r.right;
    if (top !== popupPosRef.current.top || right !== popupPosRef.current.right) {
      popupPosRef.current = { top, right };
      setPopupStyle({ top, right });
    }
  });

  const close = () => setOpen(false);

  const kernelItems = [
    { icon: <IconReset />, label: 'Reset Kernel', action: () => { onReset(); close(); } },
  ];
  const dataItems = [
    { icon: <IconData />, label: 'Import Data\u2026', action: () => { onImportData?.(); close(); } },
  ];
  const panelItems = [
    { icon: <IconConfig />,    label: configCount > 0 ? `Config (${configCount})` : 'Config',
      action: onToggleConfig, active: configPanelOpen },
    { icon: <IconPackages />,  label: 'Packages',  action: onToggleNuget,    active: nugetPanelOpen },
    { icon: <IconLogs />,      label: 'Logs',       action: onToggleLogs,     active: logPanelOpen },
    { icon: <IconDB />,        label: 'Database',   action: onToggleDb,       active: dbPanelOpen },
    { icon: <IconVars />,      label: 'Variables',  action: onToggleVars,     active: varsPanelOpen },
    { icon: <IconToC />,       label: 'Table of Contents', action: onToggleToC,      active: tocPanelOpen },
    { icon: <IconLibrary />,   label: 'Library',           action: onToggleLibrary,  active: libraryPanelOpen },
    { icon: <IconFiles />,     label: 'File Explorer',     action: onToggleFiles,    active: filesPanelOpen },
    { icon: <IconGit />,       label: 'Git',               action: onToggleGit,      active: gitPanelOpen },
    { icon: <IconApi />,       label: 'API Browser',       action: onToggleApi,      active: apiPanelOpen },
    { icon: <IconApiEditor />, label: 'API Editor',        action: onToggleApiEditor, active: apiEditorPanelOpen },
    { icon: <IconGraph />,     label: 'Graph',             action: onToggleGraph,    active: graphPanelOpen },
    { icon: <IconTodo />,      label: 'To Do',             action: onToggleTodo,     active: todoPanelOpen },
    { icon: <IconRegex />,     label: 'Regex',             action: onToggleRegex,    active: regexPanelOpen },
    { icon: <IconKafka />,     label: 'Kafka',             action: onToggleKafka,    active: kafkaPanelOpen },
    { icon: <IconDeps />,      label: 'Dependencies',      action: onToggleDeps,     active: depsPanelOpen },
    { icon: <IconHistory />,   label: 'History',            action: onToggleHistory,  active: historyPanelOpen },
    { icon: <IconEmbed />,    label: 'Embedded Files',     action: onToggleEmbed,    active: embedPanelOpen },
  ];

  const anyPanelActive = panelItems.some((p) => p.active);

  return (
    <div className="theme-picker-wrap">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Tools"
        className={`toolbar-icon-text-btn${open || anyPanelActive ? ' panel-active' : ''}`}
      >
        <Wrench size={13} />
        <span>Tools</span>
      </button>
      {open && createPortal(
        <div ref={popupRef} className="tools-menu-popup" style={popupStyle}>
          <div className="tools-menu-section-label">Kernel</div>
          {kernelItems.map(({ icon, label, action }) => (
            <button key={label} className="tools-menu-item" onClick={action}>
              <span className="tools-menu-icon">{icon}</span>
              <span className="tools-menu-label">{label}</span>
            </button>
          ))}
          <div className="tools-menu-separator" />
          <div className="tools-menu-section-label">Data</div>
          {dataItems.map(({ icon, label, action }) => (
            <button key={label} className="tools-menu-item" onClick={action}>
              <span className="tools-menu-icon">{icon}</span>
              <span className="tools-menu-label">{label}</span>
            </button>
          ))}
          <div className="tools-menu-separator" />
          <div className="tools-menu-section-label">Panels</div>
          {panelItems.map(({ icon, label, action, active }) => (
            <button key={label} className={`tools-menu-item${active ? ' tools-menu-item-active' : ''}`} onClick={action}>
              <span className="tools-menu-icon">{icon}</span>
              <span className="tools-menu-label">{label}</span>
              {active && <span className="tools-menu-active-dot" />}
            </button>
          ))}
          {anyPanelActive && onCloseAllPanels && <>
            <div className="tools-menu-separator" />
            <button className="tools-menu-item" onClick={() => { onCloseAllPanels(); close(); }}>
              <span className="tools-menu-label" style={{ paddingLeft: 2 }}>Close all panels</span>
            </button>
          </>}
        </div>,
        document.body
      )}
    </div>
  );
}
