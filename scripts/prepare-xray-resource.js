const fs = require('fs');
const https = require('https');
const path = require('path');

const AdmZip = require('adm-zip');
const { resolveXrayAssetName } = require('../src/main/xray-assets');

const FALLBACK_VERSION = process.env.XRAY_FALLBACK_VERSION || 'v26.3.27';

function getArg(name) {
    const prefix = `--${name}=`;
    return process.argv
        .map(arg => String(arg || ''))
        .find(arg => arg.startsWith(prefix))
        ?.slice(prefix.length);
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'GeekEZ-Browser-CI' }, timeout: 10000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                fetchJson(res.headers.location).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Request timed out')));
    });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`Download failed with HTTP ${res.statusCode}`));
                return;
            }

            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', (error) => {
                fs.unlink(dest, () => {});
                reject(error);
            });
        });
        req.on('error', (error) => {
            fs.unlink(dest, () => {});
            reject(error);
        });
    });
}

async function resolveVersion() {
    const explicitVersion = getArg('version') || process.env.XRAY_VERSION;
    if (explicitVersion) return explicitVersion;
    try {
        const release = await fetchJson('https://api.github.com/repos/XTLS/Xray-core/releases/latest');
        return release?.tag_name || FALLBACK_VERSION;
    } catch (error) {
        return FALLBACK_VERSION;
    }
}

async function main() {
    const platform = getArg('platform') || process.env.GEEKEZ_TARGET_PLATFORM || process.platform;
    const arch = getArg('arch') || process.env.GEEKEZ_TARGET_ARCH || process.arch;
    const assetName = getArg('asset') || resolveXrayAssetName({ platform, arch });
    if (!assetName) {
        throw new Error(`Unsupported platform/arch: ${platform}-${arch}`);
    }

    const root = path.join(__dirname, '..');
    const resourcesBin = path.join(root, 'resources', 'bin');
    const binDir = path.join(resourcesBin, `${platform}-${arch}`);
    fs.mkdirSync(binDir, { recursive: true });

    const version = await resolveVersion();
    const zipPath = path.join(binDir, 'xray.zip');
    const downloadUrl = `https://github.com/XTLS/Xray-core/releases/download/${version}/${assetName}`;
    console.log(`[xray-resource] 下载 ${assetName} (${version})`);
    await downloadFile(downloadUrl, zipPath);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(binDir, true);
    fs.unlinkSync(zipPath);

    for (const file of ['geoip.dat', 'geosite.dat']) {
        const src = path.join(binDir, file);
        if (fs.existsSync(src)) {
            const dest = path.join(resourcesBin, file);
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            fs.renameSync(src, dest);
        }
    }
    for (const file of ['LICENSE', 'README.md']) {
        const target = path.join(binDir, file);
        if (fs.existsSync(target)) fs.unlinkSync(target);
    }

    const exePath = path.join(binDir, platform === 'win32' ? 'xray.exe' : 'xray');
    if (platform !== 'win32' && fs.existsSync(exePath)) {
        fs.chmodSync(exePath, 0o755);
    }
    console.log(`[xray-resource] 已准备 ${path.relative(root, exePath)}`);
}

main().catch((error) => {
    console.error('[xray-resource] 失败:', error.message || error);
    process.exit(1);
});
