const fs = require('fs');
const path = require('path');

const USER_XRAY_DIRNAME = 'xray-bin';

function getPlatformArch(platform = process.platform, arch = process.arch) {
    return `${platform}-${arch}`;
}

function getXrayExecutableName(platform = process.platform) {
    return platform === 'win32' ? 'xray.exe' : 'xray';
}

function buildXrayLayout({ rootDir, assetDir = rootDir, platform = process.platform, arch = process.arch, source }) {
    if (!rootDir) return null;
    const platformArch = getPlatformArch(platform, arch);
    const binDir = path.join(rootDir, platformArch);
    return {
        source,
        platformArch,
        assetDir,
        binDir,
        binPath: path.join(binDir, getXrayExecutableName(platform))
    };
}

function buildLegacyXrayLayout({ resourcesBin, platform = process.platform }) {
    if (!resourcesBin) return null;
    return {
        source: 'bundled-legacy',
        platformArch: null,
        assetDir: resourcesBin,
        binDir: resourcesBin,
        binPath: path.join(resourcesBin, getXrayExecutableName(platform))
    };
}

function getUserXrayRoot(userDataPath) {
    return userDataPath ? path.join(userDataPath, USER_XRAY_DIRNAME) : null;
}

function getXrayCandidateLayouts({
    resourcesBin,
    userDataPath,
    isDev = false,
    platform = process.platform,
    arch = process.arch
} = {}) {
    const layouts = [];
    const bundled = buildXrayLayout({ rootDir: resourcesBin, assetDir: resourcesBin, platform, arch, source: 'bundled' });
    const legacy = buildLegacyXrayLayout({ resourcesBin, platform });

    if (!isDev && platform === 'linux' && userDataPath) {
        const user = buildXrayLayout({
            rootDir: getUserXrayRoot(userDataPath),
            assetDir: resourcesBin,
            platform,
            arch,
            source: 'user'
        });
        if (user) layouts.push(user);
    }

    if (bundled) layouts.push(bundled);
    if (legacy) layouts.push(legacy);
    return layouts;
}

function isUsableXrayBinary(filePath, platform = process.platform) {
    if (!filePath) return false;
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return false;
        if (platform === 'win32') return true;
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch (error) {
        return false;
    }
}

function resolveXrayLaunchLayout(options = {}) {
    const platform = options.platform || process.platform;
    return getXrayCandidateLayouts(options).find(layout => isUsableXrayBinary(layout.binPath, platform)) || null;
}

function resolveXrayUpdateLayout({
    resourcesBin,
    userDataPath,
    isDev = false,
    platform = process.platform,
    arch = process.arch
} = {}) {
    if (isDev || platform !== 'linux') {
        return buildXrayLayout({ rootDir: resourcesBin, assetDir: resourcesBin, platform, arch, source: 'bundled' });
    }

    return buildXrayLayout({
        rootDir: getUserXrayRoot(userDataPath),
        assetDir: resourcesBin,
        platform,
        arch,
        source: 'user'
    });
}

module.exports = {
    USER_XRAY_DIRNAME,
    getPlatformArch,
    getXrayExecutableName,
    getXrayCandidateLayouts,
    isUsableXrayBinary,
    resolveXrayLaunchLayout,
    resolveXrayUpdateLayout
};
