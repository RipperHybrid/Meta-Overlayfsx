export default class SettingsPage {
    constructor(app) {
        this.app = app;
        this.data = {
            exists: false,
            mounted: false,
            imageSize: '—',
            imageUsage: '—',
            imageStatus: { mounted: false, exists: false },
            moduleId: 'meta-overlayfsx',
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
                <div class="s-row-static border-none pb-4">
                    <div class="s-row-body">
                        <div class="s-row-label">Image Size</div>
                        <div class="s-row-label-desc">Grow or shrink the modules image (${this.data.imageSize} now). Applied safely on the next reboot. Shrinking only works if your modules fit.${this.data.resizePending ? `<br><strong>Pending: ${this.app.utils.escapeHtml(this.data.resizePending)} MB at next reboot</strong>` : ''}</div>
                    </div>
                </div>
                <div class="s-actions pt-6">
                    <input type="number" id="resize-mb" class="s-input" min="256" max="65536" step="256" inputmode="numeric" placeholder="Size in MB (e.g. 4096)">
                    <button class="s-btn primary" id="resize-image" ${this.data.mounted ? '' : 'disabled'}>
                        ${this.app.icon('sync')} Schedule Resize
                    </button>
                </div>
            </div>
            ` : ''}

            ${imageStatus.exists ? this.buildBackupPlane() : ''}

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

    buildBackupPlane() {
        const u = this.app.utils;
        const b = this.data.backup || {};
        const when = b.exists && b.mtime ? new Date(b.mtime * 1000).toLocaleString() : '';
        const status = b.exists
            ? `Last backup: <strong>${u.escapeHtml(when)}</strong> (${u.escapeHtml(u.formatBytes(b.usedBytes))} stored)`
            : 'No backup yet.';
        const pending = [
            b.restorePending ? 'Restore from backup at next reboot' : '',
            b.backupPending ? 'New backup at next reboot' : ''
        ].filter(Boolean).map(t => `<br><strong>Pending: ${u.escapeHtml(t)}</strong>`).join('');
        return `
            <div class="s-plane">
                <div class="s-plane-head">
                    <div class="s-plane-icon icon-blue">
                        ${this.app.icon('layer-group')}
                    </div>
                    <div class="s-plane-title">Image Backup</div>
                </div>
                <div class="s-row-static border-none pb-4">
                    <div class="s-row-body">
                        <div class="s-row-label-desc">One verified backup of the modules image is kept outside the module folder. It is refreshed automatically on every update. Backup and restore run during the next boot, while the image is not in use.<br>${status}${pending}</div>
                    </div>
                </div>
                <div class="s-actions pt-6">
                    <button class="s-btn primary" id="backup-image">${this.app.icon('copy')} Backup</button>
                    <button class="s-btn danger" id="restore-backup" ${b.exists ? '' : 'disabled'}>${this.app.icon('undo')} Restore</button>
                </div>
            </div>`;
    }

    async scheduleBackupRequest(kind) {
        const u = this.app.utils;
        const isRestore = kind === 'restore';
        const ok = await u.confirmAction(
            isRestore ? 'Restore Backup' : 'Create Backup',
            isRestore
                ? 'Replace the current modules image with the backup at the next reboot? Changes made since the backup (installed or removed modules) are lost. The current image is kept as <strong>modules.img.replaced</strong>.'
                : 'Create a fresh backup of the modules image during the next reboot? The previous backup is replaced only after the new one is verified.',
            isRestore ? 'Restore' : 'Schedule'
        );
        if (!ok) return;
        try {
            const flag = isRestore ? 'restore_backup' : 'backup_now';
            await u.execCommand(`mkdir -p ${u.shQuote(CONFIG.CONF_DIR)} && : > ${u.shQuote(CONFIG.CONF_DIR + '/' + flag)}`);
            u.showToast(isRestore ? 'Restore scheduled. Reboot to apply.' : 'Backup scheduled. Reboot to apply.', 'success');
            await this.update();
        } catch (err) {
            u.showToast(`Failed: ${err.message}`, 'error');
        }
    }

    async getModuleId() {
        let moduleId = 'meta-overlayfsx';
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

    // Backup state: file info plus requests that are waiting for the next boot.
    async loadBackupInfo() {
        const info = { exists: false, mtime: 0, usedBytes: 0, backupPending: false, restorePending: false };
        try {
            const out = await this.app.utils.execCommand(`
                B=${this.app.utils.shQuote(CONFIG.BACKUP_FILE)}; C=${this.app.utils.shQuote(CONFIG.CONF_DIR)}
                if [ -f "$B" ]; then echo "bak:$(stat -c %Y "$B"):$(du -k "$B" | awk '{print $1}')"; fi
                [ -f "$C/backup_now" ] && echo "pending:backup"
                [ -f "$C/restore_backup" ] && echo "pending:restore"
                true
            `);
            for (const line of out.split('\n')) {
                const p = line.trim().split(':');
                if (p[0] === 'bak') {
                    info.exists = true;
                    info.mtime = parseInt(p[1], 10) || 0;
                    info.usedBytes = (parseInt(p[2], 10) || 0) * 1024;
                } else if (p[0] === 'pending' && p[1] === 'backup') info.backupPending = true;
                else if (p[0] === 'pending' && p[1] === 'restore') info.restorePending = true;
            }
        } catch { /* keep defaults */ }
        return info;
    }

    async loadData() {
        try {
            const utils = this.app.utils;
            const usage = await utils.getStorageUsage(CONFIG.IMG_FILE, CONFIG.MNT_DIR);
            let moduleId = await this.getModuleId();
            if (!utils.isValidId(moduleId)) moduleId = 'meta-overlayfsx';
            const targetPath = `${CONFIG.MODULES_DIR}/${moduleId}/remove`;
            const removePending = await utils.execCommand(`[ -f "${targetPath}" ] && echo "1"`).then(() => true).catch(() => false);

            this.data = {
                exists: usage.exists,
                mounted: usage.mounted,
                imageSize: usage.totalFormatted,
                imageUsage: `${usage.usedFormatted} / ${usage.totalFormatted} (${usage.percent}%)`,
                imageStatus: { mounted: usage.mounted, exists: usage.exists },
                resizePending: (await utils.execCommand(`tr -dc '0-9' < "${CONFIG.CONF_DIR}/resize_mb" 2>/dev/null`).catch(() => '')).trim(),
                backup: await this.loadBackupInfo(),
                moduleId,
                removePending
            };
        } catch {
            this.data = {
                exists: false, mounted: false,
                imageSize: 'Error', imageUsage: 'Error',
                imageStatus: { mounted: false, exists: false },
                moduleId: 'meta-overlayfsx',
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
        document.getElementById('resize-image')?.addEventListener('click', e => this.scheduleResize(e.currentTarget));
        document.getElementById('backup-image')?.addEventListener('click', () => this.scheduleBackupRequest('backup'));
        document.getElementById('restore-backup')?.addEventListener('click', () => this.scheduleBackupRequest('restore'));
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
            'Reclaim unused space from the modules image. The image is trimmed in place; if that is not supported a verified compacted copy is made instead.<br><br>Do not install or remove modules while this runs.',
            'Optimize'
        );
        if (!ok) return;

        const orig = btn.innerHTML;
        btn.innerHTML = `${this.app.icon('spinner', 'fa-spin')} Optimizing...`;
        btn.disabled = true;

        const q = v => this.app.utils.shQuote(v);
        try {
            this.app.utils.showToast('Starting storage optimization', 'info');
            // Step 1 (preferred): fstrim on the mounted loop device punches holes directly in
            // the image file. Nothing is copied or replaced, so nothing can be lost.
            // Step 2 (fallback): compacted copy, which only replaces the image after it has
            // been fully verified. Every step is chained: a failure aborts and the original stays.
            const cmd = `
                IMG=${q(CONFIG.IMG_FILE)}; MNT=${q(CONFIG.MNT_DIR)}; BIN=${q(CONFIG.BINARY)}
                mountpoint -q "$MNT" || { echo "Image is not mounted" >&2; exit 1; }
                sync
                before=$(du -k "$IMG" 2>/dev/null | awk '{print $1}')
                if command -v fstrim >/dev/null 2>&1 && fstrim "$MNT" >/dev/null 2>&1; then
                    after=$(du -k "$IMG" 2>/dev/null | awk '{print $1}')
                    echo "trim:$before:$after"
                    exit 0
                fi
                NEW="$IMG.new"
                rm -f "$NEW"
                fail() { rm -f "$NEW"; echo "$1" >&2; exit 1; }
                dd if=/dev/zero of="$MNT/zero.fill" bs=1M 2>/dev/null; rm -f "$MNT/zero.fill"; sync
                "$BIN" xcp "$IMG" "$NEW" --punch-hole || fail "Compaction failed"
                [ "$(stat -c%s "$IMG")" = "$(stat -c%s "$NEW")" ] || fail "Compacted image has a different size"
                if command -v e2fsck >/dev/null 2>&1; then
                    e2fsck -fn "$NEW" >/dev/null 2>&1 || fail "Verification failed (image busy), original left untouched. Try again right after a reboot."
                fi
                chmod 644 "$NEW" && chcon u:object_r:ksu_file:s0 "$NEW" 2>/dev/null
                mv "$NEW" "$IMG" || fail "Could not replace image"
                after=$(du -k "$IMG" 2>/dev/null | awk '{print $1}')
                echo "copy:$before:$after"
            `;
            const out = (await this.app.utils.execCommand(cmd)).trim().split('\n').pop();
            const [mode, before, after] = out.split(':');
            const freed = Math.max(0, (parseInt(before) || 0) - (parseInt(after) || 0)) * 1024;
            const msg = `Storage optimized, reclaimed ${this.app.utils.formatBytes(freed)}.`;
            this.app.utils.showToast(mode === 'copy' ? `${msg} Reboot to apply.` : msg, 'success');
            await this.update();
        } catch (err) {
            this.app.utils.logToFile(`Optimization engine failure: ${err.message}`, 'ERROR');
            this.app.utils.showToast(`Optimization failed: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    }

    async scheduleResize(btn) {
        const utils = this.app.utils;
        const input = document.getElementById('resize-mb');
        const raw = (input?.value || '').trim();
        if (!/^\d+$/.test(raw)) { utils.showToast('Enter a size in MB (digits only)', 'warning'); return; }

        const mb = parseInt(raw, 10);
        if (mb < 256 || mb > 65536) { utils.showToast('Size must be between 256 and 65536 MB', 'warning'); return; }

        const usage = await utils.getStorageUsage(CONFIG.IMG_FILE, CONFIG.MNT_DIR);
        const usedMb = Math.ceil(usage.used / 1048576);
        const minMb = Math.ceil(usedMb * 1.15) + 64;
        if (usage.exists && mb < minMb) {
            utils.showToast(`Too small: ${usedMb} MB are in use, choose at least ${minMb} MB`, 'warning');
            return;
        }

        const ok = await utils.confirmAction(
            'Resize Image',
            `Resize the modules image to <strong>${mb} MB</strong>? It is checked and resized during the next boot. Back up important data first.`,
            'Schedule'
        );
        if (!ok) return;

        btn.disabled = true;
        try {
            await utils.execCommand(
                `mkdir -p ${utils.shQuote(CONFIG.CONF_DIR)} && printf '%s\n' ${utils.shQuote(String(mb))} > ${utils.shQuote(CONFIG.CONF_DIR + '/resize_mb')}`
            );
            utils.showToast(`Resize to ${mb} MB scheduled. Reboot to apply.`, 'success');
            await this.update();
        } catch (err) {
            utils.showToast(`Failed: ${err.message}`, 'error');
        } finally {
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