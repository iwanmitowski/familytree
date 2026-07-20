import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuestionnaireProvider } from './store';
import { QuestionnaireForm } from './QuestionnaireForm';
import { clearDraft, saveDraft } from './draft';

function renderForm(initialStep = 0) {
  return render(
    <QuestionnaireProvider initialStep={initialStep}>
      <QuestionnaireForm />
    </QuestionnaireProvider>,
  );
}

beforeEach(() => clearDraft());
afterEach(() => cleanup());

describe('questionnaire multi-step form', () => {
  it('renders step 1 in Bulgarian with a hidden honeypot', () => {
    renderForm();
    expect(screen.getByRole('heading', { name: 'За участника' })).toBeInTheDocument();
    expect(screen.getByLabelText('Вашите имена')).toBeInTheDocument();

    const honeypot = screen.getByLabelText('Уебсайт (не попълвайте)');
    expect(honeypot).toHaveAttribute('tabindex', '-1');
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('blocks advancing when required fields are empty', async () => {
    renderForm();
    fireEvent.submit(screen.getByLabelText('Вашите имена').closest('form')!);
    expect(await screen.findByText('Моля, въведете имената си')).toBeInTheDocument();
    // Still on step 1.
    expect(screen.getByRole('heading', { name: 'За участника' })).toBeInTheDocument();
  });

  it('advances to step 2 once step 1 is valid', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Вашите имена'), { target: { value: 'Иван Тестов' } });
    fireEvent.change(screen.getByLabelText('Каква е връзката Ви с фамилията Митовски?'), {
      target: { value: 'внук' },
    });
    fireEvent.click(
      screen.getByLabelText(/Съгласен\/съгласна съм изпратената информация/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Напред' }));

    expect(await screen.findByRole('heading', { name: 'Информация за Вас' })).toBeInTheDocument();
  });

  it('lets step 3 be skipped without filling anything', async () => {
    renderForm(2); // start on "Родители"
    expect(screen.getByRole('heading', { name: 'Родители' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Пропусни тази стъпка' }));
    expect(await screen.findByRole('heading', { name: 'Баби и дядовци' })).toBeInTheDocument();
  });

  it('offers to restore an existing draft and applies it', async () => {
    saveDraft({ participantName: 'Мария Драфтова', connectionToFamily: 'дъщеря' }, Date.now());
    renderForm();
    expect(
      await screen.findByText(/Открихме незавършена чернова/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Продължи от черновата' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Вашите имена')).toHaveValue('Мария Драфтова'),
    );
  });

  it('discards a draft when starting over', async () => {
    saveDraft({ participantName: 'Стар запис' }, Date.now());
    renderForm();
    fireEvent.click(await screen.findByRole('button', { name: 'Започни отначало' }));
    await waitFor(() =>
      expect(screen.queryByText(/Открихме незавършена чернова/)).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Вашите имена')).toHaveValue('');
  });
});

async function advanceToStep2(name = 'Иван Петров Тестов', fillingForOther = false) {
  fireEvent.change(screen.getByLabelText('Вашите имена'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Каква е връзката Ви с фамилията Митовски?'), {
    target: { value: 'внук' },
  });
  if (fillingForOther) {
    fireEvent.click(screen.getByLabelText('Попълвам от името на друг роднина'));
  }
  fireEvent.click(screen.getByLabelText(/Съгласен\/съгласна съм изпратената информация/));
  fireEvent.click(screen.getByRole('button', { name: 'Напред' }));
}

describe('step 2 UX (filling for yourself)', () => {
  it('prefills your names from step 1 and never asks a living person for a death year', async () => {
    renderForm();
    await advanceToStep2('Иван Петров Тестов');
    expect(await screen.findByRole('heading', { name: 'Информация за Вас' })).toBeInTheDocument();

    // Names carried over from step 1 (still editable).
    expect(screen.getByLabelText('Собствено име')).toHaveValue('Иван');
    expect(screen.getByLabelText('Бащино име')).toHaveValue('Петров');
    expect(screen.getByLabelText('Фамилия')).toHaveValue('Тестов');

    // You are alive: no living-status question and no death year.
    expect(screen.queryByLabelText('Жив/а ли е този човек?')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Година на смърт')).not.toBeInTheDocument();

    // Occupation is now part of "about you".
    expect(screen.getByLabelText('Професия')).toBeInTheDocument();
  });

  it('asks about the other person (with living status) when filling on their behalf', async () => {
    renderForm();
    await advanceToStep2('Мария Попълваща', true);
    expect(await screen.findByRole('heading', { name: 'Информация за лицето' })).toBeInTheDocument();

    // No prefill — this step describes someone else.
    expect(screen.getByLabelText('Собствено име')).toHaveValue('');
    expect(screen.getByLabelText('Жив/а ли е този човек?')).toBeInTheDocument();
  });
});

describe('conditional death fields (relatives)', () => {
  it('shows the death year only after marking the person deceased', async () => {
    renderForm(2); // Родители
    expect(screen.queryByLabelText('Година на смърт')).not.toBeInTheDocument();

    const statusSelects = screen.getAllByLabelText('Жив/а ли е този човек?');
    fireEvent.change(statusSelects[0]!, { target: { value: 'deceased' } });

    expect(await screen.findByLabelText('Година на смърт')).toBeInTheDocument();
    // Only the deceased parent gets the field.
    expect(screen.getAllByLabelText('Година на смърт')).toHaveLength(1);
  });
});

describe('year picker', () => {
  it('picks a year from the calendar-like grid', async () => {
    renderForm(2); // Родители
    const [pickerButton] = screen.getAllByRole('button', { name: 'Избор на година: Година на раждане' });
    fireEvent.click(pickerButton!);

    const visibleYear = String(new Date().getFullYear() - 11);
    fireEvent.click(await screen.findByRole('button', { name: visibleYear }));

    const [birthInput] = screen.getAllByLabelText('Година на раждане');
    await waitFor(() => expect(birthInput).toHaveValue(Number(visibleYear)));
  });
});
