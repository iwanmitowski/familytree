import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, type SubmissionStatus } from './types';

const VARIANT: Record<SubmissionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  pending: 'default',
  in_review: 'secondary',
  processed: 'secondary',
  rejected: 'destructive',
  spam: 'destructive',
};

export function StatusBadge({ status }: { status: SubmissionStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
