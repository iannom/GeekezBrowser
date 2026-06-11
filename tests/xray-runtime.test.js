const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    USER_XRAY_DIRNAME,
    resolveXrayLaunchLayout,
    resolveXrayUpdateLayout
} = require('../src/main/xray-runtime');

function makeExecutable(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(filePath, 0o755);
    return filePath;
}

test('打包模式优先使用用户数据目录中的 Xray', (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-runtime-'));
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

    const resourcesBin = path.join(tempRoot, 'resources', 'bin');
    const userDataPath = path.join(tempRoot, 'userData');
    const userBinary = makeExecutable(path.join(userDataPath, USER_XRAY_DIRNAME, 'linux-x64', 'xray'));
    makeExecutable(path.join(resourcesBin, 'linux-x64', 'xray'));

    const layout = resolveXrayLaunchLayout({
        resourcesBin,
        userDataPath,
        isDev: false,
        platform: 'linux',
        arch: 'x64'
    });

    assert.equal(layout.binPath, userBinary);
    assert.equal(layout.assetDir, resourcesBin);
});

test('打包模式将 Xray 更新写入用户数据目录', (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-runtime-'));
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

    const resourcesBin = path.join(tempRoot, 'resources', 'bin');
    const userDataPath = path.join(tempRoot, 'userData');

    const layout = resolveXrayUpdateLayout({
        resourcesBin,
        userDataPath,
        isDev: false,
        platform: 'linux',
        arch: 'x64'
    });

    assert.equal(layout.binPath, path.join(userDataPath, USER_XRAY_DIRNAME, 'linux-x64', 'xray'));
    assert.equal(layout.assetDir, resourcesBin);
});

test('没有用户更新时回退到 bundled Xray', (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-runtime-'));
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

    const resourcesBin = path.join(tempRoot, 'resources', 'bin');
    const bundledBinary = makeExecutable(path.join(resourcesBin, 'linux-x64', 'xray'));

    const layout = resolveXrayLaunchLayout({
        resourcesBin,
        userDataPath: path.join(tempRoot, 'userData'),
        isDev: false,
        platform: 'linux',
        arch: 'x64'
    });

    assert.equal(layout.binPath, bundledBinary);
});

test('Windows 打包模式继续使用 bundled Xray 目录', (t) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-runtime-'));
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

    const resourcesBin = path.join(tempRoot, 'resources', 'bin');
    const bundledBinary = path.join(resourcesBin, 'win32-x64', 'xray.exe');

    const updateLayout = resolveXrayUpdateLayout({
        resourcesBin,
        userDataPath: path.join(tempRoot, 'userData'),
        isDev: false,
        platform: 'win32',
        arch: 'x64'
    });

    assert.equal(updateLayout.binPath, bundledBinary);
    assert.equal(updateLayout.binDir, path.dirname(bundledBinary));
});
