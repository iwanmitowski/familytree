import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/features/admin/client', () => ({
  adminApi: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { adminApi } from '@/features/admin/client';
import { FilesTab } from '@/features/people/FilesTab';

const getMock = vi.mocked(adminApi.get);
const delMock = vi.mocked(adminApi.del);

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('FilesTab', () => {
  it('renders image thumbnails and pdf placeholders', async () => {
    getMock.mockResolvedValue({
      items: [
        { id: 'f1', personId: 'p1', sourceId: null, originalFilename: 'снимка.jpg', contentType: 'image/jpeg', sizeBytes: 2048, createdAt: '2026-07-20T10:00:00Z' },
        { id: 'f2', personId: 'p1', sourceId: null, originalFilename: 'документ.pdf', contentType: 'application/pdf', sizeBytes: 1_048_576, createdAt: '2026-07-20T10:00:00Z' },
      ],
    });
    renderWithQuery(<FilesTab personId="p1" />);
    const img = await screen.findByRole('img', { name: 'снимка.jpg' });
    expect(img).toHaveAttribute('src', '/api/admin/files/f1');
    expect(screen.getByText('документ.pdf')).toBeInTheDocument();
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();
  });

  it('deletes a file after confirmation', async () => {
    vi.stubGlobal('confirm', () => true);
    delMock.mockResolvedValue(null);
    getMock.mockResolvedValue({
      items: [{ id: 'f1', personId: 'p1', sourceId: null, originalFilename: 'снимка.jpg', contentType: 'image/jpeg', sizeBytes: 2048, createdAt: '2026-07-20T10:00:00Z' }],
    });
    renderWithQuery(<FilesTab personId="p1" />);
    const card = (await screen.findByText('снимка.jpg')).closest('div')!.parentElement!;
    fireEvent.click(within(card).getByRole('button', { name: 'Изтрий' }));
    await waitFor(() => expect(delMock).toHaveBeenCalledWith('/api/admin/files/f1'));
  });
});
