export default class SettingsPage {
    constructor(app) {
        this.app = app;
        this.data = {
            exists: false,
            mounted: false,
            imageSize: '—',
            imageUsage: '—',
            imageStatus: { mounted: false, exists: false },
            moduleId: 'overlayfsx',
            removePending: false
        };
    }

    async render() {
        await this.loadData();
        return this.buildHTML();
    }

    buildHTML() {
        const { imageStatus, imageSize, imageUsage, removePending } = this.data;
        const mountVal = imageStatus.mounted ? 'Mounted'   : (imageStatus.exists ? 'Unmounted' : 'No Image');
        const mountCls = imageStatus.mounted ? 'ok'        : (imageStatus.exists ? 'warn'       : 'bad');

        return `
        <div class="settings-page">
            <div class="s-plane">
                <div class="s-plane-head">
                    <div class="s-plane-icon icon-blue">
                        ${this.app.icon('hdd')}
                    </div>
                    <div class="s-plane-title">Image Configuration</div>
                </div>
                <div class="s-row">
                    <div class="s-row-icon icon-blue">
                        ${this.app.icon('hdd')}
                    </div>
                    <div class="s-row-body">
                        <div class="s-row-label">Status</div>
                        <div class="s-row-sub">Overlay filesystem mount state</div>
                    </div>
                    <span class="s-row-value ${mountCls}" id="settings-mount-status">${mountVal}</span>
                </div>
                <div class="s-row">
                    <div class="s-row-icon icon-violet">
                        ${this.app.icon('layer-group')}
                    </div>
                    <div class="s-row-body">
                        <div class="s-row-label">Image Size</div>
                        <div class="s-row-sub">Allocated space for modules</div>
                    </div>
                    <span class="s-row-value" id="settings-image-size">${imageSize}</span>
                </div>
                <div class="s-row border-none">
                    <div class="s-row-icon icon-green">
                        ${this.app.icon('compress')}
                    </div>
                    <div class="s-row-body">
                        <div class="s-row-label">Storage Usage</div>
                        <div class="s-row-sub">Used / Total</div>
                    </div>
                    <span class="s-row-value" id="settings-usage">${imageUsage}</span>
                </div>
            </div>

            ${imageStatus.mounted ? `
            <div class="s-plane">
                <div class="s-plane-head">
                    <div class="s-plane-icon icon-green">
                        ${this.app.icon('compress')}
                    </div>
                    <div class="s-plane-title">Storage</div>
                </div>
                <div class="s-row-static border-none pb-4">
                    <div class="s-row-body">
                        <div class="s-row-label-desc">Compacts the overlayfsx image file to reclaim empty space left behind by deleted or updated modules.</div>
                    </div>
                </div>
                <div class="s-actions pt-6">
                    <button class="s-btn primary full" id="optimize-image" ${this.data.mounted ? '' : 'disabled'}>
                        ${this.app.icon('compress')} Optimize Storage
                    </button>
                </div>
            </div>
            ` : ''}

            <div class="s-plane">
                <div class="s-plane-head">
                    <div class="s-plane-icon icon-violet">
                        ${this.app.icon('file-alt')}
                    </div>
                    <div class="s-plane-title">System Logs</div>
                </div>
                <div class="s-row-static border-none">
                    <div class="s-row-icon icon-gray">
                        ${this.app.icon('code')}
                    </div>
                    <div class="s-row-body">
                        <div class="s-row-label">Log File</div>
                    </div>
                </div>
                <div class="path-box">
                    <span class="path-box-text">${CONFIG.LOG_FILE}</span>
                    <button class="path-copy" data-copy="${CONFIG.LOG_FILE}" title="Copy">
                        ${this.app.icon('copy')}
                    </button>
                </div>
                <div class="s-actions">
                    <button class="s-btn primary" id="view-logs">
                        ${this.app.icon('eye')} View
                    </button>
                    <button class="s-btn danger" id="clear-logs">
                        ${this.app.icon('trash')} Clear
                    </button>
                </div>
            </div>

            <div class="s-plane">
                <div class="s-plane-head">
                    <div class="s-plane-icon icon-blue">
                        ${this.app.icon('folder')}
                    </div>
                    <div class="s-plane-title">Paths</div>
                </div>
                ${[
                    { label: 'Image File',  path: CONFIG.IMG_FILE },
                    { label: 'Mount Point', path: CONFIG.MNT_DIR },
                    { label: 'Modules Dir', path: CONFIG.MODULES_DIR },
                    { label: 'Binary',      path: CONFIG.BINARY },
                ].map(item => `
                    <div class="s-row-static">
                        <div class="s-row-body">
                            <div class="s-row-sub mb-2">${item.label}</div>
                        </div>
                    </div>
                    <div class="path-box">
                        <span class="path-box-text">${item.path}</span>
                        <button class="path-copy" data-copy="${item.path}" title="Copy">
                            ${this.app.icon('copy')}
                        </button>
                    </div>
                `).join('')}
            </div>

            <div class="s-plane ${removePending ? '' : 'danger'}" id="meta-uninstall-plane">
                <div class="s-plane-head">
                    <div class="s-plane-icon ${removePending ? 'icon-green' : 'icon-red'}" id="meta-uninstall-icon">
                        ${this.app.icon(removePending ? 'undo' : 'trash')}
                    </div>
                    <div class="s-plane-title ${removePending ? 'text-green' : 'text-red-dim'}" id="meta-uninstall-title">
                        ${removePending ? 'Restore Meta OverlayFS' : 'Uninstall Meta OverlayFS'}
                    </div>
                </div>
                <div class="s-row-static border-none pb-4">
                    <div class="s-row-body">
                        <div class="s-row-label-desc" id="meta-uninstall-desc">
                            ${removePending
                                ? 'The core module is queued for removal. Restore it to cancel the uninstallation.'
                                : 'Mark the core Meta OverlayFS module for removal. This disables the entire overlay system on next reboot.'}
                        </div>
                    </div>
                </div>
                <div class="s-actions pt-6">
                    <button class="s-btn ${removePending ? 'success' : 'danger'} full" id="uninstall-meta-btn">
                        ${this.app.icon(removePending ? 'undo' : 'trash')} <span id="meta-uninstall-btn-txt">${removePending ? 'Cancel Uninstall' : 'Uninstall Meta OverlayFS'}</span>
                    </button>
                </div>
            </div>
        </div>
        `;
    }

    async getModuleId() {
        let moduleId = 'overlayfsx';
        try {
            if (typeof ksu !== 'undefined' && typeof ksu.moduleInfo === 'function') {
                const info = ksu.moduleInfo();
                const parsedInfo = typeof info === 'string' ? JSON.parse(info) : info;
                if (parsedInfo && parsedInfo.id) {
                    moduleId = parsedInfo.id;
                }
            }
        } catch (err) {}
        return moduleId;
    }

    async loadData() {
        try {
            const utils = this.app.utils;
            const usage = await utils.getStorageUsage(CONFIG.IMG_FILE, CONFIG.MNT_DIR);
            const moduleId = await this.getModuleId();
            const targetPath = `${CONFIG.MODULES_DIR}/${moduleId}/remove`;
            const removePending = await utils.execCommand(`[ -f "${targetPath}" ] && echo "1"`).then(() => true).catch(() => false);

            this.data = {
                exists: usage.exists,
                mounted: usage.mounted,
                imageSize: usage.totalFormatted,
                imageUsage: `${usage.usedFormatted} / ${usage.totalFormatted} (${usage.percent}%)`,
                imageStatus: { mounted: usage.mounted, exists: usage.exists },
                moduleId,
                removePending
            };
        } catch {
            this.data = {
                exists: false, mounted: false,
                imageSize: 'Error', imageUsage: 'Error',
                imageStatus: { mounted: false, exists: false },
                moduleId: 'overlayfsx',
                removePending: false
            };
        }
    }

    escapeHTML(str) {
        return str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));
    }

    formatLogs(raw) {
        if (!raw || raw === 'No logs available') return raw;
        return raw.split('\n').map(line => {
            const safeLine = this.escapeHTML(line);
            if (safeLine.includes('[WARN ')) return `<span class="log-warn">${safeLine}</span>`;
            if (safeLine.includes('[ERROR ')) return `<span class="log-err">${safeLine}</span>`;
            if (safeLine.includes('[INFO ')) return `<span class="log-info">${safeLine}</span>`;
            return safeLine;
        }).join('\n');
    }

    async bindEvents() {
        document.getElementById('view-logs')?.addEventListener('click', () => this.viewLogs());
        document.getElementById('clear-logs')?.addEventListener('click', async () => {
            const ok = await this.app.utils.confirmAction('Clear Logs', 'Delete all log entries? This cannot be undone.', 'Clear');
            if (ok) await this.clearLogs();
        });

        document.getElementById('optimize-image')?.addEventListener('click', e => this.optimizeStorage(e.currentTarget));
        document.getElementById('uninstall-meta-btn')?.addEventListener('click', () => this.uninstallMetaModule());

        document.querySelectorAll('.path-copy').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                await this.app.utils.copyToClipboard(btn.dataset.copy);
            });
        });
    }

    async uninstallMetaModule() {
        const { moduleId, removePending } = this.data;
        const targetPath = `${CONFIG.MODULES_DIR}/${moduleId}/remove`;

        if (removePending) {
            try {
                await this.app.utils.execCommand(`rm -f "${targetPath}"`);
                this.app.utils.showToast(`Meta OverlayFS restored`, 'success');
                await this.update();
            } catch (err) {
                this.app.utils.logToFile(`Restoration failed: ${err.message}`, 'ERROR');
                this.app.utils.showToast(`Failed: ${err.message}`, 'error');
            }
        } else {
            const ok = await this.app.utils.confirmAction(
                'Confirm Uninstall',
                `Are you sure you want to uninstall the core <strong>Meta OverlayFS</strong> module?<br><br>
                 The overlay system will be completely disabled and removed on your next reboot.`,
                'Yes, Uninstall'
            );

            if (!ok) return;

            try {
                await this.app.utils.execCommand(`touch "${targetPath}"`);
                this.app.utils.showToast(`Meta OverlayFS queued for removal on reboot`, 'success');
                await this.update();
            } catch (err) {
                this.app.utils.logToFile(`Uninstall trigger failure: ${err.message}`, 'ERROR');
                this.app.utils.showToast(`Failed: ${err.message}`, 'error');
            }
        }
    }

    async optimizeStorage(btn) {
        const ok = await this.app.utils.confirmAction(
            'Optimize Storage',
            'Compact the modules image to reclaim unused space. This creates a temporary copy and may take a minute.<br><br><strong>Reboot required</strong> for size changes to appear in file managers.',
            'Optimize'
        );
        if (!ok) return;

        const orig = btn.innerHTML;
        btn.innerHTML = `${this.app.icon('spinner', 'fa-spin')} Optimizing...`;
        btn.disabled = true;

        try {
            this.app.utils.showToast('Starting storage optimization', 'info');
            const cmd = `
                dd if=/dev/zero of="${CONFIG.MNT_DIR}/zero.fill" bs=1M 2>/dev/null
                rm -f "${CONFIG.MNT_DIR}/zero.fill"
                "${CONFIG.BINARY}" xcp "${CONFIG.IMG_FILE}" "${CONFIG.IMG_FILE}.new" --punch-hole
                mv "${CONFIG.IMG_FILE}.new" "${CONFIG.IMG_FILE}"
                chmod 644 "${CONFIG.IMG_FILE}"
                chcon u:object_r:ksu_file:s0 "${CONFIG.IMG_FILE}"
            `;
            await this.app.utils.execCommand(cmd);
            this.app.utils.showToast('Storage optimized! Reboot to apply changes.', 'success');
            await this.update();
        } catch (err) {
            this.app.utils.logToFile(`Optimization engine failure: ${err.message}`, 'ERROR');
            this.app.utils.showToast(`Optimization failed: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    }

    async viewLogs() {
        try {
            const logs = await this.app.utils.execCommand(`cat "${CONFIG.LOG_FILE}" 2>/dev/null || echo "No logs available"`);
            const formattedLogs = this.formatLogs(logs);

            const promise = this.app.utils.showModal(
                'System Logs',
                `
                <div class="log-viewer-modal">
                    <div class="log-controls">
                        <button class="s-btn" id="refresh-logs">${this.app.icon('sync')} Refresh</button>
                        <button class="s-btn" id="copy-logs">${this.app.icon('copy')} Copy</button>
                    </div>
                    <div class="log-content"><pre id="log-content">${formattedLogs}</pre></div>
                </div>
                `,
                [{ text: 'Close', type: 'secondary', result: 'close' }]
            );

            setTimeout(() => {
                document.getElementById('refresh-logs')?.addEventListener('click', async e => {
                    e.stopPropagation();
                    const btn = e.currentTarget;
                    const orig = btn.innerHTML;
                    btn.innerHTML = `${this.app.icon('spinner', 'fa-spin')} Refreshing`;
                    btn.disabled = true;
                    try {
                        const newLogs = await this.app.utils.execCommand(`cat "${CONFIG.LOG_FILE}" 2>/dev/null || echo "No logs available"`);
                        const pre = document.getElementById('log-content');
                        if (pre) pre.innerHTML = this.formatLogs(newLogs);
                        this.app.utils.showToast('Refreshed log view', 'success');
                    } catch { this.app.utils.showToast('Refresh failed', 'error'); }
                    btn.innerHTML = orig;
                    btn.disabled = false;
                });

                document.getElementById('copy-logs')?.addEventListener('click', async e => {
                    e.stopPropagation();
                    const pre = document.getElementById('log-content');
                    if (pre) await this.app.utils.copyToClipboard(pre.innerText);
                });
            }, 100);

            await promise;
        } catch (err) {
            this.app.utils.showToast(`Failed to read logs: ${err.message}`, 'error');
        }
    }

    async clearLogs() {
        try {
            await this.app.utils.execCommand(`> "${CONFIG.LOG_FILE}"`);
            this.app.utils.showToast('System logs cleared', 'success');
        } catch (err) {
            this.app.utils.showToast(`Failed: ${err.message}`, 'error');
        }
    }

    async update() {
        await this.loadData();
        const content = document.getElementById('page-content');
        if (content) content.innerHTML = this.buildHTML();
        await this.bindEvents();
    }
}