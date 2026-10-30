'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns');

const { httpAgent, httpsAgent, dnsLookup, createIpv4Lookup } = require('./httpAgents');
const DUAL_STACK_ADDRESSES = [
    { address: '172.67.140.229', family: 4 },
    { address: '2606:4700:3031::ac43:8ce5', family: 6 },
    { address: '104.21.81.81', family: 4 }
];

test('shared HTTP agents use the IPv4 DNS resolver for direct and keep-alive requests', async (t) => {
    const originalLookup = dns.lookup;
    const calls = [];
    dns.lookup = (hostname, options, callback) => {
        calls.push({ hostname, options });
        callback(null, '172.67.140.229', 4);
    };
    t.after(() => {
        dns.lookup = originalLookup;
    });

    const lookup = createIpv4Lookup(dns.lookup.bind(dns));
    assert.equal(httpAgent.options.lookup, dnsLookup);
    assert.equal(httpsAgent.options.lookup, dnsLookup);

    await new Promise((resolve, reject) => {
        lookup('api.subsource.net', {}, (error, address, family) => {
            try {
                assert.ifError(error);
                assert.equal(address, '172.67.140.229');
                assert.equal(family, 4);
                resolve();
            } catch (assertionError) {
                reject(assertionError);
            }
        });
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.family, 4);
});

test('IPv4 wrapper filters dual-stack all:true results without dropping IPv4 addresses', async () => {
    const calls = [];
    const lookup = createIpv4Lookup((hostname, options, callback) => {
        calls.push({ hostname, options });
        callback(null, DUAL_STACK_ADDRESSES);
    });

    const addresses = await new Promise((resolve, reject) => {
        lookup('api.subsource.net', { all: true }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });

    assert.deepEqual(addresses, [DUAL_STACK_ADDRESSES[0], DUAL_STACK_ADDRESSES[2]]);
    assert.equal(calls[0].options.all, true);
    assert.equal(calls[0].options.family, 0);
});

test('IPv4 wrapper preserves single-address and DNS failure contracts', async () => {
    const expected = Object.assign(new Error('DNS unavailable'), { code: 'ENOTFOUND' });
    let shouldFail = false;
    const calls = [];
    const lookup = createIpv4Lookup((hostname, options, callback) => {
        calls.push(options);
        if (shouldFail) {
            callback(expected);
            return;
        }
        callback(null, '172.67.140.229', 4);
    });

    const single = await new Promise((resolve, reject) => {
        lookup('api.subsource.net', {}, (error, address, family) => {
            if (error) reject(error);
            else resolve({ address, family });
        });
    });
    assert.deepEqual(single, { address: '172.67.140.229', family: 4 });
    assert.equal(calls[0].family, 4);

    shouldFail = true;
    const error = await new Promise((resolve) => {
        lookup('invalid.example', { all: true }, (lookupError, addresses) => {
            assert.equal(addresses, undefined);
            resolve(lookupError);
        });
    });
    assert.equal(error, expected);
});
