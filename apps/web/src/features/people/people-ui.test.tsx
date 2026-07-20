import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/features/admin/client', () => ({
  adminApi: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'p1' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { adminApi } from '@/features/admin/client';
import { toast } from 'sonner';
import PeoplePage from '@/app/admin/people/page';
import PersonPage from '@/app/admin/people/[id]/page';
import { RelationshipsTab } from '@/features/people/RelationshipsTab';
import { MergeDialog } from '@/features/people/MergeDialog';
import type { PersonAggregate } from '@/features/people/types';

const getMock = vi.mocked(adminApi.get);
const patchMock = vi.mocked(adminApi.patch);

const AGG: PersonAggregate = {
  id: 'p1',
  label: 'Иван Митовски',
  livingStatus: 'deceased',
  privacyLevel: 'family',
  notes: null,
  mergedIntoPersonId: null,
  names: [
    { id: 'n1', first_name: 'Иван', middle_name: null, surname: 'Митовски', birth_surname: null, nickname: null, name_type: 'primary', is_preferred: true },
  ],
  events: [
    { id: 'e1', event_type: 'birth', year_from: 1932, year_to: 1932, date_precision: 'year', place_label: 'София', value: null },
  ],
  parents: [
    { id: 'r1', parent_id: 'p2', child_id: 'p1', relationship_type: 'biological', verification_status: 'proposed', confidence: null, family_union_id: null, counterpartId: 'p2', counterpartLabel: 'Петър Митовски' },
  ],
  children: [],
  unions: [],
  mergeHistory: [],
  sourceCount: 2,
};

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('admin people list', () => {
  it('renders people with lifespan and status badges', async () => {
    getMock.mockResolvedValue({
      items: [
        { id: 'p1', label: 'Иван Митовски', livingStatus: 'deceased', privacyLevel: 'private', birthYear: 1932, deathYear: 1990, merged: false },
      ],
    });
    renderWithQuery(<PeoplePage />);
    const nameCell = await screen.findByText('Иван Митовски');
    const row = nameCell.closest('tr')!;
    expect(within(row).getByText('1932 – 1990')).toBeInTheDocument();
    expect(within(row).getByText('Починал/а')).toBeInTheDocument();
  });
});

describe('admin person page', () => {
  it('renders the header and relationship counterpart from the aggregate', async () => {
    getMock.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith('/evidence') ? { items: [] } : AGG),
    );
    renderWithQuery(<PersonPage />);
    expect(await screen.findByRole('heading', { name: 'Иван Митовски' })).toBeInTheDocument();
    // Default tab is Връзки — the proposed parent is shown with its label.
    expect(await screen.findByText('Петър Митовски')).toBeInTheDocument();
    expect(screen.getByText('Предложена')).toBeInTheDocument();
  });
});

describe('relationship actions', () => {
  it('confirms a proposed edge via PATCH', async () => {
    patchMock.mockResolvedValue({});
    renderWithQuery(<RelationshipsTab person={AGG} />);
    fireEvent.click(screen.getByRole('button', { name: 'Потвърди' }));
    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/api/admin/relationships/r1', { verificationStatus: 'confirmed' }),
    );
  });

  it('surfaces a 422 cycle rejection as a Bulgarian error toast', async () => {
    patchMock.mockRejectedValue(new Error('Връзката би създала цикъл в родословието'));
    renderWithQuery(<RelationshipsTab person={AGG} />);
    fireEvent.click(screen.getByRole('button', { name: 'Потвърди' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Връзката би създала цикъл в родословието'),
    );
  });
});

describe('merge dialog', () => {
  it('disables the merge action until target, reason, and confirmation are set', () => {
    renderWithQuery(<MergeDialog source={AGG} />);
    fireEvent.click(screen.getByRole('button', { name: 'Слей с друг човек' }));
    expect(screen.getByRole('button', { name: 'Слей' })).toBeDisabled();
  });
});
