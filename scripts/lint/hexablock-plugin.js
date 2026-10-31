import { definePlugin, defineRule } from 'vite-plus/lint/plugins';

// Reports `new Date()` and `Date()` without arguments. Both read the system
// clock. Code in src/application reads time from the Clock port. Code in
// src/domain takes the instant as a parameter.
const noCurrentDate = defineRule({
  meta: {
    messages: {
      noCurrentDate:
        'Do not read the system clock. The application reads the Clock port; the domain takes the instant as a parameter.',
    },
  },
  create(context) {
    const check = (node) => {
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'Date' &&
        node.arguments.length === 0
      ) {
        context.report({ node, messageId: 'noCurrentDate' });
      }
    };
    return { NewExpression: check, CallExpression: check };
  },
});

export default definePlugin({
  meta: { name: 'hexablock' },
  rules: { 'no-current-date': noCurrentDate },
});
