import { definePlugin, defineRule } from 'vite-plus/lint/plugins';

// Reports `new Date()` and `Date()` without arguments. Both read the system
// clock. Code in src/domain and src/application reads time from the Clock port.
const noCurrentDate = defineRule({
  meta: {
    messages: {
      noCurrentDate: 'Read the current instant from the Clock port, not from Date.',
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
