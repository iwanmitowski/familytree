import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from './page';

describe('HomePage', () => {
  it('renders the Bulgarian project title', () => {
    render(<HomePage />);
    expect(
      screen.getByRole('heading', { name: /Родословно дърво на рода Митовски/i }),
    ).toBeInTheDocument();
  });

  it('links to the questionnaire and the tree', () => {
    render(<HomePage />);
    expect(screen.getByRole('link', { name: /Попълни въпросника/i })).toHaveAttribute(
      'href',
      '/questionnaire',
    );
    expect(screen.getByRole('link', { name: /Разгледай дървото/i })).toHaveAttribute(
      'href',
      '/tree',
    );
  });
});
