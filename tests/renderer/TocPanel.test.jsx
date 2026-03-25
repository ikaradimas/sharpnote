import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TocPanel } from '../../src/components/panels/TocPanel.jsx';

function makeCell(id, type, content) {
  return { id, type, content };
}

const cells = [
  makeCell('c1', 'markdown', '## Section One'),
  makeCell('c2', 'markdown', '### Sub Alpha'),
  makeCell('c3', 'markdown', '## Section Two'),
  makeCell('c4', 'markdown', '### Sub Beta'),
  makeCell('c5', 'code', 'var x = 1;'),
];

describe('TocPanel', () => {
  it('renders all headings', () => {
    render(<TocPanel cells={cells} />);
    expect(screen.getByText('Section One')).toBeInTheDocument();
    expect(screen.getByText('Sub Alpha')).toBeInTheDocument();
    expect(screen.getByText('Section Two')).toBeInTheDocument();
    expect(screen.getByText('Sub Beta')).toBeInTheDocument();
  });

  it('shows empty state when no cells have headings', () => {
    render(<TocPanel cells={[makeCell('x', 'code', 'var x = 1;')]} />);
    expect(screen.getByText('No headings found')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<TocPanel cells={cells} />);
    expect(screen.getByPlaceholderText('Filter…')).toBeInTheDocument();
  });

  it('filters headings by query', () => {
    render(<TocPanel cells={cells} />);
    fireEvent.change(screen.getByPlaceholderText('Filter…'), { target: { value: 'alpha' } });
    expect(screen.getByText('Sub Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Section One')).not.toBeInTheDocument();
    expect(screen.queryByText('Sub Beta')).not.toBeInTheDocument();
  });

  it('filter is case-insensitive', () => {
    render(<TocPanel cells={cells} />);
    fireEvent.change(screen.getByPlaceholderText('Filter…'), { target: { value: 'SECTION' } });
    expect(screen.getByText('Section One')).toBeInTheDocument();
    expect(screen.getByText('Section Two')).toBeInTheDocument();
    expect(screen.queryByText('Sub Alpha')).not.toBeInTheDocument();
  });

  it('shows "No matches" when filter matches nothing', () => {
    render(<TocPanel cells={cells} />);
    fireEvent.change(screen.getByPlaceholderText('Filter…'), { target: { value: 'zzznomatch' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('shows clear button only when query is non-empty', () => {
    render(<TocPanel cells={cells} />);
    expect(screen.queryByTitle('Clear')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Filter…'), { target: { value: 'section' } });
    expect(screen.getByTitle('Clear')).toBeInTheDocument();
  });

  it('clear button resets filter and shows all headings', () => {
    render(<TocPanel cells={cells} />);
    fireEvent.change(screen.getByPlaceholderText('Filter…'), { target: { value: 'alpha' } });
    expect(screen.queryByText('Section One')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Clear'));
    expect(screen.getByText('Section One')).toBeInTheDocument();
    expect(screen.getByText('Sub Alpha')).toBeInTheDocument();
  });

  it('clicking a heading item calls scrollTo on the .notebook container', () => {
    const mockContainer = { scrollTo: vi.fn() };
    const mockCell = {
      closest: vi.fn(() => mockContainer),
      offsetTop: 742,
    };
    vi.spyOn(document, 'querySelector').mockReturnValueOnce(mockCell);

    render(<TocPanel cells={cells} />);
    fireEvent.click(screen.getByText('Section One'));

    expect(mockContainer.scrollTo).toHaveBeenCalledWith({
      top: 742 - 8, // cell.offsetTop - 8
      behavior: 'smooth',
    });
  });
});
