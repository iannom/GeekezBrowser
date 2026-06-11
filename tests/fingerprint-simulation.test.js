const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBundledSource(relativePath, exportMap) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    let source = fs.readFileSync(absolutePath, 'utf8');
    source = source.replace(/export\s*\{[^}]+\};?\s*$/, `module.exports = ${exportMap};`);

    const module = { exports: {} };
    const sandbox = {
        require,
        module,
        exports: module.exports,
        __dirname: path.dirname(absolutePath),
        __filename: absolutePath,
        process,
        console,
        Buffer,
        URL,
        URLSearchParams,
        Math
    };
    vm.runInNewContext(source, sandbox, { filename: absolutePath });
    return module.exports;
}

const { generateFingerprint, getInjectScript } = loadBundledSource(
    'src/main/fingerprint.js',
    '{ generateFingerprint, getInjectScript }'
);
const { generateXrayConfig } = loadBundledSource(
    'src/main/utils.js',
    '{ generateXrayConfig, parseProxyLink, getProxyRemark }'
);

function toPlainObject(value) {
    return JSON.parse(JSON.stringify(value));
}

function isSupportedTimezone(timezone) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
        return true;
    } catch (e) {
        return false;
    }
}

const shouldRunChromiumSmoke = process.env.GEEKEZ_CHROMIUM_SMOKE === '1';

test('WebGL 配置必须与运行平台保持一致', () => {
    const fingerprint = generateFingerprint({
        platform: 'Linux x86_64',
        uaMode: 'spoof',
        browserType: 'chrome',
        browserMajorVersion: 147,
        webglProfile: 'win_nvidia_rtx_3060'
    });

    assert.equal(fingerprint.platform, 'Linux x86_64');
    assert.equal(fingerprint.userAgentMetadata.platform, 'Linux');
    assert.match(fingerprint.userAgent, /X11; Linux x86_64/);
    assert.match(fingerprint.webglProfile, /^linux_/);
    assert.doesNotMatch(fingerprint.webgl.renderer, /Direct3D/i);
});

test('User-Agent Client Hints 平台字段不能被旧数据覆盖', () => {
    const fingerprint = generateFingerprint({
        platform: 'Win32',
        uaMode: 'spoof',
        browserType: 'chrome',
        browserMajorVersion: 147,
        userAgentMetadata: {
            brands: [{ brand: 'Microsoft Edge', version: '120' }],
            fullVersionList: [{ brand: 'Microsoft Edge', version: '120.0.0.0' }],
            platform: 'macOS',
            platformVersion: '99.0.0',
            architecture: 'arm',
            bitness: '32',
            mobile: true,
            model: 'iPhone',
            wow64: true
        }
    });

    assert.equal(fingerprint.userAgentMetadata.platform, 'Windows');
    assert.equal(fingerprint.userAgentMetadata.platformVersion, '10.0.0');
    assert.equal(fingerprint.userAgentMetadata.architecture, 'x86');
    assert.equal(fingerprint.userAgentMetadata.bitness, '64');
    assert.equal(fingerprint.userAgentMetadata.mobile, false);
    assert.equal(fingerprint.userAgentMetadata.model, '');
    assert.equal(fingerprint.userAgentMetadata.wow64, false);
    assert.deepEqual(toPlainObject(fingerprint.userAgentMetadata.brands), [
        { brand: 'Not.A/Brand', version: '99' },
        { brand: 'Chromium', version: '147' },
        { brand: 'Google Chrome', version: '147' }
    ]);
    assert.deepEqual(toPlainObject(fingerprint.userAgentMetadata.fullVersionList), [
        { brand: 'Not.A/Brand', version: '99.0.0.0' },
        { brand: 'Chromium', version: '147.0.0.0' },
        { brand: 'Google Chrome', version: '147.0.0.0' }
    ]);
});

test('Viewport 与 screen 分离，避免真实页面尺寸与 JS hook 冲突', () => {
    const fingerprint = generateFingerprint({
        screen: { width: 1366, height: 768 },
        uaMode: 'none'
    });
    const script = getInjectScript(fingerprint, 'Viewport Profile', 'none');

    assert.deepEqual(toPlainObject(fingerprint.screen), { width: 1366, height: 768 });
    assert.deepEqual(toPlainObject(fingerprint.window), { width: 1366, height: 768 });
    assert.deepEqual(toPlainObject(fingerprint.viewport), { width: 1366, height: 680 });
    assert.match(script, /const viewport = fp\.viewport/);
    assert.match(script, /defineValueGetter\(window, 'innerHeight', viewportHeight/);
});

test('城市式时区会归一化为 Chromium 支持的 IANA ID', () => {
    assert.equal(generateFingerprint({ timezone: 'America/Houston' }).timezone, 'America/Chicago');
    assert.equal(generateFingerprint({ timezone: 'Europe/Munich' }).timezone, 'Europe/Berlin');
    assert.equal(generateFingerprint({ timezone: 'Asia/Mumbai' }).timezone, 'Asia/Kolkata');
    assert.equal(generateFingerprint({ timezone: 'Not/A_Real_Zone' }).timezone, 'Auto');
});

test('渲染端时区和城市数据不能提交无效时区', () => {
    const timezones = require('../src/renderer/timezones').filter(tz => tz !== 'Auto (No Change)');
    const invalidTimezones = timezones.filter(tz => !isSupportedTimezone(tz));
    assert.deepEqual(invalidTimezones, []);

    const cities = require('../src/renderer/cities').filter(city => city.name !== 'Auto (IP Based)');
    const invalidCities = cities
        .filter(city => !isSupportedTimezone(city.timezone || city.name))
        .map(city => city.name);
    assert.deepEqual(invalidCities, []);
});

test('页面水印默认关闭，不再隐式注入 DOM 标识', () => {
    const script = getInjectScript(generateFingerprint({ uaMode: 'none' }), 'Test Profile');

    assert.match(script, /const watermarkStyle = 'none';/);
    assert.match(script, /\['none', 'off', 'hidden', 'disabled'\]/);
    assert.doesNotMatch(script, /const style = watermarkStyle \|\| 'enhanced'/);
});

test('Service Worker 和 WebGPU 默认保持真实环境兼容性', () => {
    const fingerprint = generateFingerprint({
        uaMode: 'spoof',
        platform: 'Linux x86_64',
        browserType: 'chrome',
        browserMajorVersion: 147
    });
    const script = getInjectScript(fingerprint, 'Linux Profile', 'none');
    const indexSource = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.js'), 'utf8');

    assert.equal(fingerprint.serviceWorkerMode, 'allow');
    assert.equal(fingerprint.webgpuMode, 'allow');
    assert.match(script, /const shouldIsolateServiceWorker = \['isolate', 'disable', 'disabled', 'block', 'bypass'\]\.includes\(serviceWorkerMode\)/);
    assert.match(indexSource, /if \(shouldDisableWebgpuForFingerprint\(profile\.fingerprint\)\) \{\s*disabledFeatures\.push\('WebGPU'\)/);
    assert.match(indexSource, /if \(shouldBypassServiceWorker\) \{\s*try \{\s*await session\.send\('Network\.setBypassServiceWorker'/);
});

test('显式隔离模式仍可禁用 Service Worker 和 WebGPU', () => {
    const fingerprint = generateFingerprint({
        serviceWorkerMode: 'isolate',
        webgpuMode: 'disable'
    });
    const script = getInjectScript(fingerprint, 'Strict Profile', 'none');

    assert.equal(fingerprint.serviceWorkerMode, 'isolate');
    assert.equal(fingerprint.webgpuMode, 'disable');
    assert.match(script, /Service Worker is disabled in this profile/);
});

test('注入脚本必须保持可解析，避免运行时整体失效', () => {
    const script = getInjectScript(generateFingerprint({
        uaMode: 'spoof',
        browserType: 'chrome',
        browserMajorVersion: 147
    }), 'Syntax Profile', 'none');

    assert.doesNotThrow(() => new Function(script));
    assert.match(script, /targetUa\.replace\(\/\^Mozilla\\\/\/, ''\)/);
});

test('预代理配置错误必须显式失败', () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        assert.throws(
            () => generateXrayConfig(
                'socks://127.0.0.1:1080',
                19000,
                { preProxies: [{ url: 'not-a-proxy' }] },
                { uaMode: 'spoof', browserType: 'chrome', browserMajorVersion: 147 }
            ),
            /Pre-proxy configuration invalid/
        );
    } finally {
        console.error = originalConsoleError;
    }
});

test('启动流程包含地理位置重放与恢复会话保护', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.js'), 'utf8');

    assert.match(indexSource, /function registerGeolocationPermissionReplay/);
    assert.match(indexSource, /page\.on\('framenavigated'/);
    assert.match(indexSource, /registerGeolocationPermissionReplay\(browser, page, session, geolocationOverride\)/);
    assert.match(indexSource, /function shouldDisableSessionRestoreForFingerprint/);
    assert.match(indexSource, /hasRestorableSession\(userDataDir\) &&\s*!shouldDisableSessionRestoreForFingerprint\(profile\.fingerprint\)/);
});

test('真实 Chromium smoke：环境模拟覆盖实际运行时', {
    skip: shouldRunChromiumSmoke ? false : '设置 GEEKEZ_CHROMIUM_SMOKE=1 后运行真实 Chromium smoke test'
}, async (t) => {
    const http = require('http');
    const puppeteer = require('puppeteer');
    const { resolveChromiumPath } = require('../src/main/chromium-path');
    const executablePath = resolveChromiumPath({
        basePath: path.join(__dirname, '..', 'resources', 'puppeteer')
    });

    if (!executablePath) {
        t.skip('未找到可执行 Chromium');
        return;
    }

    let requestHeaders = null;
    const server = http.createServer((req, res) => {
        if (req.url === '/sw.js') {
            res.writeHead(200, {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Service-Worker-Allowed': '/'
            });
            res.end(`
                self.addEventListener('message', (event) => {
                    event.source.postMessage({
                        userAgent: navigator.userAgent,
                        platform: navigator.platform,
                        hardwareConcurrency: navigator.hardwareConcurrency
                    });
                });
            `);
            return;
        }
        requestHeaders = req.headers;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<title>fingerprint-smoke</title><body>smoke</body>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const targetUrl = `http://127.0.0.1:${server.address().port}/`;

    const fingerprint = generateFingerprint({
        screen: { width: 1366, height: 768 },
        uaMode: 'spoof',
        browserType: 'chrome',
        browserMajorVersion: 147,
        hardwareConcurrency: 8,
        canvasNoise: { r: 7, g: 5, b: 3, a: 1 },
        noiseSeed: 1000
    });
    const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    t.after(async () => {
        await browser.close();
    });

    const drawCanvasDataUrl = async (targetPage) => {
        return await targetPage.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 48;
            const context = canvas.getContext('2d');
            context.textBaseline = 'top';
            context.font = '18px Arial';
            context.fillStyle = '#17324d';
            context.fillText('GeekEZ Canvas 123', 4, 6);
            return canvas.toDataURL();
        });
    };

    const nativePage = await browser.newPage();
    await nativePage.goto(targetUrl, { waitUntil: 'load' });
    const nativeCanvasDataUrl = await drawCanvasDataUrl(nativePage);
    await nativePage.close();

    const page = await browser.newPage();
    const session = await page.createCDPSession();
    await page.evaluateOnNewDocument(getInjectScript(fingerprint, 'Smoke Profile', 'none'));
    await session.send('Network.enable');
    await session.send('Emulation.setHardwareConcurrencyOverride', {
        hardwareConcurrency: fingerprint.hardwareConcurrency
    });
    await session.send('Network.setUserAgentOverride', {
        userAgent: fingerprint.userAgent,
        platform: fingerprint.platform,
        userAgentMetadata: {
            brands: fingerprint.userAgentMetadata.brands,
            fullVersionList: fingerprint.userAgentMetadata.fullVersionList,
            platform: fingerprint.userAgentMetadata.platform,
            platformVersion: fingerprint.userAgentMetadata.platformVersion,
            architecture: fingerprint.userAgentMetadata.architecture,
            bitness: fingerprint.userAgentMetadata.bitness,
            mobile: false,
            model: '',
            wow64: false,
            fullVersion: fingerprint.userAgentMetadata.uaFullVersion
        }
    });

    await page.goto(targetUrl, { waitUntil: 'load' });
    const canvasDataUrl = await drawCanvasDataUrl(page);

    const runtime = await page.evaluate(async () => ({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        serviceWorkerAvailable: !!navigator.serviceWorker,
        brands: navigator.userAgentData ? Array.from(navigator.userAgentData.brands) : [],
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        screen: {
            width: window.screen.width,
            height: window.screen.height
        },
        visualViewport: window.visualViewport ? {
            width: Math.round(window.visualViewport.width),
            height: Math.round(window.visualViewport.height),
            scale: window.visualViewport.scale
        } : null
    }));

    assert.equal(runtime.userAgent, fingerprint.userAgent);
    assert.equal(runtime.platform, fingerprint.platform);
    assert.equal(runtime.hardwareConcurrency, fingerprint.hardwareConcurrency);
    assert.notEqual(canvasDataUrl, nativeCanvasDataUrl);
    assert.equal(runtime.serviceWorkerAvailable, true);
    assert.match(requestHeaders['sec-ch-ua'] || '', /"Google Chrome";v="147"/);
    assert.equal(requestHeaders['sec-ch-ua-platform'], `"${fingerprint.userAgentMetadata.platform}"`);
    if (runtime.brands.length > 0) {
        assert.deepEqual(toPlainObject(runtime.brands), toPlainObject(fingerprint.userAgentMetadata.brands));
    }
    assert.equal(runtime.innerWidth, fingerprint.viewport.width);
    assert.equal(runtime.innerHeight, fingerprint.viewport.height);
    assert.equal(runtime.outerWidth, fingerprint.screen.width);
    assert.equal(runtime.outerHeight, fingerprint.screen.height);
    assert.deepEqual(toPlainObject(runtime.screen), toPlainObject(fingerprint.screen));
    assert.deepEqual(runtime.visualViewport, {
        width: fingerprint.viewport.width,
        height: fingerprint.viewport.height,
        scale: 1
    });
});
