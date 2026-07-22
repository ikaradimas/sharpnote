import { describe, it, expect } from 'vitest';
import { appendCapped, MAX_CELL_OUTPUTS } from '../../src/utils.js';

const mk = (i) => ({ type: 'stdout', id: 'c1', content: `line ${i}\n` });

describe('appendCapped', () => {
  it('appends normally below the cap', () => {
    let arr = [];
    for (let i = 0; i < 5; i++) arr = appendCapped(arr, mk(i), 10);
    expect(arr).toHaveLength(5);
    expect(arr[0].content).toBe('line 0\n');
    expect(arr[4].content).toBe('line 4\n');
  });

  it('handles a null/undefined starting array', () => {
    expect(appendCapped(null, mk(0), 10)).toHaveLength(1);
    expect(appendCapped(undefined, mk(0), 10)[0].content).toBe('line 0\n');
  });

  it('never exceeds the cap once over it', () => {
    let arr = [];
    for (let i = 0; i < 100; i++) arr = appendCapped(arr, mk(i), 10);
    expect(arr).toHaveLength(10);
  });

  it('keeps the most recent entries and drops the oldest', () => {
    let arr = [];
    for (let i = 0; i < 100; i++) arr = appendCapped(arr, mk(i), 10);
    // slot 0 is the marker; the rest are the 9 newest real entries
    expect(arr[arr.length - 1].content).toBe('line 99\n');
    expect(arr.some((m) => m.content === 'line 0\n')).toBe(false);
  });

  it('places a single truncation marker at the front with a cumulative count', () => {
    let arr = [];
    for (let i = 0; i < 100; i++) arr = appendCapped(arr, mk(i), 10);
    const markers = arr.filter((m) => m._truncationMarker);
    expect(markers).toHaveLength(1);
    expect(arr[0]._truncationMarker).toBe(true);
    // 100 pushed, 9 real kept + 1 marker slot => 91 hidden
    expect(arr[0]._dropped).toBe(91);
    expect(arr[0].content).toMatch(/91 earlier outputs hidden/);
  });

  it('does not trigger a marker at exactly the cap', () => {
    // length + 1 === max is still within bounds, so no truncation yet.
    const arr = appendCapped([mk(0), mk(1)], mk(2), 3);
    expect(arr).toHaveLength(3);
    expect(arr.some((m) => m._truncationMarker)).toBe(false);
  });

  it('drops at least two on first overflow (overflow item + reserved marker slot)', () => {
    const arr = appendCapped([mk(0), mk(1), mk(2)], mk(3), 3); // 4 > cap 3
    expect(arr).toHaveLength(3);
    expect(arr[0]._truncationMarker).toBe(true);
    expect(arr[0]._dropped).toBe(2);
    expect(arr[0].content).toMatch(/2 earlier outputs hidden/);
  });

  it('carries the id of the triggering message onto the marker', () => {
    let arr = [];
    for (let i = 0; i < 20; i++) arr = appendCapped(arr, mk(i), 5);
    expect(arr[0].id).toBe('c1');
    expect(arr[0].type).toBe('stdout');
  });

  it('defaults to MAX_CELL_OUTPUTS when no max is given', () => {
    let arr = [];
    for (let i = 0; i < MAX_CELL_OUTPUTS + 50; i++) arr = appendCapped(arr, mk(i));
    expect(arr).toHaveLength(MAX_CELL_OUTPUTS);
  });
});
