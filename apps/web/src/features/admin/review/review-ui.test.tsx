import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/features/admin/client', () => ({
  adminApi: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sub-1' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { adminApi } from '@/features/admin/client';
import { ResolutionTab } from '@/features/admin/review/ResolutionTab';
import { SuggestedRelationshipsTab } from '@/features/admin/review/SuggestedRelationshipsTab';
import SubmissionDetailPage from '@/app/admin/submissions/[id]/page';
import type { SubmissionPerson } from '@/features/admin/types';

const getMock = vi.mocked(adminApi.get);
const postMock = vi.mocked(adminApi.post);

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const PENDING_PERSON: SubmissionPerson = {
  id: 'sp1',
  localKey: 'SELF',
  first_name: 'Иван',
  surname: 'Митовски',
  birth_year_from: 1950,
  resolution_status: 'pending',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('resolution card', () => {
  it('creates a new person via the confirm dialog', async () => {
    postMock.mockResolvedValue({});
    renderWithQuery(<ResolutionTab submissionId="sub-1" people={[PENDING_PERSON]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Създай нов човек' }));
    fireEvent.click(screen.getByRole('button', { name: 'Създай' }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/api/admin/submission-people/sp1/create-person'),
    );
  });

  it('finds matches, shows candidates, and links to one', async () => {
    postMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/find-matches')
          ? {
              candidates: [
                {
                  id: 'c1',
                  canonicalPersonId: 'p9',
                  score: 80,
                  reasons: [{ field: 'name', score: 35, description: 'Съвпадащо име' }],
                  status: 'pending',
                  person: { id: 'p9', label: 'Иван Митовски', birthYear: 1950 },
                },
              ],
            }
          : {},
      ),
    );
    renderWithQuery(<ResolutionTab submissionId="sub-1" people={[PENDING_PERSON]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Намери съвпадения' }));
    expect(await screen.findByText('Съвпадащо име')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Свържи' }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/api/admin/submission-people/sp1/link-person', { personId: 'p9' }),
    );
  });
});

describe('suggested relationships', () => {
  it('confirms a ready parent_child suggestion', async () => {
    getMock.mockResolvedValue({
      items: [
        {
          kind: 'parent_child',
          viaLocalKeys: ['SELF', 'FATHER'],
          a: { localKey: 'FATHER', personId: 'pf', label: 'Баща' },
          b: { localKey: 'SELF', personId: 'ps', label: 'Аз' },
          relationshipType: 'biological',
          status: 'ready',
          missingLocalKeys: [],
        },
      ],
    });
    postMock.mockResolvedValue({ ok: true, kind: 'parent_child' });
    renderWithQuery(<SuggestedRelationshipsTab submissionId="s1" />);
    expect(await screen.findByText('Баща')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Потвърди' }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/api/admin/submissions/s1/confirm-relationship', {
        kind: 'parent_child',
        parentPersonId: 'pf',
        childPersonId: 'ps',
        relationshipType: 'biological',
      }),
    );
  });

  it('explains a missing_person suggestion', async () => {
    getMock.mockResolvedValue({
      items: [
        {
          kind: 'parent_child',
          viaLocalKeys: ['SELF', 'FATHER'],
          a: { localKey: 'FATHER', personId: null, label: 'FATHER' },
          b: { localKey: 'SELF', personId: 'ps', label: 'Аз' },
          relationshipType: 'biological',
          status: 'missing_person',
          missingLocalKeys: ['FATHER'],
        },
      ],
    });
    renderWithQuery(<SuggestedRelationshipsTab submissionId="s1" />);
    expect(await screen.findByText(/Липсва: FATHER/)).toBeInTheDocument();
  });
});

describe('complete guard', () => {
  const base = {
    id: 'sub-1',
    status: 'in_review',
    participantName: 'Мария',
    campaign: null,
    peopleCount: 1,
    hasMaterials: false,
    submittedAt: '2026-07-20T10:00:00Z',
    originalPayload: {},
    clientFingerprintPrefix: 'fp',
    spamReason: null,
    processingStartedAt: null,
    processedAt: null,
    rejectedAt: null,
    relationships: [],
    consents: [],
  };

  it('disables completion while a person is still pending', async () => {
    getMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/suggested-relationships')
          ? { items: [] }
          : { ...base, people: [{ id: 'sp1', localKey: 'SELF', first_name: 'Мария', resolution_status: 'pending' }] },
      ),
    );
    renderWithQuery(<SubmissionDetailPage />);
    const btn = await screen.findByRole('button', { name: 'Маркирай като обработена' });
    expect(btn).toBeDisabled();
  });

  it('enables completion when every person is resolved', async () => {
    getMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/suggested-relationships')
          ? { items: [] }
          : { ...base, people: [{ id: 'sp1', localKey: 'SELF', first_name: 'Мария', resolution_status: 'created', matched_person_id: 'p1' }] },
      ),
    );
    renderWithQuery(<SubmissionDetailPage />);
    const btn = await screen.findByRole('button', { name: 'Маркирай като обработена' });
    expect(btn).toBeEnabled();
  });
});
