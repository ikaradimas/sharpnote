import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { isMarpMarkdown } from '../../src/utils.js';

const marpRender = vi.hoisted(() => vi.fn(() => ({
  html: '<section data-marpit-slide="1">Slide 1</section>'
      + '<section data-marpit-slide="2">Slide 2</section>'
      + '<section data-marpit-slide="3">Slide 3</section>',
  css:  '.marpit-section { background: #fff; }',
})));

vi.mock('@marp-team/marp-core', () => ({
  Marp: vi.fn(() => ({ render: marpRender })),
}));

import { MarpRender } from '../../src/components/output/MarpRender.jsx';

afterEach(cleanup);

describe('isMarpMarkdown', () => {
  it('detects marp:true in YAML frontmatter', () => {
    expect(isMarpMarkdown('---\nmarp: true\n---\n# Slide')).toBe(true);
    expect(isMarpMarkdown('---\nmarp: true\ntheme: default\n---\n# Slide')).toBe(true);
  });

  it('returns false for plain markdown', () => {
    expect(isMarpMarkdown('# Heading\n\nbody text')).toBe(false);
    expect(isMarpMarkdown('---\n---')).toBe(false);
    expect(isMarpMarkdown('---\nmarp: false\n---\n# x')).toBe(false);
    expect(isMarpMarkdown(null)).toBe(false);
  });
});

describe('MarpRender', () => {
  beforeEach(() => marpRender.mockClear());

  it('renders the deck and shows the first slide with a slide counter', async () => {
    const { container } = render(<MarpRender content="---\nmarp: true\n---\n# A\n\n---\n\n# B\n\n---\n\n# C" />);

    await waitFor(() => expect(marpRender).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const counter = container.querySelector('.marp-counter');
      expect(counter?.textContent).toBe('1 / 3');
    });

    const sections = container.querySelectorAll('section');
    expect(sections).toHaveLength(3);
    expect(sections[0].style.display).toBe('');        // visible
    expect(sections[1].style.display).toBe('none');
    expect(sections[2].style.display).toBe('none');
  });

  it('next button advances the slide and disables when on the last', async () => {
    const { container } = render(<MarpRender content="---\nmarp: true\n---\n# x" />);
    await waitFor(() => expect(container.querySelector('.marp-counter').textContent).toBe('1 / 3'));

    const next = container.querySelectorAll('.marp-btn')[1];
    fireEvent.click(next);
    await waitFor(() => expect(container.querySelector('.marp-counter').textContent).toBe('2 / 3'));

    fireEvent.click(next);
    await waitFor(() => expect(container.querySelector('.marp-counter').textContent).toBe('3 / 3'));
    expect(next.disabled).toBe(true);
  });

  it('previous button goes back and disables on slide 1', async () => {
    const { container } = render(<MarpRender content="---\nmarp: true\n---\n# x" />);
    await waitFor(() => expect(container.querySelector('.marp-counter').textContent).toBe('1 / 3'));

    const buttons = container.querySelectorAll('.marp-btn');
    const prev = buttons[0];
    expect(prev.disabled).toBe(true);

    const next = buttons[1];
    fireEvent.click(next);
    fireEvent.click(next);
    await waitFor(() => expect(container.querySelector('.marp-counter').textContent).toBe('3 / 3'));

    fireEvent.click(prev);
    await waitFor(() => expect(container.querySelector('.marp-counter').textContent).toBe('2 / 3'));
  });

  it('injects the marp CSS as a <style> tag inside the stage', async () => {
    const { container } = render(<MarpRender content="---\nmarp: true\n---\n# x" />);
    await waitFor(() => expect(container.querySelector('.marp-stage style')).not.toBeNull());
    expect(container.querySelector('.marp-stage style').textContent).toContain('marpit-section');
  });
});
