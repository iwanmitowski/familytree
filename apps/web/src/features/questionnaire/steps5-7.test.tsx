import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(''),
}));

import { QuestionnaireProvider } from './store';
import { Step5Relatives } from './steps/Step5Relatives';
import { Step7Review } from './steps/Step7Review';

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

function renderWith(node: React.ReactNode, initialValues: Record<string, unknown> = {}) {
  return render(
    <QuestionnaireProvider initialStep={4} initialValues={initialValues}>
      {node}
    </QuestionnaireProvider>,
  );
}

describe('Step 5 — repeatable relatives', () => {
  it('adds and removes sibling entries', () => {
    renderWith(<Step5Relatives />);
    const section = screen.getByRole('heading', { name: 'Братя и сестри' }).closest('section')!;
    expect(within(section).queryByLabelText(/Собствено име/)).toBeNull();

    fireEvent.click(within(section).getByRole('button', { name: /Добави брат\/сестра/ }));
    expect(within(section).getAllByLabelText(/Собствено име/)).toHaveLength(1);

    fireEvent.click(within(section).getByRole('button', { name: 'Премахни' }));
    expect(within(section).queryByLabelText(/Собствено име/)).toBeNull();
  });

  it('caps a section at 10 entries', () => {
    renderWith(<Step5Relatives />);
    const section = screen.getByRole('heading', { name: 'Деца' }).closest('section')!;
    const addButton = within(section).getByRole('button', { name: /Добави дете/ });
    for (let i = 0; i < 10; i++) fireEvent.click(addButton);
    expect(within(section).getByText(/Достигнахте максимума от 10/)).toBeInTheDocument();
    expect(addButton).toBeDisabled();
  });
});

describe('Step 7 — review, consent gating, submit', () => {
  const seeded = {
    participantName: 'Иван Тестов',
    connectionToFamily: 'внук',
    consentDataProcessing: true,
    self: { firstName: 'Иван', livingStatus: 'living' },
  };

  it('shows a nudge when grandparents are missing', () => {
    renderWith(<Step7Review />, seeded);
    expect(
      screen.getByText('Не сте описали баби и дядовци — дори само имената помагат.'),
    ).toBeInTheDocument();
  });

  it('disables submit until the required consent is checked', () => {
    renderWith(<Step7Review />, { ...seeded, consentDataProcessing: false });
    const submit = screen.getByRole('button', { name: 'Изпрати' });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByText(/Съгласен\/съгласна съм изпратената информация/).closest('label')!.querySelector('input')!);
    expect(screen.getByRole('button', { name: 'Изпрати' })).not.toBeDisabled();
  });

  it('submits and navigates to the success page on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ submissionId: 'abcdef12-0000-0000-0000-000000000000' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    renderWith(<Step7Review />, seeded);
    fireEvent.click(screen.getByRole('button', { name: 'Изпрати' }));

    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledWith('/questionnaire/success?ref=abcdef12'));
    vi.unstubAllGlobals();
  });

  it('surfaces a Bulgarian message on 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    renderWith(<Step7Review />, seeded);
    fireEvent.click(screen.getByRole('button', { name: 'Изпрати' }));

    expect(await screen.findByText(/твърде много заявки/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
