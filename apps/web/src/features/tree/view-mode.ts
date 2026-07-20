export type ViewMode = 'ancestors' | 'descendants' | 'combined';

export const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: 'combined', label: 'Комбиниран' },
  { value: 'ancestors', label: 'Предци' },
  { value: 'descendants', label: 'Потомци' },
];

/** Maps a view mode + depth to the projection's ancestors/descendants params. */
export function viewModeParams(mode: ViewMode, depth: number): { ancestors: number; descendants: number } {
  switch (mode) {
    case 'ancestors':
      return { ancestors: depth, descendants: 0 };
    case 'descendants':
      return { ancestors: 0, descendants: depth };
    default:
      return { ancestors: depth, descendants: Math.max(1, depth - 1) };
  }
}

/** Query string for a projection fetch. */
export function projectionQuery(mode: ViewMode, depth: number): string {
  const { ancestors, descendants } = viewModeParams(mode, depth);
  return `ancestors=${ancestors}&descendants=${descendants}&includePartners=true&includeSiblings=true`;
}
