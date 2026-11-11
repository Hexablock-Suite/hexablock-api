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

// The delivery operations of the value objects. A value object keeps its
// datum private and delivers it to a receiver.
const DELIVERY_OPERATIONS = new Set(['deliverTo', 'deliverKeyTo', 'deliverBoundsTo']);

// Reports every use of a delivery operation of an object: `x.deliverTo(r)`,
// `x['deliverTo'](r)` and `x.deliverTo.call(x, r)`. The config enables the
// rule for src/domain and src/application. Only src/adapters and
// src/infrastructure receive the value of a domain object. The declaration
// of the operation in a class is not a member access, so the rule accepts it.
const noDeliveryCall = defineRule({
  meta: {
    messages: {
      noDeliveryCall:
        'Do not call {{name}}() here. Only src/adapters and src/infrastructure receive the value of a domain object. The domain compares with equals() or a business operation; the application passes the object on.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const { property } = node;
        const name = node.computed
          ? property.type === 'Literal'
            ? property.value
            : undefined
          : property.name;
        if (DELIVERY_OPERATIONS.has(name)) {
          context.report({ node, messageId: 'noDeliveryCall', data: { name } });
        }
      },
    };
  },
});

export default definePlugin({
  meta: { name: 'hexablock' },
  rules: { 'no-current-date': noCurrentDate, 'no-delivery-call': noDeliveryCall },
});
