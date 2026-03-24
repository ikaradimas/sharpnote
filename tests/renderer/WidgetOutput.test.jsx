import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WidgetOutput } from '../../src/components/output/WidgetOutput.jsx';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSlider(overrides = {}) {
  return { widgetType: 'slider', widgetKey: 'nb1_w0', label: 'Speed', value: 5, min: 0, max: 10, step: 1, ...overrides };
}

function makeDatePicker(overrides = {}) {
  return { widgetType: 'datepicker', widgetKey: 'nb1_w0', label: 'Report Date', value: '2025-01-15', ...overrides };
}

function makeDropdown(overrides = {}) {
  return { widgetType: 'dropdown', widgetKey: 'nb1_w0', label: 'Unit', value: 'Celsius', options: ['Celsius', 'Fahrenheit', 'Kelvin'], ...overrides };
}

// ── Slider ─────────────────────────────────────────────────────────────────────

describe('WidgetOutput — slider', () => {
  it('renders range input with correct min/max/step/value', () => {
    render(<WidgetOutput spec={makeSlider()} notebookId="nb1" />);
    const input = document.querySelector('input[type="range"]');
    expect(input).toBeInTheDocument();
    expect(input.min).toBe('0');
    expect(input.max).toBe('10');
    expect(input.step).toBe('1');
    expect(input.value).toBe('5');
  });

  it('renders label text', () => {
    render(<WidgetOutput spec={makeSlider()} notebookId="nb1" />);
    expect(screen.getByText('Speed')).toBeInTheDocument();
  });

  it('shows current value', () => {
    render(<WidgetOutput spec={makeSlider({ value: 7 })} notebookId="nb1" />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('sends widget_change IPC on mouseUp', () => {
    render(<WidgetOutput spec={makeSlider()} notebookId="nb1" />);
    const input = document.querySelector('input[type="range"]');
    fireEvent.mouseUp(input);
    expect(window.electronAPI.sendToKernel).toHaveBeenCalledWith('nb1', {
      type: 'widget_change',
      widgetKey: 'nb1_w0',
      value: 5,
    });
  });

  it('sends widget_change IPC on keyUp', () => {
    render(<WidgetOutput spec={makeSlider()} notebookId="nb1" />);
    const input = document.querySelector('input[type="range"]');
    fireEvent.keyUp(input);
    expect(window.electronAPI.sendToKernel).toHaveBeenCalledWith('nb1', {
      type: 'widget_change',
      widgetKey: 'nb1_w0',
      value: 5,
    });
  });

  it('shows range bounds', () => {
    render(<WidgetOutput spec={makeSlider({ min: 0, max: 100 })} notebookId="nb1" />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});

// ── DatePicker ─────────────────────────────────────────────────────────────────

describe('WidgetOutput — datepicker', () => {
  it('renders date input with correct initial value', () => {
    render(<WidgetOutput spec={makeDatePicker()} notebookId="nb1" />);
    const input = document.querySelector('input[type="date"]');
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('2025-01-15');
  });

  it('renders label text', () => {
    render(<WidgetOutput spec={makeDatePicker()} notebookId="nb1" />);
    expect(screen.getByText('Report Date')).toBeInTheDocument();
  });

  it('sends widget_change IPC on date change', () => {
    render(<WidgetOutput spec={makeDatePicker()} notebookId="nb1" />);
    fireEvent.change(document.querySelector('input[type="date"]'), {
      target: { value: '2025-06-01' },
    });
    expect(window.electronAPI.sendToKernel).toHaveBeenCalledWith('nb1', {
      type: 'widget_change',
      widgetKey: 'nb1_w0',
      value: '2025-06-01',
    });
  });
});

// ── Dropdown ───────────────────────────────────────────────────────────────────

describe('WidgetOutput — dropdown', () => {
  it('renders select with all options', () => {
    render(<WidgetOutput spec={makeDropdown()} notebookId="nb1" />);
    const select = document.querySelector('select');
    expect(select).toBeInTheDocument();
    const opts = Array.from(select.options).map((o) => o.value);
    expect(opts).toEqual(['Celsius', 'Fahrenheit', 'Kelvin']);
  });

  it('shows selected value', () => {
    render(<WidgetOutput spec={makeDropdown({ value: 'Fahrenheit' })} notebookId="nb1" />);
    expect(document.querySelector('select').value).toBe('Fahrenheit');
  });

  it('renders label text', () => {
    render(<WidgetOutput spec={makeDropdown()} notebookId="nb1" />);
    expect(screen.getByText('Unit')).toBeInTheDocument();
  });

  it('sends widget_change IPC on selection change', () => {
    render(<WidgetOutput spec={makeDropdown()} notebookId="nb1" />);
    fireEvent.change(document.querySelector('select'), {
      target: { value: 'Kelvin' },
    });
    expect(window.electronAPI.sendToKernel).toHaveBeenCalledWith('nb1', {
      type: 'widget_change',
      widgetKey: 'nb1_w0',
      value: 'Kelvin',
    });
  });
});

// ── Value sync ─────────────────────────────────────────────────────────────────

describe('WidgetOutput — value sync', () => {
  it('updates displayed value when spec.value prop changes', () => {
    const { rerender } = render(
      <WidgetOutput spec={makeDatePicker({ value: '2025-01-01' })} notebookId="nb1" />
    );
    expect(document.querySelector('input[type="date"]').value).toBe('2025-01-01');
    rerender(<WidgetOutput spec={makeDatePicker({ value: '2025-12-31' })} notebookId="nb1" />);
    expect(document.querySelector('input[type="date"]').value).toBe('2025-12-31');
  });

  it('returns null for unknown widget type', () => {
    const { container } = render(
      <WidgetOutput
        spec={{ widgetType: 'unknown', widgetKey: 'k', label: 'L', value: '' }}
        notebookId="nb1"
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
