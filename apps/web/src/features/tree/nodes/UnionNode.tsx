'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { PersonNodeData } from '../types';
import { unionTypeLabel } from '../labels';

/** Small connector node joining partners; the child edges descend from it. */
export function UnionNode({ data }: NodeProps<Node<PersonNodeData>>) {
  const label = unionTypeLabel(data.node.unionType);
  return (
    <div
      className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-muted-foreground/50 bg-background"
      title={label}
      aria-label={label}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground/40" />
      <span className="text-[10px] text-muted-foreground">♥</span>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground/40" />
    </div>
  );
}
