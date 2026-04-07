import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FormOutput } from '../../src/components/output/FormOutput.jsx';

// ── Helpers ────────────────────────────────────────────────────────────────────

const defaultProps = {
  spec: {
    formKey: 'nb1_f0',
    title: 'Test Form',
    targetCell: 'Process Results',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Enter name' },
      { key: 'age', label: 'Age', type: 'number', min: 0, max: 120, step: 1, defaultValue: 25 },
      { key: 'agree', label: 'I Agree', type: 'checkbox', defaultValue: false },
      { key: 'color', label: 'Colour', type: 'select', options: ['Red', 'Green', 'Blue'], defaultValue: 'Red' },
      { key: 'bio', label: 'Biography', type: 'textarea', placeholder: 'Tell us about yourself' },
      { key: 'dob', label: 'Date of Birth', type: 'date' },
    ],
  },
  notebookId: 'nb1',
  allCells: [],
  onRunCellByName: vi.fn(),
};

function renderForm(overrides = {}) {
  const props = { ...defaultProps, ...overrides };
  if (overrides.spec) props.spec = { ...defaultProps.spec, ...overrides.spec };
  return render(<FormOutput {...props} />);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('FormOutput — rendering', () => {
  it('renders form title', () => {
    renderForm();
    expect(screen.getByText('Test Form')).toBeInTheDocument();
  });

  it('renders text input field with label', () => {
    renderForm();
    expect(screen.getByText('Name')).toBeInTheDocument();
    const input = document.querySelector('#form-name');
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('text');
    expect(input.placeholder).toBe('Enter name');
  });

  it('renders number input with min/max', () => {
    renderForm();
    expect(screen.getByText('Age')).toBeInTheDocument();
    const input = document.querySelector('#form-age');
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('number');
    expect(input.min).toBe('0');
    expect(input.max).toBe('120');
  });

  it('renders checkbox field', () => {
    renderForm();
    expect(screen.getByText('I Agree')).toBeInTheDocument();
    const input = document.querySelector('#form-agree');
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('checkbox');
    expect(input.checked).toBe(false);
  });

  it('renders select dropdown with options', () => {
    renderForm();
    expect(screen.getByText('Colour')).toBeInTheDocument();
    const select = document.querySelector('#form-color');
    expect(select).toBeInTheDocument();
    const opts = Array.from(select.options).map((o) => o.value);
    expect(opts).toEqual(['Red', 'Green', 'Blue']);
  });

  it('renders textarea field', () => {
    renderForm();
    expect(screen.getByText('Biography')).toBeInTheDocument();
    const textarea = document.querySelector('#form-bio');
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.placeholder).toBe('Tell us about yourself');
  });

  it('renders date input', () => {
    renderForm();
    expect(screen.getByText('Date of Birth')).toBeInTheDocument();
    const input = document.querySelector('#form-dob');
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('date');
  });

  it('submit button exists and shows "Submit"', () => {
    renderForm();
    const btn = screen.getByRole('button', { name: 'Submit' });
    expect(btn).toBeInTheDocument();
    expect(btn.type).toBe('submit');
  });

  it('shows target cell name in footer', () => {
    renderForm();
    expect(screen.getByText(/Process Results/)).toBeInTheDocument();
  });

  it('required fields show asterisk (*)', () => {
    renderForm();
    const asterisks = document.querySelectorAll('.form-field-required');
    expect(asterisks.length).toBeGreaterThanOrEqual(1);
    expect(asterisks[0].textContent).toBe('*');
  });
});

// ── Submission ────────────────────────────────────────────────────────────────

describe('FormOutput — submission', () => {
  it('calls onRunCellByName on submit with form values', () => {
    const onRunCellByName = vi.fn();
    renderForm({ onRunCellByName });

    // Fill in the name field so the required check passes
    fireEvent.change(document.querySelector('#form-name'), { target: { value: 'Alice' } });

    fireEvent.submit(document.querySelector('form'));

    expect(onRunCellByName).toHaveBeenCalledWith(
      'nb1',
      'Process Results',
      expect.objectContaining({ name: 'Alice', age: 25, agree: false }),
    );
  });

  it('sends form_submit to kernel on submit', () => {
    const onRunCellByName = vi.fn();
    renderForm({ onRunCellByName });

    fireEvent.change(document.querySelector('#form-name'), { target: { value: 'Bob' } });
    fireEvent.submit(document.querySelector('form'));

    expect(window.electronAPI.sendToKernel).toHaveBeenCalledWith('nb1', {
      type: 'form_submit',
      formKey: 'nb1_f0',
      values: expect.objectContaining({ name: 'Bob' }),
    });
  });
});
