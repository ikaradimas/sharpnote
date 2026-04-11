import React, { useState } from 'react';
import { DOCS_TAB_ID, CHANGELOG_TAB_ID, KAFKA_TAB_ID } from '../../constants.js';
import { isLibEditorId, getNotebookDisplayName } from '../../utils.js';
import { Tab } from './Tab.jsx';
import { TabSection } from './TabSection.jsx';

export function TabBar({ notebooks, activeId, onActivate, onClose, onNew, onRename,
                  onReorder, onSetColor, activeTabColor,
                  docsOpen, onActivateDocs, onCloseDocs,
                  changelogOpen, onActivateChangelog, onCloseChangelog,
                  kafkaTabOpen, onActivateKafka, onCloseKafka,
                  libEditors, onCloseLibEditor,
                  pinnedPaths, onTogglePin }) {
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const handleDragStart = (id) => setDragId(id);
  const handleDragOver = (id) => { if (id !== dragId) setDragOverId(id); };
  const handleDrop = (targetId) => {
    if (dragId && dragId !== targetId) onReorder(dragId, targetId);
    setDragId(null); setDragOverId(null);
  };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  const pinnedNbs  = notebooks.filter((nb) => nb.path && pinnedPaths?.has(nb.path));
  const regularNbs = notebooks.filter((nb) => !nb.path || !pinnedPaths?.has(nb.path));

  const renderItem = (item) => {
    if (item.id === DOCS_TAB_ID) return (
      <div
        className={`tab${activeId === DOCS_TAB_ID ? ' tab-active' : ''}`}
        onClick={onActivateDocs}
      >
        <span className="tab-title">Documentation</span>
        <button className="tab-close" onClick={(e) => { e.stopPropagation(); onCloseDocs(); }} title="Close">×</button>
      </div>
    );
    if (item.id === CHANGELOG_TAB_ID) return (
      <div
        className={`tab${activeId === CHANGELOG_TAB_ID ? ' tab-active' : ''}`}
        onClick={onActivateChangelog}
      >
        <span className="tab-title">Changelog</span>
        <button className="tab-close" onClick={(e) => { e.stopPropagation(); onCloseChangelog(); }} title="Close">x</button>
      </div>
    );
    if (item.id === KAFKA_TAB_ID) return (
      <div
        className={`tab${activeId === KAFKA_TAB_ID ? ' tab-active' : ''}`}
        onClick={onActivateKafka}
      >
        <span className="tab-title">Kafka</span>
        <button className="tab-close" onClick={(e) => { e.stopPropagation(); onCloseKafka(); }} title="Close">×</button>
      </div>
    );
    if (isLibEditorId(item.id)) return (
      <Tab
        notebook={{ id: item.id, title: item.filename, isDirty: item.isDirty, path: item.fullPath }}
        isActive={activeId === item.id}
        isDragOver={false}
        onActivate={() => onActivate(item.id)}
        onClose={() => onCloseLibEditor(item.id)}
        draggable={false}
        onDragStart={() => {}} onDragOver={() => {}} onDrop={() => {}} onDragEnd={() => {}}
      />
    );
    return (
      <Tab
        notebook={item}
        isActive={item.id === activeId}
        isDragOver={dragOverId === item.id}
        onActivate={() => onActivate(item.id)}
        onClose={() => onClose(item.id)}
        onRename={(newName) => onRename(item.id, newName)}
        onSetColor={(color) => onSetColor(item.id, color)}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        isPinned={item.path ? pinnedPaths?.has(item.path) : false}
        onTogglePin={item.path ? () => onTogglePin?.(item.path) : undefined}
      />
    );
  };

  const pinnedItems = pinnedNbs.map(nb => ({
    ...nb,
    _label: getNotebookDisplayName(nb.path, nb.title),
    _onActivate: () => onActivate(nb.id),
  }));

  const regularItems = [
    ...regularNbs.map(nb => ({
      ...nb,
      _label: getNotebookDisplayName(nb.path, nb.title),
      _onActivate: () => onActivate(nb.id),
    })),
    ...(libEditors || []).map(e => ({
      ...e,
      isDirty: e.isDirty,
      _label: e.filename,
      _onActivate: () => onActivate(e.id),
    })),
    ...(docsOpen      ? [{ id: DOCS_TAB_ID,      isDirty: false, _label: 'Documentation', _onActivate: onActivateDocs      }] : []),
    ...(changelogOpen ? [{ id: CHANGELOG_TAB_ID, isDirty: false, _label: 'Changelog',     _onActivate: onActivateChangelog }] : []),
    ...(kafkaTabOpen  ? [{ id: KAFKA_TAB_ID,     isDirty: false, _label: 'Kafka',         _onActivate: onActivateKafka    }] : []),
  ];

  return (
    <div className="tab-bar" style={activeTabColor ? { borderBottomColor: activeTabColor } : undefined}>
      {pinnedItems.length > 0 && (
        <TabSection
          items={pinnedItems}
          className="tab-section-pinned"
          activeId={activeId}
          renderItem={renderItem}
          onMoveToFront={onReorder}
          maxFraction={0.4}
        />
      )}
      {pinnedItems.length > 0 && regularItems.length > 0 && (
        <div className="tab-bar-pin-spacer" />
      )}
      <TabSection
        items={regularItems}
        className="tab-section-regular"
        activeId={activeId}
        renderItem={renderItem}
        onMoveToFront={onReorder}
      />
      <button className="tab-new" onClick={onNew} title="New notebook">+</button>
    </div>
  );
}
