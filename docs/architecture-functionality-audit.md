# 架构与业务功能审查问题记录

审查日期：2026-06-06

约束记录：本次审查未使用知识图谱；采用主线程静态审查、命令验证和子代理并行审查结果复核。仅记录当前工作树中能被文件或命令输出证明的问题。

结果摘要：已记录 47 条确认存在的问题，编号为 `AUDIT-001` 至 `AUDIT-047`。

验证记录：
- `npm test`：通过 22 项，跳过 1 项真实 Chromium smoke。
- `npm run build`：通过，生成 `out/main`、`out/preload`、`out/renderer`。

## 审查覆盖面

- 主进程与后端业务：`src/main/index.js`、`src/main/fingerprint.js`、`src/main/utils.js`、`src/main/chromium-path.js`、`src/main/close-behavior.js`、`src/main/profile-copy.js`、`src/main/xray-assets.js`。
- Electron 边界：`src/preload/index.js`、窗口创建配置、IPC handler、REST API server、内部密码同步服务。
- 渲染端状态与服务：`src/renderer/src/store/*.js`、`src/renderer/src/services/*.js`、`src/renderer/src/utils/*.js`。
- 渲染端组件：`src/renderer/src/App.vue`、`src/renderer/src/components/*.vue`、`src/renderer/index.html`。
- 配置、构建、测试与文档：`package.json`、`package-lock.json`、`electron.vite.config.js`、`setup.js`、`tests/*.js`、`README.md`、`docs/README_zh.md`。
- 资源与产物：`resources/bin`、`resources/puppeteer`、`dist/win-arm64-unpacked`、`dist/win-unpacked` 的关键资源路径。

## 已确认问题

### AUDIT-001：preload 暴露通用 IPC 调用，绕过 API 白名单

- 严重程度：高
- 位置：`src/preload/index.js:14-15`
- 证据：`contextBridge.exposeInMainWorld` 暴露 `invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)`，渲染层可传任意 channel。主进程同时注册了 `delete-profile`、`set-data-directory`、`import-full-backup`、`download-xray-update` 等高权限 handler。
- 影响：一旦渲染层出现 XSS、第三方脚本注入或任意前端代码执行，攻击面会从预期的有限 API 扩大到所有主进程 IPC 能力，包括本地文件、数据迁移、备份导入、外部二进制更新和 profile 删除。
- 建议修复：移除裸 `invoke`；在 preload 中只暴露明确白名单方法；主进程对高权限 handler 增加参数校验、权限分层和危险操作二次确认。

### AUDIT-002：`delete-profile` 未校验 profile 存在和路径边界，可被路径穿越触发递归删除

- 严重程度：严重
- 位置：`src/main/index.js:3166-3189`
- 证据：IPC handler 直接使用调用方传入的 `id` 计算 `path.join(DATA_PATH, id)`，然后执行 `fs.remove(profileDir)`；在删除前没有确认 `id` 属于 `profiles.json` 中的现有环境，也没有 `path.resolve` 后校验目标必须位于预期 profile 目录内。
- 影响：若通过通用 IPC 或其他调用路径传入 `..`、`..\\..` 等值，删除目标可能逃逸 `DATA_PATH/<profileId>` 范围，造成非目标目录被递归删除。
- 建议修复：先按 profile ID 查表，不存在立即失败；使用 `path.resolve(DATA_PATH, id)` 后校验目标必须位于 `DATA_PATH` 下且不是 `DATA_PATH` 本身；只允许删除已存在 profile 的专属目录。

### AUDIT-003：内部密码同步服务无鉴权且 CORS 全开放

- 严重程度：严重
- 位置：`src/main/index.js:211-233`
- 证据：内部 HTTP 服务设置 `Access-Control-Allow-Origin: *`，仅校验 `profileId` 和 `passwords` 是否存在，即写入 `path.join(DATA_PATH, data.profileId, 'passwords.json')`。
- 影响：本机任意网页都可以跨源 POST 到该本地端口覆盖环境密码；`profileId` 未验证是否属于现有 profile，也未做路径边界校验，存在写入到 `DATA_PATH` 外部 `passwords.json` 的风险。
- 建议修复：为扩展同步引入一次性 token 或扩展专用密钥；限制 Origin/Host；校验 profile ID 来自现有 profiles；校验 `passwords` schema；写入前做路径边界检查。

### AUDIT-004：公共 REST API 启用后无鉴权且 CORS 全开放

- 严重程度：高
- 位置：`src/main/index.js:165-199`、`src/main/index.js:1834-1846`、`src/main/index.js:2782-2796`
- 证据：公共 API server 设置 `Access-Control-Allow-Origin: *`；API 可通过设置自动启动或通过 IPC 启动；`handleApiRequest` 包含 profile 查询、创建、编辑、删除、启动、停止、导出完整备份和导入数据等接口。
- 影响：用户启用 API 后，本机浏览器中的任意网页可访问这些接口，读取环境信息、代理/指纹配置，甚至触发导出包含 Cookie/密码的备份数据。
- 建议修复：默认生成本地 API token；所有非只读接口强制鉴权；CORS 仅允许受信 Origin；删除、导入导出、启动等接口增加显式权限校验。

### AUDIT-005：Xray 更新 IPC 接受任意 URL 并替换后续执行的二进制

- 严重程度：严重
- 位置：`src/main/index.js:3049-3112`、`src/main/index.js:4182-4190`
- 证据：`download-xray-update` 接收调用方传入的 `url`，下载 zip 后递归查找 `xray.exe`/`xray` 并复制到 `BIN_PATH`；启动 profile 时使用该 `BIN_PATH` 执行 Xray。
- 影响：若渲染层或 IPC 调用方传入非官方 zip，应用会替换后续启动 profile 时执行的代理核心二进制。
- 建议修复：主进程只接受版本号或 asset id，不接受任意 URL；下载地址由可信源构造；校验官方 release asset、SHA256/签名、HTTPS 状态码和文件大小。

### AUDIT-006：Xray 更新会杀全局 `xray.exe` 并清空运行状态，但不关闭浏览器

- 严重程度：高
- 位置：`src/main/index.js:3057-3059`
- 证据：Windows 更新时执行 `taskkill /F /IM xray.exe`，随后直接 `activeProcesses = {}`；没有复用 `stopRunningProfile()`，也没有关闭对应浏览器、日志 fd 或广播 profile 停止状态。
- 影响：可能杀掉非本应用管理的 `xray.exe`；已启动的 profile 浏览器仍在运行但主进程失去跟踪，导致 UI、托盘菜单、清理逻辑和真实进程状态不一致。
- 建议修复：只遍历 `activeProcesses` 中记录的 PID；逐个调用统一停止流程，关闭浏览器、关闭日志 fd、广播状态后再更新二进制。

### AUDIT-007：应用退出路径未复用 profile 停止流程

- 严重程度：中
- 位置：`src/main/index.js:4745-4752`，对比 `src/main/index.js:2015-2031`
- 证据：`window-all-closed` 仅对 `activeProcesses` 执行 `forceKill(p.xrayPid)`；已有 `stopRunningProfile()` 会同时关闭浏览器、关闭日志 fd、删除运行状态、广播停止状态和刷新托盘。
- 影响：退出时可能留下浏览器进程、profile 锁、日志 fd 或不完整状态，和普通停止环境的行为不一致。
- 建议修复：退出前复用统一停止流程，抽取无 UI 版本的 `stopAllRunningProfiles()`，确保浏览器和 Xray 都被关闭。

### AUDIT-008：REST 删除 profile 只删元数据，不停进程也不删数据目录

- 严重程度：中
- 位置：`src/main/index.js:1623-1630`，对比 `src/main/index.js:3166-3218`
- 证据：`DELETE /api/profiles/:idOrName` 只从 `profiles` 数组过滤并写回 `profiles.json`，没有调用 `stopRunningProfile()`，也没有删除或移动 profile 数据目录；IPC 删除路径则会停止运行环境并清理目录。
- 影响：通过 REST 删除正在运行的环境时，浏览器/Xray 仍可能运行；磁盘数据残留，API/UI 状态与真实进程状态不一致。
- 建议修复：REST 删除复用同一 profile 删除服务函数；先校验存在，再停止运行实例，最后清理数据目录并刷新 UI/托盘。

### AUDIT-009：IPC 删除环境在目录清理失败时仍返回成功

- 严重程度：中
- 位置：`src/main/index.js:3174-3218`
- 证据：handler 先从 `profiles.json` 删除并写入，再尝试删除目录；如果三次删除失败且移动到 `_Trash_Bin` 也失败，只记录错误，最终仍 `return true`。
- 影响：UI 会认为环境已删除，但磁盘数据可能仍保留；如果删除失败原因是文件锁或权限问题，用户无法从返回值得知清理未完成。
- 建议修复：把元数据删除和目录清理做成可报告的结果；目录删除/移动失败时返回失败或部分成功状态；必要时保留 profile 元数据并提示用户关闭占用进程后重试。

### AUDIT-010：数据目录状态字段前后端不一致，重置入口会被错误隐藏

- 严重程度：中
- 位置：`src/main/index.js:3445-3450`、`src/renderer/src/store/useSettingsStore.js:51-55`、`src/renderer/src/components/SettingsModal.vue:359-371`
- 证据：主进程返回 `{ currentPath, defaultPath, isCustom }`；前端读取 `pathInfo.isDefault !== false` 赋给 `isDefaultDataPath`。因为响应里没有 `isDefault` 字段，`undefined !== false` 恒为 `true`。设置页只有 `!settingsStore.isDefaultDataPath` 时才显示重置按钮。
- 影响：即使当前是自定义数据目录，前端也会认为处于默认目录，导致“重置为默认数据目录”的入口被隐藏。
- 建议修复：统一字段语义，例如主进程返回 `isDefault: DATA_PATH === DEFAULT_DATA_PATH`，或前端改为 `isDefaultDataPath = !pathInfo.isCustom`；补充状态映射测试。

### AUDIT-011：Windows arm64 构建产物携带 x64 资源，运行时资源路径必然缺失

- 严重程度：高
- 位置：`package.json:48-60`、`src/main/index.js:73-75`、`dist/win-arm64-unpacked/resources/bin`
- 证据：Windows 打包目标包含 `arm64`；运行时按 `${process.platform}-${process.arch}` 拼出 `resources/bin/win32-arm64/xray.exe`；当前 `dist/win-arm64-unpacked/resources/bin` 只有 `win32-x64`，`resources/puppeteer/chrome` 只有 `win64-147.0.7727.50`。
- 影响：arm64 安装包启动带代理环境时找不到 `win32-arm64/xray.exe`；Chrome 资源也不是 arm64，核心启动链路在 arm64 发布包中不可用或不可预期。
- 建议修复：移除 Windows arm64 目标，或为 arm64 构建准备匹配的 Xray/Chrome 资源；增加打包后资源完整性检查。

### AUDIT-012：`postinstall` 会删除现有 Chrome 资源后依赖外网重新下载

- 严重程度：中
- 位置：`package.json:11`、`setup.js:200-217`、`setup.js:240-265`
- 证据：`npm install` 自动执行 `node setup.js`；脚本先拉取 Xray latest release，再在下载 Chrome 前执行 `fs.rmSync(DOWNLOAD_ROOT, { recursive: true, force: true })` 删除现有 `resources/puppeteer`。
- 影响：网络失败、GitHub API 变化或镜像异常会导致安装/构建不可复现；如果失败发生在删除 Chrome 资源之后，本地运行和打包资源会被破坏。
- 建议修复：将资源下载改为显式脚本或允许环境变量跳过；先下载到临时目录并校验成功后原子替换；固定 Xray 版本或记录锁定版本。

### AUDIT-013：默认测试跳过真实 Chromium 端到端验证

- 严重程度：中
- 位置：`package.json:9`、`tests/fingerprint-simulation.test.js:52`、`tests/fingerprint-simulation.test.js:188-190`
- 证据：`npm test` 运行 `node --test tests/*.test.js`；真实 Chromium smoke test 只有 `GEEKEZ_CHROMIUM_SMOKE=1` 时才运行。本轮测试结果为 22 通过、1 跳过。
- 影响：默认测试通过不能证明真实浏览器启动、CDP 覆盖、指纹注入、Service Worker/Canvas 行为和打包资源路径在运行时有效。
- 建议修复：新增 `test:smoke` 或 `test:e2e`；发布前强制运行真实 Chromium 覆盖，至少包含启动环境、指纹注入、代理链路和打包后资源解析。

### AUDIT-014：文档声明 Node.js v16+，但构建依赖要求 Node 20.19+ 或 22.12+

- 严重程度：中
- 位置：`README.md:70`、`docs/README_zh.md:70`、`package-lock.json:1894-1895`、`package-lock.json:3649-3650`、`package-lock.json:7780-7781`
- 证据：文档写 Node.js v16+；锁文件中 `@vitejs/plugin-vue`、`electron-vite`、`vite` 的 `engines.node` 均为 `^20.19.0 || >=22.12.0`。
- 影响：用户按文档使用 Node 16/18 时，安装或构建可能失败，文档前置条件与实际工具链不一致。
- 建议修复：更新 README 和中文文档前置要求；在 `package.json` 增加 `engines.node`，让包管理器尽早提示版本不满足。

### AUDIT-015：水印文档与默认实际行为不一致

- 严重程度：低
- 位置：`README.md:55`、`docs/README_zh.md:55`、`src/main/index.js:1902`、`src/main/index.js:3229`、`tests/fingerprint-simulation.test.js:141-146`
- 证据：文档称会在页面上方显示动态水印；默认设置实际为 `watermarkStyle: 'none'`；现有测试断言“页面水印默认关闭，不再隐式注入 DOM 标识”。
- 影响：用户会误以为环境名称默认显示，实际默认不注入页面标识，业务操作中的环境辨识预期不一致。
- 建议修复：文档改为“水印为可选功能，默认关闭”，并说明增强水印和顶部横幅需要手动选择。

### AUDIT-016：API 服务启动失败后仍会把配置持久化为启用

- 严重程度：高
- 位置：`src/renderer/src/store/useSettingsStore.js:85-98`、`src/main/index.js:1834-1849`
- 证据：`toggleApiServer(enabled)` 先把 `settings.enableApiServer = enabled` 保存到设置文件，然后才调用 `startApiServer`；主进程启动失败只返回 `{ success: false, error }`，store 只设置 `apiRunning = res.success`，没有回滚 `enableApiServer` 或持久化状态。
- 影响：UI 和配置会显示 API 已启用，但服务实际未运行；下次应用启动还会因为 `enableApiServer` 再次尝试自启并重复失败。
- 建议修复：启动成功后再持久化启用状态；失败时回滚 store 状态并把错误反馈给设置页。

### AUDIT-017：保存 API 端口失败会停止旧服务且仍提示成功

- 严重程度：高
- 位置：`src/renderer/src/store/useSettingsStore.js:107-117`、`src/renderer/src/components/SettingsModal.vue:617-623`
- 证据：`saveApiPort` 先保存新端口；若 API 已启用，先 `stopApiServer()` 再 `startApiServer(port)`，但不检查 `res.success`、不恢复旧端口和旧服务。设置页调用后无条件显示 `apiPortSaved`。
- 影响：端口被占用等场景会导致原 API 服务被停掉，新服务没有启动，用户却看到保存成功提示。
- 建议修复：保存前记录旧端口和运行状态；新端口启动失败时恢复旧端口和旧服务；组件按返回结果显示错误。

### AUDIT-018：代理测速“自动优选”只改内存，不会持久化实际启动使用的节点

- 严重程度：高
- 位置：`src/renderer/src/store/useProxyStore.js:131-137`、`src/main/index.js:4101-4140`
- 证据：`testCurrentGroup` 在单节点模式下将 `settings.value.selectedId` 改为测速最优节点，但没有调用 `saveSettings()`；启动 profile 时主进程重新从 `SETTINGS_FILE` 读取 `settings.selectedId` 并选择前置代理。
- 影响：UI 看起来已切换到最快节点，实际启动环境仍可能使用旧的持久化节点。
- 建议修复：自动优选后立即保存设置；保存失败时回滚选择并提示用户。

### AUDIT-019：单节点模式允许选中已禁用或已删除节点，启动时会静默回退到其他节点

- 严重程度：高
- 位置：`src/renderer/src/store/useProxyStore.js:141-156`、`src/renderer/src/store/useProxyStore.js:196-200`、`src/main/index.js:4135-4140`
- 证据：`deleteProxy`、`deleteSub` 不清理 `selectedId`；`selectProxy` 不校验节点是否存在或启用；启动逻辑只在 `enable !== false` 的节点中找 `selectedId`，找不到就使用 `active[0]`。
- 影响：状态栏可能显示单节点已选择，但实际启动使用另一个节点，甚至因为没有可用节点而不使用预期前置代理。
- 建议修复：删除/禁用节点时同步清理或重选 `selectedId`；选择节点时拒绝禁用节点或自动启用；启动时对无效 `selectedId` 明确报错。

### AUDIT-020：订阅编辑失败后本地状态已被污染

- 严重程度：中
- 位置：`src/renderer/src/store/useProxyStore.js:184-191`、`src/renderer/src/components/SubEditModal.vue:129-135`
- 证据：`updateSubscription` 先把 `settings.value.subscriptions[idx]` 合并为新数据，再调用 `syncSub`；如果同步失败直接返回错误，没有恢复旧订阅。组件会显示更新失败，但 store 中订阅已被改成新值。
- 影响：用户看到失败提示，但当前 UI 中订阅名称或 URL 已变，和磁盘配置不一致。
- 建议修复：先用候选订阅数据执行同步，成功后再提交到 store；失败时保持旧值不变。

### AUDIT-021：Profile 更新和删除结果未被 store 正确检查

- 严重程度：中
- 位置：`src/main/index.js:3135-3139`、`src/renderer/src/services/profile.service.js:78-83`、`src/renderer/src/services/profile.service.js:103-105`、`src/renderer/src/store/useProfileStore.js:125-159`
- 证据：主进程 `update-profile` 找不到 ID 时返回 `false`；`useProfileStore.updateProfile` 不检查返回值，直接 `loadProfiles()`。`profileService.deleteProfile` 捕获 IPC 异常后返回 `{ success:false }`，`useProfileStore.deleteProfile` 同样不检查结果。
- 影响：编辑可能在未保存时被当作成功处理；单个删除失败时也可能没有错误提示。
- 建议修复：service 将 `false` 或 `{ success:false }` 统一转成异常；store 和组件按失败路径保留弹窗并提示用户。

### AUDIT-022：IPC 未就绪时返回 `null`，调用方会进入非法状态

- 严重程度：中
- 位置：`src/renderer/src/services/ipc.service.js:10-16`、`src/renderer/src/store/useProfileStore.js:17-22`
- 证据：`ipcService.invoke` 在 `window.electronAPI.invoke` 不存在时返回 `null`；`loadProfiles` 将返回值赋给 `profiles.value`，随后执行 `profiles.value.map(...)`。
- 影响：IPC 桥未注入或异常时，Profile store 会进入 `profiles = null` 的非法状态，并在后续列表处理时继续报错。
- 建议修复：IPC 未就绪应抛出明确错误；列表类 service/store 对返回值做数组归一化，失败时保持旧状态或设置空数组并提示。

### AUDIT-023：缺失 i18n key 时 fallback 不生效，界面会显示内部 key

- 严重程度：低
- 位置：`src/renderer/i18n.js:250-255`、`src/renderer/src/components/ProxyModal.vue:249-257`、`src/renderer/src/components/ConfirmModal.vue:11-12`
- 证据：`window.t` 缺 key 时返回 key 字符串；组件使用 `window.t('batchAddSuccess') || ...`、`$t('ok') || 'OK'`，因此不会走 `||` fallback。检索确认 `ok`、`batchAddSuccess`、`batchAddFail` 等 key 未在 `src/renderer/i18n.js` 和 `src/renderer/locales/zh-CN.js` 中定义。
- 影响：按钮或提示可能直接显示 `ok`、`batchAddSuccess`、`batchAddFail` 这类内部 key。
- 建议修复：补齐缺失 key；或让 `t` 支持显式 fallback / 缺失时返回空值。

### AUDIT-024：代理导出被环境选择强制阻断

- 严重程度：中
- 位置：`src/renderer/src/components/ExportSelectModal.vue:121-128`、`src/main/index.js:3652-3658`
- 证据：`confirmExport()` 在任何导出类型下都先检查 `selectedIds.value.size === 0` 并返回；主进程 `type === 'proxies'` 只导出 `settings.preProxies` 和 `settings.subscriptions`，不依赖 profile。
- 影响：没有环境或用户取消选择所有环境时，无法导出前置代理配置，即使代理数据存在。
- 建议修复：仅在 `type !== 'proxies'` 时要求选择环境；代理导出允许空 `profileIds`。

### AUDIT-025：导出失败详情字段读取错误

- 严重程度：低
- 位置：`src/renderer/src/components/ExportSelectModal.vue:165-166`、`src/renderer/src/components/ExportSelectModal.vue:184-185`、`src/main/index.js:3802-3805`、`src/main/index.js:3660`
- 证据：导出失败提示读取 `res.message`，但主进程完整备份失败返回 `{ success: false, error: err.message }`，精简导出无数据时也返回 `{ success: false, error: 'No data to export' }`。
- 影响：完整备份或 YAML 导出失败时，用户可能只看到 `Unknown error`，真实错误被隐藏。
- 建议修复：前端提示兼容 `res.error || res.message || 'Unknown error'`。

### AUDIT-026：批量添加和编辑前置代理节点缺少格式校验

- 严重程度：中
- 位置：`src/renderer/src/store/useProxyStore.js:203-225`、`src/renderer/src/components/ProxyModal.vue:225-242`、`src/main/utils.js:424-440`
- 证据：批量添加只判断文本包含 `://` 或 `:` 就保存；编辑节点只校验 URL 非空；启动环境时 `generateXrayConfig()` 才对前置代理调用 `parseProxyLink()`，格式错误会抛出 `Pre-proxy configuration invalid`。
- 影响：用户可以保存无效前置代理，后续开启前置代理启动环境时才失败，错误延迟且定位困难。
- 建议修复：保存前复用主进程代理解析/校验逻辑；至少通过 IPC 调用同一校验函数并拒绝无效节点。

### AUDIT-027：App 残留全局点击诊断日志

- 严重程度：低
- 位置：`src/renderer/src/App.vue:119-122`
- 证据：`onMounted` 中无条件注册捕获阶段 `window.addEventListener('click', ...)`，每次点击都会 `console.log` 坐标和目标元素；没有 debug 开关，也没有卸载时移除。
- 影响：生产交互持续刷日志，暴露用户点击目标，降低调试可读性。
- 建议修复：删除该诊断监听，或仅在显式 debug 开关下启用，并在组件卸载时移除监听。

### AUDIT-028：公共 REST 导入接口调用不存在的 `generateUniqueName`

- 严重程度：中
- 位置：`src/main/index.js:1770-1822`
- 证据：`POST /api/import` 在 YAML 导入和加密备份导入路径中调用 `generateUniqueName(...)`；当前仓库检索只存在 `buildUniqueProfileName(profiles, baseName)`，没有 `generateUniqueName` 定义。
- 影响：公共 API 导入功能运行到该路径时会抛出 `ReferenceError`。YAML 导入异常会被内部 `catch (yamlErr) { }` 吞掉并继续要求加密备份密码；加密备份导入会返回“Invalid password or corrupted backup”，真实原因被掩盖。
- 建议修复：改用现有 `buildUniqueProfileName(profiles, baseName)`，并移除静默吞错；导入失败时返回真实错误分类。

### AUDIT-029：完整备份导入可通过备份内容写出数据目录

- 严重程度：严重
- 位置：`src/main/index.js:3830-3963`
- 证据：`import-full-backup` 从 `backupData.browserData` 取 key 作为 `profileId`，直接拼入 `path.join(DATA_PATH, profileId, 'browser_data')`；备份内 `fileName` 只要包含 `/` 或 `\\`，就直接 `path.join(profileDataDir, fileName)` 写入。两处都没有白名单校验，也没有 `path.resolve` 后确认目标仍在 `DATA_PATH/<profileId>/browser_data` 内。
- 影响：导入恶意 `.geekez` 备份时，`profileId` 或 `fileName` 中的 `..` 路径段可让写入目标逃逸数据目录，覆盖应用可写范围内的非备份目标文件。
- 建议修复：只允许还原 `backupData.profiles` 中存在且格式合法的 profile ID；文件名使用允许列表或拒绝路径分隔符；所有写入目标都用 `path.resolve` 做边界校验。

### AUDIT-030：数据目录迁移未阻止正在运行的环境

- 严重程度：高
- 位置：`src/main/index.js:3461-3509`
- 证据：`set-data-directory` 在 `migrate` 为真时直接复制 `profiles.json`、`settings.json` 和每个 profile 目录；迁移前没有检查 `activeProcesses`，也没有停止正在运行的 Chromium/Xray。
- 影响：运行中的浏览器仍在写入 profile 数据时执行目录复制，可能得到不一致快照；迁移接口仍返回 `{ success: true, requiresRestart: true }`，用户会误以为数据完整迁移。
- 建议修复：存在运行环境时拒绝迁移并提示用户先停止；或复用统一停止流程关闭全部环境后再迁移；复制完成后做关键文件完整性检查。

### AUDIT-031：内部密码同步固定端口失败后无替代通道或 UI 状态反馈

- 严重程度：中
- 位置：`src/main/index.js:207-209`、`src/main/index.js:2359-2360`、`src/main/index.js:2769-2777`
- 证据：内部密码同步服务固定监听 `12139`；扩展生成脚本也硬编码 `apiPort = 12139`；启动失败只在主进程 `console.error`，没有重新选择可用端口，也没有把失败状态传给渲染端或禁用密码同步功能。
- 影响：端口被占用时，GeekEZ Guard 的密码同步长期不可用，用户界面无法感知该功能实际失败。
- 建议修复：应用启动时分配可用本地端口并写入扩展脚本；端口监听失败要上报 UI，并在相关功能入口显示不可用原因。

### AUDIT-032：重新启动失联环境时绕过统一停止流程

- 严重程度：中
- 位置：`src/main/index.js:4069-4095`，对比 `src/main/index.js:2015-2031`
- 证据：`launchProfileHandler` 发现 `activeProcesses[profileId]` 中的 browser 已断开或唤醒失败时，只 `forceKill(proc.xrayPid)` 并 `delete activeProcesses[profileId]`；没有关闭 `proc.browser`、关闭 `proc.logFd`、广播 stopped 状态或刷新托盘。统一的 `stopRunningProfile()` 才包含这些清理动作。
- 影响：失联环境重新启动时可能残留日志 fd、浏览器状态和 UI/托盘运行状态，和手动停止环境的行为不一致。
- 建议修复：该分支改为调用共享的停止/清理 helper；即使 browser 已断开，也应关闭可关闭资源并广播状态。

### AUDIT-033：启动 profile 后未验证 Xray 实际就绪

- 严重程度：高
- 位置：`src/main/index.js:4179-4192`，对比 `src/main/index.js:2870-3012`
- 证据：启动环境时 `spawn(BIN_PATH, ['-c', xrayConfigPath])` 后只等待 300ms，没有监听启动期 `error`/`exit`，也没有检查本地 SOCKS 端口是否可用；同文件 `runProxyLatencyTest` 已有 `waitForLocalPortReady()` 用于等待本地端口就绪。
- 影响：Xray 启动失败或端口未监听时，后续 Chromium 仍可能带失效本地代理启动，并被应用标记为运行环境。
- 建议修复：启动 Xray 后监听 `error` 和早期 `exit`；复用 `waitForLocalPortReady(localPort)`；失败时关闭浏览器、关闭日志 fd、删除运行状态并返回明确错误。

### AUDIT-034：完整备份导入成功后进度状态不会结束

- 严重程度：中
- 位置：`src/main/index.js:3810-3813`、`src/main/index.js:3830-3963`
- 证据：`import-full-backup` 入口设置 `currentImportProgress = { percent: 0, ..., processing: true }`；成功路径在 `return { success: true, count: importedCount }` 前没有设置 `percent: 100` 或 `processing: false`。失败路径也没有统一 `finally` 收敛进度状态。
- 影响：调用 `get-import-progress` 的界面会继续看到 `processing: true`，可能持续显示导入仍在处理中。
- 建议修复：成功路径设置完成状态；失败路径在 `catch` 或 `finally` 中设置 `processing: false`，并保留失败消息。

### AUDIT-035：下载重定向路径泄漏文件句柄

- 严重程度：中
- 位置：`src/main/index.js:4758-4788`
- 证据：`downloadFile` 一进入 Promise 就 `fs.createWriteStream(dest)`；如果响应为 3xx，会递归调用 `downloadFile(response.headers.location, dest, onProgress)` 并直接 `return`，但没有关闭当前 `file`，也没有销毁当前 response。
- 影响：Xray 更新或 Chrome Store 扩展下载遇到重定向时可能留下空文件句柄；在 Windows 上还可能影响后续对同一路径的写入或删除。
- 建议修复：确认最终 200 响应后再创建写流；重定向时销毁响应并关闭当前资源；对非 2xx 响应返回明确错误。

### AUDIT-036：订阅内容无有效节点时仍被当作成功保存

- 严重程度：中
- 位置：`src/renderer/src/services/proxy.service.js:45-78`、`src/renderer/src/store/useProxyStore.js:172-181`、`src/renderer/src/components/SubEditModal.vue:121-128`
- 证据：`syncSubscription()` 解析订阅后即使 `count === 0` 也返回 `{ success: true, count, nodes: [] }`；`addSubscription()` 看到 `res.success` 后会保存订阅并返回成功；弹窗提示导入 `0` 个节点并关闭。
- 影响：空订阅或格式完全无效的订阅会被保存为有效订阅，后续自动同步和节点选择都没有实际可用节点。
- 建议修复：`count === 0` 时返回失败并携带错误信息；store 不保存该订阅；组件保持弹窗并提示订阅无有效节点。

### AUDIT-037：完整备份导入失败详情字段读取错误

- 严重程度：低
- 位置：`src/renderer/src/components/Toolbar.vue:157-169`、`src/main/index.js:3964-3969`
- 证据：完整备份导入失败时主进程返回 `{ success: false, error: ... }`；前端失败提示读取 `res.message || 'Unknown error'`，没有读取 `res.error`。
- 影响：密码错误、文件损坏或导入异常时，用户可能只看到 `Unknown error`，真实失败原因被隐藏。
- 建议修复：导入失败提示兼容 `res.error || res.message || 'Unknown error'`，并区分取消、密码错误和文件损坏。

### AUDIT-038：普通设置项保存失败会留下已切换的本地 UI 状态

- 严重程度：中
- 位置：`src/renderer/src/store/useSettingsStore.js:64-83`、`src/renderer/src/store/useSettingsStore.js:100-125`、`src/renderer/src/components/SettingsModal.vue:151-155`
- 证据：远程调试、自定义参数、UA/WebGL、关闭行为和水印设置均先修改 store 本地状态，再调用 `ipcService.saveSettings(settings)`；设置页对应开关直接调用这些 action，没有捕获失败并回滚。
- 影响：保存失败时 UI 会显示新状态，但磁盘设置仍是旧值；用户重启后看到的行为与当前 UI 不一致。
- 建议修复：先读取并保存候选设置，保存成功后再提交本地状态；失败时恢复旧状态并向用户显示错误。

### AUDIT-039：数据目录选择文案承诺的“不迁移仅更改路径”无法执行

- 严重程度：中
- 位置：`src/renderer/locales/zh-CN.js:168`、`src/renderer/i18n.js:166`、`src/renderer/src/components/SettingsModal.vue:630-648`、`src/renderer/src/store/useUIStore.js:143-153`
- 证据：确认文案说明“选择取消仅更改路径（不迁移）”；但 `handleSelectDataDirectory()` 只给 `showConfirm` 传入确认回调，取消时 `handleConfirm(false)` 不执行任何回调，因此不会调用 `setDataDirectory(path, false)`。
- 影响：用户无法通过该入口选择“只更改路径不迁移”；取消按钮实际等同于放弃操作。
- 建议修复：确认弹窗支持确认/取消双回调；或把“不迁移”做成独立按钮并明确调用 `setDataDirectory(path, false)`。

### AUDIT-040：重置数据目录失败时前端无提示

- 严重程度：低
- 位置：`src/main/index.js:3516-3526`、`src/renderer/src/components/SettingsModal.vue:650-657`
- 证据：主进程 `reset-data-directory` 失败会返回 `{ success: false, error: err.message }`；前端只处理 `res.success` 分支，没有 `else` 和 `catch`。
- 影响：重置默认数据目录失败时用户不会看到错误提示，也不知道需要重试或手动处理配置文件。
- 建议修复：增加失败分支和异常捕获，显示 `res.error` 或异常消息。

### AUDIT-041：检查更新确认框会被无按钮 Alert 遮挡

- 严重程度：中
- 位置：`src/renderer/src/components/Header.vue:79-90`、`src/renderer/src/components/AlertModal.vue:2-8`、`src/renderer/src/components/ConfirmModal.vue:2-12`
- 证据：`checkUpdates()` 先 `showAlert(t('checkingUpdate'), false)` 显示无关闭按钮的 Alert；发现更新后直接 `showConfirm()`。Alert 的 `z-index` 为 `2500`，Confirm 的 `z-index` 为 `2050`，且 Alert 未被关闭。
- 影响：更新确认框会被“正在检查更新”的无按钮 Alert 遮挡，用户无法点击确认更新。
- 建议修复：显示确认框前关闭或替换 Alert；统一模态栈层级，避免无按钮弹窗遮挡后续交互。

### AUDIT-042：批量创建环境不是原子操作，失败后会留下已创建环境

- 严重程度：中
- 位置：`src/renderer/src/components/CreateProfileModal.vue:296-355`、`src/main/index.js:1237-1247`
- 证据：创建弹窗按代理行逐个 `await profileStore.createProfile(safePayload)`；主进程每次 `save-profile` 会校验并立即写入该环境。若后续某一行代理无效，异常只中断循环并显示 `Create Failed`，前面已创建的环境不会回滚。
- 影响：用户看到批量创建失败，但列表中已经部分新增环境，批量操作结果与提示不一致。
- 建议修复：批量创建前先校验所有代理；或提供主进程批量创建接口，返回逐项成功/失败结果，并在 UI 中明确显示部分成功。

### AUDIT-043：YAML 导入无有效数据时静默无反馈

- 严重程度：低
- 位置：`src/main/index.js:3973-4031`、`src/renderer/src/components/Toolbar.vue:179-190`
- 证据：`import-data` 对无识别字段或没有文件选择时返回 `false`；`handleImportYaml()` 只有 `if (res)` 时才刷新列表并提示成功，`false` 分支没有任何提示。
- 影响：用户选择格式不匹配的 YAML 文件后界面没有成功或失败反馈，无法判断导入是否执行。
- 建议修复：主进程返回结构化 `{ success, cancelled, error }`；前端区分取消、无有效数据和异常，并显示对应提示。

### AUDIT-044：扩展“指定环境”列表只在设置组件挂载时加载一次

- 严重程度：中
- 位置：`src/renderer/src/App.vue:23`、`src/renderer/src/components/SettingsModal.vue:418-431`、`src/renderer/src/components/SettingsModal.vue:468-474`、`src/renderer/src/components/SettingsModal.vue:516-530`
- 证据：`SettingsModal` 在 `App.vue` 中常驻挂载；`onMounted()` 只调用一次 `loadProfileOptions()`；后续 `getScopeGroups()` 只读取缓存的 `profileOptions`，打开设置页时不会重新加载环境列表。
- 影响：创建、导入或删除环境后，扩展应用范围选择器可能显示过期环境列表，直到刷新应用。
- 建议修复：打开设置页或 profile 列表刷新后重新调用 `loadProfileOptions()`；或直接复用 `profileStore.profiles` 作为来源。

### AUDIT-045：发布更新元数据指向不存在的安装包文件名

- 严重程度：高
- 位置：`dist/latest.yml:3-12`、`dist`
- 证据：`latest.yml` 中 URL 为 `GeekEZ-Browser-1.5.1-win-x64.exe`、`GeekEZ-Browser-1.5.1-win-arm64.exe` 等带连字符文件名；当前 `dist` 实际文件为 `GeekEZ Browser-1.5.1-win-x64.exe`、`GeekEZ Browser-1.5.1-win-arm64.exe` 等带空格文件名，对应带连字符路径不存在。
- 影响：如果分发该 `latest.yml`，自动更新或下载入口会指向不存在的安装包。
- 建议修复：统一 `artifactName` 与 `latest.yml` 输出；重新生成发布元数据并加入产物文件存在性校验。

### AUDIT-046：`setup.js` 不会更新已存在的共享 Xray 资源

- 严重程度：中
- 位置：`setup.js:222-235`
- 证据：注释称“Only copy if not exists or source is newer”，但实现只在 `!fs.existsSync(destPath)` 时复制；随后无论是否复制都会 `fs.unlinkSync(srcPath)` 删除新解压的 `geoip.dat`、`geosite.dat`、`LICENSE`、`README.md`。
- 影响：本地已有共享资源时，后续安装不会更新这些 Xray 资源，即使新下载包里的资源更新了。
- 建议修复：按 mtime/hash 比较后替换，或每次校验通过后覆盖；删除源文件前确认目标已被更新。

### AUDIT-047：发布包包含源码、安装脚本、文档和大量 sourcemap

- 严重程度：中
- 位置：`package.json:23-27`、`dist/builder-effective-config.yaml:7-11`、`dist/win-unpacked/resources/app.asar`
- 证据：打包 `files` 使用 `"**/*"`，只排除根级 `"!*.map"`；`app.asar` 列表中包含 `\\src\\main\\index.js`、`\\src\\renderer\\src\\App.vue`、`\\setup.js`、`\\README.md` 以及大量嵌套 `*.js.map`。
- 影响：发布包体积显著增加，并暴露源码、构建脚本和 sourcemap 细节。
- 建议修复：收紧 `files` 到 `out/**`、必要运行时文件和生产依赖；使用 `!**/*.map`，并排除 `src/`、开发脚本和非运行文档。

## 本轮结论与剩余风险

- 已完成本轮主进程、渲染状态/服务、组件交互、构建/测试四个并行审查面的结果合并与去重。
- 后续仍可继续对真实运行时、打包安装包、完整 E2E 流程和安全修复方案做专项审查。
- 本文件会随着后续确认问题继续追加；推测项不会记录。
