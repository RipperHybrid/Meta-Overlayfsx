class SettingsPage {
    constructor(app) {
        this.app = app;
        this.data = {};
    }

    async render() {
        await this.loadData();
        
        return `
            <div class="settings-page">
                <div class="settings-header">
                    <h2>${icon('sliders-h')} Settings & Tools</h2>
                </div>
                
                <div class="settings-sections">
                    <section class="settings-section">
                        <div class="section-header">
                            ${icon('hdd')}
                            <h3>Image Information</h3>
                        </div>
                        
                        <div class="settings-grid">
                            <div class="setting-item">
                                <div class="setting-info">
                                    <h4>Image Status</h4>
                                    <p>${this.data.imageStatus.mounted ? 'Image is currently mounted and active' : 'Image is not mounted'}</p>
                                </div>
                                <div class="setting-value">
                                    <span class="status-badge ${this.data.imageStatus.mounted ? 'status-success' : 'status-error'}">
                                        ${this.data.imageStatus.mounted ? 'Mounted' : 'Not Mounted'}
                                    </span>
                                </div>
                            </div>
                            
                            <div class="setting-item">
                                <div class="setting-info">
                                    <h4>Image Size</h4>
                                    <p>Current allocated space for modules</p>
                                </div>
                                <div class="setting-value">
                                    <span class="value-text">${this.data.imageSize}</span>
                                </div>
                            </div>
                            
                            <div class="setting-item">
                                <div class="setting-info">
                                    <h4>Storage Usage</h4>
                                    <p>How much space is currently used</p>
                                </div>
                                <div class="setting-value">
                                    <span class="value-text">${this.data.imageUsage}</span>
                                </div>
                            </div>
                        </div>

                        ${this.data.imageStatus.mounted ? `
                            <div class="action-buttons" style="margin-top: 1rem;">
                                <button class="btn btn-primary full-width" id="optimize-image">
                                    ${icon('compress')} Optimize Storage
                                </button>
                            </div>
                            <div class="info-box info">
                                ${icon('info-circle')}
                                <div>
                                    <strong>Note:</strong> Image is mounted. Modules are currently accessible and active.
                                </div>
                            </div>
                        ` : this.data.imageStatus.exists ? `
                            <div class="info-box warning">
                                ${icon('exclamation-triangle')}
                                <div>
                                    <strong>Warning:</strong> Image is not mounted. Modules are not accessible. 
                                    The image needs to be mounted by the Meta OverlayFS module during boot.
                                </div>
                            </div>
                        ` : `
                            <div class="info-box info">
                                ${icon('info-circle')}
                                <div>
                                    <strong>Info:</strong> No image file found. The image is automatically created by the module during boot.
                                </div>
                            </div>
                        `}
                    </section>
                    
                    <section class="settings-section">
                        <div class="section-header">
                            ${icon('file-alt')}
                            <h3>System Logs</h3>
                        </div>
                        
                        <div class="settings-grid">
                            <div class="setting-item">
                                <div class="setting-info">
                                    <h4>Log File</h4>
                                    <p>Path: ${CONFIG.LOG_FILE}</p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="action-buttons">
                            <button class="btn btn-secondary" id="view-logs">
                                ${icon('eye')} View Logs
                            </button>
                            <button class="btn btn-danger" id="clear-logs">
                                ${icon('trash')} Clear Logs
                            </button>
                        </div>
                        
                        <div class="info-box info">
                            ${icon('info-circle')}
                            <div>
                                <strong>Note:</strong> Logs contain information about all operations performed. 
                                Useful for debugging issues.
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        `;
    }

    async loadData() {
        try {
            const storageUsage = await Utils.getStorageUsage(CONFIG.IMG_FILE, CONFIG.MNT_DIR);
            
            this.data = {
                exists: storageUsage.exists,
                mounted: storageUsage.mounted,
                imageSize: storageUsage.totalFormatted,
                imageUsage: `${storageUsage.usedFormatted}/${storageUsage.totalFormatted} (${storageUsage.percent}%)`,
                imageStatus: { 
                    mounted: storageUsage.mounted, 
                    exists: storageUsage.exists 
                }
            };
        } catch (error) {
            console.error('Error loading settings data:', error);
            this.data = {
                exists: false,
                mounted: false,
                imageSize: 'Error',
                imageUsage: 'Error',
                imageStatus: { mounted: false, exists: false }
            };
        }
    }

    async bindEvents() {
        document.getElementById('view-logs')?.addEventListener('click', async () => {
            await this.viewLogs();
        });
        
        document.getElementById('clear-logs')?.addEventListener('click', async () => {
            const confirmed = await Utils.confirmAction(
                'Clear Logs',
                'Are you sure you want to clear all log files? This action cannot be undone.',
                'Clear All'
            );
            
            if (confirmed) {
                await this.clearLogs();
            }
        });

        document.getElementById('optimize-image')?.addEventListener('click', async (e) => {
            await this.optimizeStorage(e.currentTarget);
        });
    }

    async optimizeStorage(btn) {
        const confirmed = await Utils.confirmAction(
            'Optimize Storage',
            'This will compact the modules image to free up space. This process requires creating a temporary copy and might take a minute.<br><br><strong>Note:</strong> You will need to reboot for the size changes to appear in file managers.',
            'Optimize'
        );

        if (!confirmed) return;

        const originalHtml = btn.innerHTML;
        btn.innerHTML = `${icon('spinner', 'fa-spin')} Optimizing...`;
        btn.disabled = true;

        try {
            Utils.showToast('Optimizing storage... Please wait.', 'info', 5000);
            
            const cmd = `
                echo "Start"
                dd if=/dev/zero of="${CONFIG.MNT_DIR}/zero.fill" bs=1M 2>/dev/null
                rm "${CONFIG.MNT_DIR}/zero.fill"
                "${CONFIG.BINARY}" xcp "${CONFIG.IMG_FILE}" "${CONFIG.IMG_FILE}.new" --punch-hole
                mv "${CONFIG.IMG_FILE}.new" "${CONFIG.IMG_FILE}"
                chmod 644 "${CONFIG.IMG_FILE}"
                chcon u:object_r:ksu_file:s0 "${CONFIG.IMG_FILE}"
            `;

            await Utils.execCommand(cmd);
            
            Utils.showToast('Storage optimized! Reboot to see changes.', 'success', 4000);
            
            await this.update();

        } catch (error) {
            Utils.showToast(`Optimization failed: ${error.message}`, 'error');
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }

    async viewLogs() {
        try {
            const logs = await Utils.execCommand(`cat "${CONFIG.LOG_FILE}" 2>/dev/null || echo "No logs available"`);
        
            const modalPromise = Utils.showModal(
                'System Logs',
                `
                    <div class="log-viewer-modal">
                        <div class="log-controls">
                            <button class="btn btn-sm btn-secondary" id="refresh-logs">
                                ${icon('sync')} Refresh
                            </button>
                            <button class="btn btn-sm btn-secondary" id="copy-logs">
                                ${icon('copy')} Copy
                            </button>
                        </div>
                        <div class="log-content">
                            <pre id="log-content">${logs}</pre>
                        </div>
                    </div>
                `,
                [{ text: 'Close', type: 'secondary', result: 'close' }]
            );
        
            setTimeout(() => {
                const refreshBtn = document.getElementById('refresh-logs');
                const copyBtn = document.getElementById('copy-logs');
                const logContent = document.getElementById('log-content');
            
                if (refreshBtn && logContent) {
                    refreshBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const originalHtml = refreshBtn.innerHTML;
                        refreshBtn.innerHTML = icon('spinner', 'fa-spin') + ' Refreshing';
                        refreshBtn.disabled = true;
                    
                        try {
                            const newLogs = await Utils.execCommand(`cat "${CONFIG.LOG_FILE}" 2>/dev/null || echo "No logs available"`);
                            logContent.textContent = newLogs;
                            Utils.showToast('Logs refreshed successfully', 'success');
                        } catch (error) {
                            Utils.showToast('Failed to refresh logs', 'error');
                        }
                    
                        refreshBtn.innerHTML = originalHtml;
                        refreshBtn.disabled = false;
                    });
                }
            
                if (copyBtn && logContent) {
                    copyBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await Utils.copyToClipboard(logContent.textContent);
                    });
                }
            }, 100);
        
            await modalPromise;
        
        } catch (error) {
            Utils.showToast(`Failed to read logs: ${error.message}`, 'error');
        }
    }

    async clearLogs() {
        try {
            await Utils.execCommand(`> "${CONFIG.LOG_FILE}"`);
            Utils.showToast('Logs cleared successfully', 'success');
        } catch (error) {
            Utils.showToast(`Failed to clear logs: ${error.message}`, 'error');
        }
    }

    async update() {
        await this.loadData();
        
        const statusBadge = document.querySelector('.status-badge');
        const imageSize = document.querySelector('.setting-item:nth-child(2) .value-text');
        const imageUsage = document.querySelector('.setting-item:nth-child(3) .value-text');
        
        if (statusBadge) {
            statusBadge.textContent = this.data.imageStatus.mounted ? 'Mounted' : 'Not Mounted';
            statusBadge.className = `status-badge ${this.data.imageStatus.mounted ? 'status-success' : 'status-error'}`;
        }
        
        if (imageSize) imageSize.textContent = this.data.imageSize;
        if (imageUsage) imageUsage.textContent = this.data.imageUsage;
        
        const infoBox = document.querySelector('.info-box');
        if (infoBox) {
            if (this.data.imageStatus.mounted) {
                if (document.getElementById('optimize-image')) {
                }
                infoBox.innerHTML = `
                    ${icon('info-circle')}
                    <div>
                        <strong>Note:</strong> Image is mounted. Modules are currently accessible and active.
                    </div>
                `;
                infoBox.className = 'info-box info';
            } else if (this.data.imageStatus.exists) {
                infoBox.innerHTML = `
                    ${icon('exclamation-triangle')}
                    <div>
                        <strong>Warning:</strong> Image is not mounted. Modules are not accessible. 
                        The image needs to be mounted by the Meta OverlayFS module during boot.
                    </div>
                `;
                infoBox.className = 'info-box warning';
            } else {
                infoBox.innerHTML = `
                    ${icon('info-circle')}
                    <div>
                        <strong>Info:</strong> No image file found. The image is automatically created by the module during boot.
                    </div>
                `;
                infoBox.className = 'info-box info';
            }
        }
    }
}