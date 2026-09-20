import { Directive } from '@angular/core';

/** Styles native text inputs, textareas and selects on the inset surface. */
@Directive({
  selector: 'input[ncInput], textarea[ncInput], select[ncInput]',
  host: {
    class:
      'block w-full rounded-sm border border-line-strong bg-inset px-1.5 py-1 font-ui text-body text-ink placeholder:text-ink-4 ' +
      'hover:border-ink-4 focus:border-gold focus:outline-none disabled:opacity-40 aria-invalid:border-hot-ink',
  },
})
export class InputDirective {}
