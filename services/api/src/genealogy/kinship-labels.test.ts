import { describe, expect, it } from 'vitest';
import { classifyKinship } from './kinship-labels';

describe('classifyKinship', () => {
  it('labels direct ancestor lines', () => {
    expect(classifyKinship(0, 1)).toBe('родител');
    expect(classifyKinship(0, 2)).toBe('баба/дядо');
    expect(classifyKinship(0, 3)).toBe('прабаба/прадядо');
  });

  it('labels direct descendant lines', () => {
    expect(classifyKinship(1, 0)).toBe('дете');
    expect(classifyKinship(2, 0)).toBe('внук/внучка');
    expect(classifyKinship(3, 0)).toBe('правнук/правнучка');
  });

  it('labels siblings, uncles/aunts and nephews/nieces', () => {
    expect(classifyKinship(1, 1)).toBe('брат/сестра');
    expect(classifyKinship(1, 2)).toBe('чичо/леля');
    expect(classifyKinship(2, 1)).toBe('племенник/племенница');
  });

  it('labels cousins with degree and removal', () => {
    expect(classifyKinship(2, 2)).toBe('първи братовчеди');
    expect(classifyKinship(3, 3)).toBe('втори братовчеди');
    expect(classifyKinship(2, 3)).toBe('първи братовчеди (веднъж отместени)');
    expect(classifyKinship(2, 4)).toBe('първи братовчеди (двукратно отместени)');
  });

  it('handles the same person', () => {
    expect(classifyKinship(0, 0)).toBe('същият човек');
  });
});
