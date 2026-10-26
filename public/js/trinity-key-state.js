(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SubFaberTrinityKeyState = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function cleanKey(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function normalizeRotationMode(value) {
        return value === 'per-request' ? 'per-request' : 'per-batch';
    }

    function uniqueKeys(values) {
        var seen = new Set();
        var keys = [];
        (Array.isArray(values) ? values : []).forEach(function (value) {
            var key = cleanKey(value);
            if (!key || seen.has(key)) return;
            seen.add(key);
            keys.push(key);
        });
        return keys;
    }

    // storedKeys accepts both canonical pools (primary included) and the old
    // Trinity UI shape (additional keys only). The visible primary always wins.
    function buildGeminiKeyPool(options) {
        var input = options && typeof options === 'object' ? options : {};
        var primaryKey = cleanKey(input.primaryKey || input.apiKey);
        var storedKeys = uniqueKeys(input.storedKeys || input.apiKeys);
        var additionalKeys = Array.isArray(input.additionalKeys)
            ? uniqueKeys(input.additionalKeys)
            : storedKeys.filter(function (key) {
                  return key !== primaryKey;
              });
        var apiKeys = uniqueKeys([primaryKey].concat(additionalKeys));
        if (!primaryKey && apiKeys.length > 0) primaryKey = apiKeys[0];

        return {
            apiKey: primaryKey,
            apiKeys: apiKeys,
            keyRotationEnabled: input.keyRotationEnabled === true,
            keyRotationMode: normalizeRotationMode(input.keyRotationMode)
        };
    }

    function getAdditionalGeminiKeys(primaryKey, poolKeys) {
        var primary = cleanKey(primaryKey);
        return uniqueKeys(poolKeys).filter(function (key) {
            return key !== primary;
        });
    }

    return {
        buildGeminiKeyPool: buildGeminiKeyPool,
        getAdditionalGeminiKeys: getAdditionalGeminiKeys,
        normalizeRotationMode: normalizeRotationMode
    };
});
