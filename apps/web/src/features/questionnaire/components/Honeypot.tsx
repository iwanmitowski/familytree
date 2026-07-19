import type { UseFormRegisterReturn } from 'react-hook-form';

/**
 * Anti-bot honeypot (idea.md §6). Visually hidden and removed from the tab
 * order; a real user never fills it, so a non-empty value marks a bot.
 */
export function Honeypot({ registration }: { registration: UseFormRegisterReturn }) {
  return (
    <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
      <label htmlFor="website">Уебсайт (не попълвайте)</label>
      <input
        id="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        {...registration}
      />
    </div>
  );
}
