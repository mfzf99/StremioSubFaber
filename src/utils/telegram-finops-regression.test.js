const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCostSection, resolveActiveFinOpsRoute } = require('./telegramFinOps');

function customConfig(baseUrl, apiKey = 'sk-custom-secret') {
    return {
        providers: {
            custom: { baseUrl, apiKey },
            custom_secondary: { baseUrl: '', apiKey: '' }
        },
        geminiApiKeys: ['AIzaOfficialMustNotLeakIntoCustomRoute']
    };
}

test('[FINOPS-ROUTE-1] Custom Crazy Router uses its own key and regional hostname, never the official Gemini pool', () => {
    const route = resolveActiveFinOpsRoute(
        customConfig('https://cn.crazyrouter.com/v1beta'),
        'custom',
        'AIzaOfficialMustNotLeakIntoCustomRoute'
    );
    assert.equal(route.isCrazyRouter, true);
    assert.equal(route.activeApiKey, 'sk-custom-secret');
});

test('[FINOPS-ROUTE-2] Non-Crazy custom and lookalike hostnames cannot claim Crazy Router pricing', () => {
    for (const baseUrl of ['https://api.openai.com/v1', 'https://crazyrouter.com.evil.test/v1']) {
        const route = resolveActiveFinOpsRoute(customConfig(baseUrl), 'custom', 'sk-official-proxy');
        assert.equal(route.isCrazyRouter, false, baseUrl);
        assert.equal(route.activeApiKey, 'sk-custom-secret');
    }
    const invalid = resolveActiveFinOpsRoute(customConfig('not a URL'), 'custom');
    assert.equal(invalid.isCrazyRouter, false);
});

test('[FINOPS-ROUTE-3] Official Gemini proxy and direct-key behavior remain backward compatible', () => {
    assert.deepEqual(resolveActiveFinOpsRoute({}, 'gemini', 'sk-proxy'), {
        isCrazyRouter: true,
        activeApiKey: 'sk-proxy'
    });
    assert.deepEqual(resolveActiveFinOpsRoute({}, 'gemini', 'AIzaOfficial'), {
        isCrazyRouter: false,
        activeApiKey: 'AIzaOfficial'
    });
});

test('[FINOPS-RECEIPT-1] Crazy Router receipt renders discount, actual cost and wallet when balance is available', async () => {
    global.geminiFinOps = {
        streams: {
            batch1: { input: 1000000, cached: 0, thought: 0, output: 1000000 }
        }
    };
    try {
        const { costSection } = await buildCostSection({
            usedModel: 'gemini-3-flash',
            isCrazyRouter: true,
            walletFetcher: async () => 12.5,
            exchangeRateFetcher: async () => ({ rate: 4, indicator: 'test' })
        });
        assert.match(costSection, /Retail Price:/);
        assert.match(costSection, /Discount:<\/b> 45% \(CrazyRouter Proxy\)/);
        assert.match(costSection, /Actual Cost:/);
        assert.match(costSection, /Wallet Balance:<\/b> RM 50\.00 \(\$12\.50\)/);
    } finally {
        global.geminiFinOps = { streams: {} };
    }
});
