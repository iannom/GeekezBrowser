const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const argvArch = process.argv
    .map(arg => String(arg || ''))
    .find(arg => arg.startsWith('--arch='))
    ?.slice('--arch='.length);
const arch = argvArch || process.env.npm_config_arch || process.env.GEEKEZ_TARGET_ARCH || process.arch;
const platformArch = `linux-${arch}`;
const resourcesBin = path.join(root, 'resources', 'bin');
const xrayPath = path.join(resourcesBin, platformArch, 'xray');
const geoipPath = path.join(resourcesBin, 'geoip.dat');
const geositePath = path.join(resourcesBin, 'geosite.dat');
const puppeteerRoot = path.join(root, 'resources', 'puppeteer');

function fail(message) {
    console.error(`[linux-resource-check] ${message}`);
    process.exitCode = 1;
}

function isExecutable(filePath) {
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return false;
        if (process.platform === 'win32') return true;
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch (error) {
        return false;
    }
}

function findLinuxChrome(dir, depth = 0) {
    if (!fs.existsSync(dir) || depth > 8) return null;
    let entries = [];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
        return null;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const found = findLinuxChrome(fullPath, depth + 1);
            if (found) return found;
            continue;
        }
        if (entry.name === 'chrome' && fullPath.includes(`chrome${path.sep}linux-`) && isExecutable(fullPath)) {
            return fullPath;
        }
    }

    return null;
}

if (!isExecutable(xrayPath)) {
    fail(`缺少可执行 Xray: ${path.relative(root, xrayPath)}`);
}

if (!fs.existsSync(geoipPath) || !fs.existsSync(geositePath)) {
    fail('缺少 geoip.dat 或 geosite.dat');
}

if (arch === 'x64') {
    const chromePath = findLinuxChrome(puppeteerRoot);
    if (!chromePath) {
        fail('缺少 Linux x64 Chrome for Testing，请先运行 npm run setup:resources 或 CI 下载步骤');
    }
} else {
    console.log(`[linux-resource-check] ${platformArch} 不校验 bundled Chrome，运行时将回退到系统 Chrome/Chromium`);
}

if (!process.exitCode) {
    console.log(`[linux-resource-check] ${platformArch} 资源校验通过`);
}
