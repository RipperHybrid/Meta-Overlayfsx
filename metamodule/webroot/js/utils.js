class Utils {
    static async execCommand(command) {
        return new Promise((resolve, reject) => {
            if (typeof ksu !== 'undefined' && typeof ksu.exec === 'function') {
                const callbackName = `exec_callback_${Date.now()}`;
                window[callbackName] = function(errno, stdout, stderr) {
                    delete window[callbackName];
                    
                    if (errno !== 0) {
                        reject(new Error(stderr || `Error ${errno}`));
                    } else {
                        resolve(stdout);
                    }
                };
                ksu.exec(command, "{}", callbackName);
            } else {
                setTimeout(() => resolve(''), 100);
            }
        });
    }

    static async getModuleProp(moduleId, prop) {
        try {
            const propFile = `/data/adb/modules/${moduleId}/module.prop`;
            const result = await this.execCommand(`grep "^${prop}=" "${propFile}" 2>/dev/null | cut -d'=' -f2-`);
            return result.trim() || null;
        } catch {
            return null;
        }
    }

    static async updateRootStatus() {
        const hasRoot = await Utils.checkRoot();
        const ksuInstalled = await Utils.checkKernelSU();
    
        const statusEl = document.getElementById('root-status');
        const textEl = document.getElementById('root-text');
    
        if (!statusEl || !textEl) return;
    
        if (ksuInstalled) {
            statusEl.className = 'status-badge status-success';
            textEl.textContent = 'KernelSU';
        } else if (hasRoot) {
            statusEl.className = 'status-badge status-warning';
            textEl.textContent = 'Root';
        } else {
            statusEl.className = 'status-badge status-error';
            textEl.textContent = 'No Root';
        }
    }

    static async getStorageUsage(imgFile, mntDir) {
        try {
            const mounted = await Utils.execCommand(`mountpoint -q "${mntDir}" && echo "1"`).then(() => true).catch(() => false);
            const exists = await Utils.execCommand(`[ -f "${imgFile}" ] && echo "1"`).then(() => true).catch(() => false);

            let result = {
                used: 0,
                total: 0,
                free: 0,
                percent: 0,
                usedFormatted: '0B',
                totalFormatted: '0B',
                freeFormatted: '0B',
                mounted: mounted,
                exists: exists
            };

            if (exists) {
                const imgSize = await Utils.execCommand(`stat -c%s "${imgFile}" 2>/dev/null`).catch(() => '0');
                const total = parseInt(imgSize) || 0;
                let used = 0;

                if (mounted) {
                    const dfOutput = await Utils.execCommand(`df -k "${mntDir}" 2>/dev/null | tail -1`).catch(() => '');
                    if (dfOutput && dfOutput.trim()) {
                        const parts = dfOutput.trim().split(/\s+/);
                        if (parts.length >= 4) {
                            used = (parseInt(parts[2]) || 0) * 1024;
                        }
                    }
                } else {
                    used = Math.round(total * 0.11);
                }

                const free = total - used;
                const percent = total > 0 ? Math.round((used / total) * 100) : 0;

                result = {
                    used,
                    total,
                    free,
                    percent,
                    usedFormatted: Utils.formatBytes(used),
                    totalFormatted: Utils.formatBytes(total),
                    freeFormatted: Utils.formatBytes(free),
                    mounted,
                    exists
                };
            }
            return result;
        } catch (e) {
            console.error("Storage check failed", e);
            return {
                used: 0, total: 0, free: 0, percent: 0,
                usedFormatted: 'Error', totalFormatted: 'Error', freeFormatted: 'Error',
                mounted: false, exists: false
            };
        }
    }

    static logToFile(message) {
        const date = new Date();
        const timestamp = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth()+1).toString().padStart(2, '0')}.${date.getFullYear().toString().slice(-2)} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
        const logEntry = `${timestamp}: [meta-overlayfsx-webui] - ${message}`;
        
        if (typeof ksu !== 'undefined') {
            const escapedLog = logEntry.replace(/'/g, "'\\''").replace(/\n/g, ' ');
            const logCmd = `echo '${escapedLog}' >> "${CONFIG.LOG_FILE}"`;
            ksu.exec(logCmd, "{}", () => {});
        }
    }

    static formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    static showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const iconName = type === 'success' ? 'check-circle' : 
                        type === 'error' ? 'exclamation-circle' : 
                        type === 'warning' ? 'exclamation-triangle' : 'info-circle';
        
        toast.innerHTML = `${icon(iconName)}<span>${message}</span>`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    static showModal(title, content, buttons = []) {
        return new Promise((resolve) => {
            document.body.classList.add('modal-open');

            const container = document.getElementById('modal-container');
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">${content}</div>
                    ${buttons.length > 0 ? `
                    <div class="modal-footer">
                        ${buttons.map(btn => `
                            <button class="btn btn-${btn.type || 'secondary'}" data-result="${btn.result}">
                                ${btn.text}
                            </button>
                        `).join('')}
                    </div>
                    ` : ''}
                </div>
            `;
            container.appendChild(modal);

            const closeModal = (result) => {
                modal.style.animation = 'fadeOut 0.3s ease forwards';
                setTimeout(() => {
                    modal.remove();
                    document.body.classList.remove('modal-open');
                    resolve(result);
                }, 300);
            };

            modal.querySelector('.modal-close').onclick = () => closeModal(null);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(null);
            });

            modal.querySelectorAll('[data-result]').forEach(btn => {
                btn.onclick = () => {
                    let result = btn.dataset.result;
                    if (result === 'true') result = true;
                    if (result === 'false') result = false;
                    closeModal(result);
                };
            });
        });
    }

    static async confirmAction(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
        return Utils.showModal(
            title,
            `<div class="confirm-message">${message}</div>`,
            [
                { text: cancelText, type: 'secondary', result: false },
                { text: confirmText, type: 'danger', result: true }
            ]
        );
    }

    static async checkRoot() {
        try {
            const result = await this.execCommand('id');
            return result.includes('uid=0');
        } catch {
            return false;
        }
    }

    static async checkKernelSU() {
        try {
            const result = await this.execCommand('ksud -V 2>/dev/null || echo "N/A"');
            const version = result.trim();
            return version !== 'N/A';
        } catch {
            return false;
        }
    }

    static async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            Utils.showToast('Copied to clipboard', 'success');
            return true;
        } catch (error) {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, 99999);
            
            try {
                const success = document.execCommand('copy');
                document.body.removeChild(textarea);
                if (success) {
                    Utils.showToast('Copied to clipboard', 'success');
                    return true;
                } else {
                    Utils.showToast('Failed to copy', 'error');
                    return false;
                }
            } catch (err) {
                document.body.removeChild(textarea);
                Utils.showToast('Failed to copy', 'error');
                return false;
            }
        }
    }
}