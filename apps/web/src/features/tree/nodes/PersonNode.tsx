'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { PersonNodeData, TreeNode } from '../types';
import { personYears, verificationLabel } from '../labels';

function isMasked(node: TreeNode): boolean {
  return node.living === true || node.label === 'Член на семейството' || node.label === 'Жив член на семейството';
}

function initials(label: string | null | undefined): string {
  if (!label) return '?';
  const parts = label.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function PersonNode({ data, selected }: NodeProps<Node<PersonNodeData>>) {
  const { node, isRoot } = data;
  const masked = isMasked(node);
  const years = personYears(node);
  const verification = verificationLabel(node.verificationState);

  return (
    <div
      className={[
        'flex w-[190px] items-center gap-2 rounded-lg border px-3 py-2 text-left shadow-sm transition',
        masked ? 'border-dashed bg-muted/50 text-muted-foreground' : 'bg-card',
        isRoot ? 'ring-2 ring-primary' : '',
        selected ? 'ring-2 ring-primary/60' : '',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground/40" />
      <div
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          masked ? 'bg-muted' : 'bg-primary/10 text-primary'
        }`}
      >
        {masked ? '•' : initials(node.label)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{node.label || 'Без име'}</p>
        {years && <p className="truncate text-xs text-muted-foreground">{years}</p>}
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {verification && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{verification}</span>}
          {node.sourceCount != null && node.sourceCount > 0 && (
            <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground" title="Източници">
              📄 {node.sourceCount}
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground/40" />
    </div>
  );
}
