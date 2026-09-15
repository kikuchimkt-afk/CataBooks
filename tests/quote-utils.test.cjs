const assert = require('node:assert/strict');
const QuoteUtils = require('../quote-utils.js');

const cart = [
    { price_retail: 2104 },
    { price_retail: '1,572' },
    { price_retail: null }
];

const withoutShipping = QuoteUtils.calculateQuote(cart, { shippingFee: 550, taxRate: 0.10 }, false);
assert.equal(withoutShipping.itemsSubtotal, 3676);
assert.equal(withoutShipping.shippingFee, 0);
assert.equal(withoutShipping.totalAmount, 3676);
assert.equal(withoutShipping.taxAmount, 334);

const withShipping = QuoteUtils.calculateQuote(cart, { shippingFee: '550', taxRate: 0.10 }, true);
assert.equal(withShipping.itemsSubtotal, 3676);
assert.equal(withShipping.shippingFee, 550);
assert.equal(withShipping.totalAmount, 4226);
assert.equal(withShipping.taxAmount, 384);
assert.equal(withShipping.lineItemCount, 4);

assert.equal(QuoteUtils.normalizeShippingFee(undefined), 0);
assert.equal(QuoteUtils.normalizeShippingFee(-1), 0);
assert.equal(QuoteUtils.normalizeShippingFee('1,100'), 1100);
assert.equal(QuoteUtils.normalizeTaxRate(0), 0);
assert.equal(QuoteUtils.normalizeTaxRate(10), 0.10);
assert.equal(QuoteUtils.normalizeTaxRate(null), 0.10);

console.log('quote-utils tests passed');
