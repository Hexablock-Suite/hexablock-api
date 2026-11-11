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

// Gives the name of a member or of a pattern key when the source states it:
// an identifier or a text literal. A key built at run time gives undefined.
function statedName(key, computed) {
  if (!computed) {
    return key.type === 'Identifier' ? key.name : key.value;
  }
  return key.type === 'Literal' ? key.value : undefined;
}

// Reports every use of a delivery operation of an object: `x.deliverTo(r)`,
// `x['deliverTo'](r)`, `x.deliverTo.call(x, r)`, and a destructuring such as
// `const { deliverTo } = x` or `function f({ deliverTo }) {}`. The config
// enables the rule for src/domain and src/application. Only src/adapters and
// src/infrastructure receive the value of a domain object. The declaration
// of the operation in a class is not a member access or a pattern, so the
// rule accepts it.
// The rule cannot see a key built at run time: `x[n]`, `Reflect.get(x, n)` or a template literal key.
const noDeliveryCall = defineRule({
  meta: {
    messages: {
      noDeliveryCall:
        'Do not use {{name}}() here. Only src/adapters and src/infrastructure receive the value of a domain object. The domain compares with equals() or a business operation; the application passes the object on.',
    },
  },
  create(context) {
    const check = (node, key, computed) => {
      const name = statedName(key, computed);
      if (DELIVERY_OPERATIONS.has(name)) {
        context.report({ node, messageId: 'noDeliveryCall', data: { name } });
      }
    };
    return {
      MemberExpression(node) {
        check(node, node.property, node.computed);
      },
      ObjectPattern(node) {
        for (const property of node.properties) {
          // A rest element has no key.
          if (property.type === 'Property') {
            check(property, property.key, property.computed);
          }
        }
      },
    };
  },
});

export default definePlugin({
  meta: { name: 'hexablock' },
  rules: { 'no-current-date': noCurrentDate, 'no-delivery-call': noDeliveryCall },
});
