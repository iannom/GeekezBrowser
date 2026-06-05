const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PROFILE_COPY_MODE,
    normalizeProfileCopyMode,
    normalizeProfileCopyIds,
    buildProfileCopyInput
} = require('../src/main/profile-copy');

test('normalizeProfileCopyMode accepts supported copy modes and aliases', () => {
    assert.equal(normalizeProfileCopyMode('full'), PROFILE_COPY_MODE.FULL);
    assert.equal(normalizeProfileCopyMode('profile'), PROFILE_COPY_MODE.PROFILE);
    assert.equal(normalizeProfileCopyMode('profile-only'), PROFILE_COPY_MODE.PROFILE);
});

test('normalizeProfileCopyMode rejects empty and unknown modes', () => {
    assert.throws(() => normalizeProfileCopyMode(''), /复制模式不能为空/);
    assert.throws(() => normalizeProfileCopyMode('unknown'), /不支持的复制模式/);
});

test('normalizeProfileCopyIds removes duplicates and validates bounds', () => {
    assert.deepEqual(normalizeProfileCopyIds([' a ', 'b', 'a', '', null]), ['a', 'b']);
    assert.throws(() => normalizeProfileCopyIds([]), /请选择要复制的环境/);
    assert.throws(() => normalizeProfileCopyIds(['a', 'b'], { maxCount: 1 }), /单次最多复制 1 个环境/);
});

test('buildProfileCopyInput removes identity fields and prepares a copy name', () => {
    const input = buildProfileCopyInput({
        id: 'source-id',
        name: '测试环境',
        createdAt: 100,
        updatedAt: 200,
        debugPort: 3333,
        isSetup: true,
        proxyStr: 'direct://',
        fingerprint: { screen: { width: 1280, height: 720 } }
    });

    assert.equal(input.id, undefined);
    assert.equal(input.createdAt, undefined);
    assert.equal(input.updatedAt, undefined);
    assert.equal(input.debugPort, undefined);
    assert.equal(input.isSetup, false);
    assert.equal(input.name, '测试环境 副本');
    assert.deepEqual(input.fingerprint.screen, { width: 1280, height: 720 });
});
