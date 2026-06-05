const PROFILE_COPY_MODE = Object.freeze({
    FULL: 'full',
    PROFILE: 'profile'
});

const PROFILE_COPY_MODE_ALIASES = new Map([
    ['full', PROFILE_COPY_MODE.FULL],
    ['complete', PROFILE_COPY_MODE.FULL],
    ['profile', PROFILE_COPY_MODE.PROFILE],
    ['profile-only', PROFILE_COPY_MODE.PROFILE],
    ['profileonly', PROFILE_COPY_MODE.PROFILE],
    ['config', PROFILE_COPY_MODE.PROFILE]
]);

function normalizeProfileCopyMode(rawMode) {
    const mode = String(rawMode || '').trim().toLowerCase();
    if (!mode) {
        throw new Error('复制模式不能为空');
    }
    const normalized = PROFILE_COPY_MODE_ALIASES.get(mode);
    if (!normalized) {
        throw new Error(`不支持的复制模式: ${mode}`);
    }
    return normalized;
}

function normalizeProfileCopyIds(rawIds, { maxCount = 100 } = {}) {
    const source = Array.isArray(rawIds) ? rawIds : [rawIds];
    const ids = Array.from(new Set(
        source
            .map(id => String(id || '').trim())
            .filter(Boolean)
    ));

    if (ids.length === 0) {
        throw new Error('请选择要复制的环境');
    }
    if (ids.length > maxCount) {
        throw new Error(`单次最多复制 ${maxCount} 个环境`);
    }
    return ids;
}

function clonePlainObject(value) {
    return value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value))
        : {};
}

function buildProfileCopyInput(sourceProfile) {
    if (!sourceProfile || typeof sourceProfile !== 'object') {
        throw new Error('源环境无效');
    }

    const copyInput = clonePlainObject(sourceProfile);
    const baseName = String(sourceProfile.name || 'Profile').trim() || 'Profile';

    delete copyInput.id;
    delete copyInput.createdAt;
    delete copyInput.updatedAt;
    delete copyInput.debugPort;

    copyInput.name = `${baseName} 副本`;
    copyInput.isSetup = false;

    return copyInput;
}

module.exports = {
    PROFILE_COPY_MODE,
    normalizeProfileCopyMode,
    normalizeProfileCopyIds,
    buildProfileCopyInput
};
