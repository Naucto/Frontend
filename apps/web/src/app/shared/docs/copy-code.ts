/** How long a code block's copy button stands as its own answer. */
const COPIED_MS = 1600;

/**
 * Answers a click inside built documentation that landed on a code block's copy button: the block's
 * code goes to the clipboard and the button says so for a moment. True when the click was one.
 *
 * A card stands inside an article and both listen, so the click is marked as taken: the outer
 * listener sees it and leaves it alone.
 */
export function copyCodeOnClick(event: MouseEvent, copiedLabel: string): boolean {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button.doc-copy');
  const code = button?.closest('.doc-code')?.querySelector('code');
  if (!button || !code) {
    return false;
  }
  if (event.defaultPrevented) {
    return true;
  }
  event.preventDefault();
  void navigator.clipboard.writeText(code.textContent).then(() => {
    if ('copied' in button.dataset) {
      return;
    }
    const label = button.getAttribute('aria-label') ?? '';
    button.dataset.copied = '';
    button.setAttribute('aria-label', copiedLabel);
    setTimeout(() => {
      delete button.dataset.copied;
      button.setAttribute('aria-label', label);
    }, COPIED_MS);
  });
  return true;
}
