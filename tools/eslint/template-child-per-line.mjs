/**
 * An element whose content is only other elements or blocks puts each of them on a line of its own,
 * and its closing tag on the next one. Text mixed with tags is left inline, where a line break would
 * change the rendered spacing.
 */
const isBlank = (node) => node.type === 'Text' && node.value.trim() === '';

export default {
  meta: {
    type: 'layout',
    fixable: 'whitespace',
    messages: { sameLine: 'Put each child element on a line of its own.' },
    schema: [],
  },
  create(context) {
    const report = (offset) =>
      context.report({
        loc: context.sourceCode.getLocFromIndex(offset),
        messageId: 'sameLine',
        fix: (fixer) => fixer.insertTextBeforeRange([offset, offset], '\n'),
      });

    return {
      Element(element) {
        const children = element.children.filter(
          (child) => !isBlank(child) && child.type !== 'Comment',
        );
        if (children.length === 0) {
          return;
        }
        if (children.some((child) => child.type === 'Text' || child.type === 'BoundText')) {
          return;
        }

        let line = element.startSourceSpan.end.line;
        for (const child of children) {
          if (child.sourceSpan.start.line === line) {
            report(child.sourceSpan.start.offset);
          }
          line = child.sourceSpan.end.line;
        }
        const end = element.endSourceSpan;
        if (
          end &&
          end.start.line === line &&
          end.start.offset !== element.startSourceSpan.end.offset
        ) {
          report(end.start.offset);
        }
      },
    };
  },
};
