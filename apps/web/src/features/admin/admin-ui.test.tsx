import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/features/admin/client', () => ({ adminApi: { get: vi.fn(), post: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sub-1' }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

import { adminApi } from '@/features/admin/client';
import SubmissionsPage from '@/app/admin/submissions/page';
import SubmissionDetailPage from '@/app/admin/submissions/[id]/page';

const getMock = vi.mocked(adminApi.get);

function renderWithQuery(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('admin submissions list', () => {
  it('renders submissions with a materials badge and status', async () => {
    getMock.mockResolvedValue({
      items: [
        {
          id: 's1',
          status: 'pending',
          participantName: 'Иван Тестов',
          campaign: 'snowball',
          peopleCount: 3,
          hasMaterials: true,
          submittedAt: '2026-07-20T10:00:00Z',
        },
      ],
    });
    renderWithQuery(<SubmissionsPage />);
    expect(await screen.findByText('Иван Тестов')).toBeInTheDocument();
    expect(screen.getByText('Материали')).toBeInTheDocument();
    expect(screen.getByText('Чакаща')).toBeInTheDocument();
  });
});

describe('admin submission detail', () => {
  it('renders payload sections and the materials note', async () => {
    getMock.mockResolvedValue({
      id: 'sub-1',
      status: 'pending',
      participantName: 'Мария',
      campaign: null,
      peopleCount: 1,
      hasMaterials: true,
      submittedAt: '2026-07-20T10:00:00Z',
      originalPayload: { origin: { hasMaterials: 'yes', materialsDescription: 'стари писма' }, meta: { durationMs: 90000 } },
      clientFingerprintPrefix: 'fp-abc',
      spamReason: null,
      processingStartedAt: null,
      processedAt: null,
      rejectedAt: null,
      people: [{ id: 'p1', localKey: 'SELF', first_name: 'Мария', surname: 'Иванова', birth_year_from: 1980, living_status: 'living' }],
      relationships: [],
      consents: [{ consent_type: 'data_processing', consent_version: 'v1', accepted: true }],
    });
    renderWithQuery(<SubmissionDetailPage />);
    expect(await screen.findByRole('heading', { name: 'Мария' })).toBeInTheDocument();
    expect(screen.getByText(/стари писма/)).toBeInTheDocument();
    expect(screen.getByText('SELF')).toBeInTheDocument();
    // Pending submissions expose the "Започни преглед" action.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Започни преглед' })).toBeInTheDocument());
  });
});
