(function (globalScope) {
    'use strict';

    const DEFAULT_TAX_RATE = 0.10;

    function toFiniteNumber(value) {
        if (value === null || value === undefined || typeof value === 'boolean') return NaN;

        if (typeof value === 'string') {
            const normalized = value.replace(/,/g, '').trim();
            if (normalized === '') return NaN;
            value = normalized;
        }

        const number = Number(value);
        return Number.isFinite(number) ? number : NaN;
    }

    function normalizeYen(value) {
        const number = toFiniteNumber(value);
        if (!Number.isFinite(number) || number < 0) return 0;
        return Math.trunc(number);
    }

    function normalizeShippingFee(value) {
        return normalizeYen(value);
    }

    function normalizeTaxRate(value) {
        const number = toFiniteNumber(value);
        return Number.isFinite(number) && number >= 0 && number <= 1 ? number : DEFAULT_TAX_RATE;
    }

    function calculateQuote(cart, settings, includeShipping) {
        const safeCart = Array.isArray(cart) ? cart : [];
        const safeSettings = settings && typeof settings === 'object' ? settings : {};
        const itemsSubtotal = safeCart.reduce(
            (sum, item) => sum + normalizeYen(item && item.price_retail),
            0
        );
        const configuredShippingFee = normalizeShippingFee(safeSettings.shippingFee);
        const shippingFee = includeShipping ? configuredShippingFee : 0;
        const totalAmount = itemsSubtotal + shippingFee;
        const taxRate = normalizeTaxRate(safeSettings.taxRate);
        const taxAmount = taxRate === 0
            ? 0
            : Math.floor(totalAmount * taxRate / (1 + taxRate));

        return {
            itemsSubtotal,
            configuredShippingFee,
            shippingFee,
            totalAmount,
            taxRate,
            taxAmount,
            lineItemCount: safeCart.length + (shippingFee > 0 ? 1 : 0)
        };
    }

    const api = {
        DEFAULT_TAX_RATE,
        normalizeYen,
        normalizeShippingFee,
        normalizeTaxRate,
        calculateQuote
    };

    globalScope.QuoteUtils = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
