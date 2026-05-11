import { icon } from './icons.js';

export default class Utils {
    static async execCommand(command) {
        return new Promise((resolve, reject) => {
            if (typeof ksu !== 'undefined' && typeof ksu.exec === 'function') {
                const callbackName = `exec_cb_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                window[callbackName] = function(errno, stdout, stderr) {
                    delete window[callbackName];
                    if (errno !== 0) reject(new Error(stderr || `Error ${errno}`));
                    else resolve(stdout);
                };
                ksu.exec(command, '{}', callbackName);
            } else {
                setTimeout(() => resolve(''), 100);
            }
        });
    }

    static async getModuleProp(moduleId, prop) {
        try {
            const result = await this.execCommand(
                `grep "^${prop}=" "/data/adb/modules/${moduleId}/module.prop" 2>/dev/null | cut -d'=' -f2-`
            );
            return result.trim() || null;
        } catch { return null; }
    }

    static async updateRootStatus() {}

    static async getStorageUsage(imgFile, mntDir) {
        try {
            const [mounted, exists] = await Promise.all([
                this.execCommand(`mountpoint -q "${mntDir}" && echo "1"`).then(() => true).catch(() => false),
                this.execCommand(`[ -f "${imgFile}" ] && echo "1"`).then(() => true).catch(() => false),
            ]);

            const base = { used: 0, total: 0, free: 0, percent: 0,
                usedFormatted: '0 B', totalFormatted: '0 B', freeFormatted: '0 B', mounted, exists };

            if (!exists) return base;

            const imgSize = await this.execCommand(`stat -c%s "${imgFile}" 2>/dev/null`).catch(() => '0');
            const total = parseInt(imgSize) || 0;
            let used = 0;

            if (mounted) {
                const df = await this.execCommand(`df -k "${mntDir}" 2>/dev/null | tail -1`).catch(() => '');
                const parts = df.trim().split(/\s+/);
                if (parts.length >= 3) used = (parseInt(parts[2]) || 0) * 1024;
            } else {
                used = Math.round(total * 0.11);
            }

            const free    = total - used;
            const percent = total > 0 ? Math.round((used / total) * 100) : 0;

            return {
                used, total, free, percent,
                usedFormatted:  this.formatBytes(used),
                totalFormatted: this.formatBytes(total),
                freeFormatted:  this.formatBytes(free),
                mounted, exists
            };
        } catch {
            return { used: 0, total: 0, free: 0, percent: 0,
                usedFormatted: 'Error', totalFormatted: 'Error', freeFormatted: 'Error',
                mounted: false, exists: false };
        }
    }

    static logToFile(message, level = 'INFO') {
        if (typeof ksu === 'undefined') return;
        const lvl = level.padEnd(5, ' ');
        const entry = `[${lvl} overlayfsx::webui] ${message}`.replace(/'/g, "'\\''").replace(/\n/g, ' ');
        ksu.exec(`echo '${entry}' >> "${CONFIG.LOG_FILE}"`, '{}', () => {});
    }

    static formatBytes(bytes, decimals = 1) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals < 0 ? 0 : decimals))} ${sizes[i]}`;
    }

    static showToast(message, type = 'info', duration = 3000) {
        const logLevel = type === 'warning' ? 'WARN' : 'INFO';

        const cleanMessage = message.replace(/<[^>]+>/g, '');
        this.logToFile(cleanMessage, logLevel);

        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const iconName = {
            success: 'check-circle',
            error:   'exclamation-circle',
            warning: 'exclamation-triangle',
            info:    'info-circle'
        }[type] || 'info-circle';

        toast.innerHTML = `${icon(iconName)}<span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastOut 0.25s cubic-bezier(0.4,0,0.2,1) forwards';
            setTimeout(() => toast.remove(), 250);
        }, duration);
    }

    static showModal(title, content, buttons = []) {
        return new Promise(resolve => {
            document.body.classList.add('modal-open');
            const container = document.getElementById('modal-container');

            const modal = document.createElement('div');
            modal.className = 'modal';

            const safeButtons = buttons.map(btn => ({ ...btn, resultString: String(btn.result) }));

            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                        <button class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">${content}</div>
                    ${safeButtons.length ? `
                    <div class="modal-footer">
                        ${safeButtons.map(btn => `
                            <button class="s-btn ${btn.type === 'danger' ? 'danger' : btn.type === 'primary' ? 'primary' : ''}"
                                    data-result="${btn.resultString}">
                                ${btn.text}
                            </button>
                        `).join('')}
                    </div>
                    ` : ''}
                </div>
            `;

            container.appendChild(modal);
            let resolved = false;

            const close = result => {
                if (resolved) return;
                resolved = true;
                modal.style.animation = 'fadeIn 0.2s reverse forwards';
                setTimeout(() => {
                    modal.remove();
                    document.body.classList.remove('modal-open');
                    resolve(result);
                }, 200);
            };

            modal.querySelector('.modal-close').addEventListener('click', () => close(null));
            modal.addEventListener('click', e => { if (e.target === modal) close(null); });

            modal.querySelectorAll('.modal-footer button').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const raw = btn.dataset.result;
                    close(raw === 'true' ? true : raw === 'false' ? false : raw === 'null' ? null : raw);
                });
            });
        });
    }

    static async confirmAction(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
        return this.showModal(
            title,
            `<div class="confirm-message">${message}</div>`,
            [
                { text: cancelText,  type: 'secondary', result: false },
                { text: confirmText, type: 'danger',    result: true  },
            ]
        );
    }

    static async checkRoot() {
        try {
            const r = await this.execCommand('id');
            return r.includes('uid=0');
        } catch { return false; }
    }

    static async checkKernelSU() {
        try {
            const r = await this.execCommand('ksud -V 2>/dev/null || echo "N/A"');
            return r.trim() !== 'N/A' && r.trim() !== '';
        } catch { return false; }
    }

    static async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast('Copied to clipboard', 'success');
            return true;
        } catch {
            const ta = Object.assign(document.createElement('textarea'), {
                value: text,
                className: 'hidden-textarea'
            });
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, 99999);
            try {
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                this.showToast(ok ? 'Copied' : 'Copy failed', ok ? 'success' : 'error');
                return ok;
            } catch {
                document.body.removeChild(ta);
                this.showToast('Copy failed', 'error');
                return false;
            }
        }
    }
}