class DashboardPage {
    constructor(app) {
        this.app = app;
        this.data = {
            deviceInfo: { model: 'Loading...', android: 'Loading...' },
            ksuVersion: 'Loading...',
            rootStatus: 'Loading...',
            imageStatus: { mounted: false, exists: false },
            imageUsage: { percent: 0, usedFormatted: '0B', totalFormatted: '0B', used: 0, total: 0, freeFormatted: '0B' },
            moduleStats: { total: 0, active: 0, inactive: 0, updating: 0, live: 0 },
            modules: []
        };
        
        const savedState = localStorage.getItem('dashboard_auto_refresh');
        this.autoRefresh = savedState !== null ? savedState === 'true' : true;
    }

    async render() {
        await this.loadData();
        
        return `
            <div class="dashboard-page">
                <div class="dashboard-header">
                    <h2>${icon('tachometer-alt')} System Overview</h2>
                    <div class="header-actions">
                        <button class="btn btn-sm btn-secondary" id="auto-refresh-toggle">
                            ${icon('sync', this.autoRefresh ? 'fa-spin' : '')}
                            ${this.autoRefresh ? 'Auto On' : 'Auto Off'}
                        </button>
                        ${!this.autoRefresh ? `
                            <button class="btn btn-sm btn-primary" id="manual-refresh">
                                ${icon('redo')} Refresh
                            </button>
                        ` : ''}
                    </div>
                </div>
                
                <div class="stats-container">
                    <div class="circular-progress-container">
                        <div class="circular-progress" id="storage-progress">
                            <svg class="progress-ring" width="120" height="120">
                                <circle class="progress-ring-bg" cx="60" cy="60" r="54" stroke-width="8"></circle>
                                <circle class="progress-ring-fill" cx="60" cy="60" r="54" stroke-width="8" 
                                        stroke-dasharray="339.292" stroke-dashoffset="${339.292 * (1 - this.data.imageUsage.percent / 100)}"></circle>
                            </svg>
                            <div class="progress-text">
                                <div class="progress-value">${this.data.imageUsage.percent}%</div>
                                <div class="progress-label">Storage</div>
                            </div>
                        </div>
                        <div class="progress-info">
                            <div class="progress-detail">
                                <span class="detail-label">Used:</span>
                                <span class="detail-value">${this.data.imageUsage.usedFormatted}</span>
                            </div>
                            <div class="progress-detail">
                                <span class="detail-label">Total:</span>
                                <span class="detail-value">${this.data.imageUsage.totalFormatted}</span>
                            </div>
                            <div class="progress-detail">
                                <span class="detail-label">Free:</span>
                                <span class="detail-value">${this.data.imageUsage.freeFormatted}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modules-stats">
                        <div class="module-stat-card" id="total-modules">
                            <div class="module-stat-icon">
                                ${icon('cubes')}
                            </div>
                            <div class="module-stat-content">
                                <div class="module-stat-value">${this.data.moduleStats.total}</div>
                                <div class="module-stat-label">Total Modules</div>
                            </div>
                        </div>
                        
                        <div class="module-stat-card active" id="active-modules">
                            <div class="module-stat-icon">
                                ${icon('check-circle')}
                            </div>
                            <div class="module-stat-content">
                                <div class="module-stat-value">${this.data.moduleStats.active}</div>
                                <div class="module-stat-label">Active</div>
                            </div>
                        </div>
                        
                        <div class="module-stat-card inactive" id="inactive-modules">
                            <div class="module-stat-icon">
                                ${icon('pause-circle')}
                            </div>
                            <div class="module-stat-content">
                                <div class="module-stat-value">${this.data.moduleStats.inactive}</div>
                                <div class="module-stat-label">Disabled</div>
                            </div>
                        </div>

                        <div class="module-stat-card live" id="live-modules">
                            <div class="module-stat-icon">
                                ${icon('bolt')}
                            </div>
                            <div class="module-stat-content">
                                <div class="module-stat-value">${this.data.moduleStats.live}</div>
                                <div class="module-stat-label">Live Active</div>
                            </div>
                        </div>
                        
                        <div class="module-stat-card updating" id="updating-modules">
                            <div class="module-stat-icon">
                                ${icon('sync-alt')}
                            </div>
                            <div class="module-stat-content">
                                <div class="module-stat-value">${this.data.moduleStats.updating}</div>
                                <div class="module-stat-label">Update Pending</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="info-cards">
                    <div class="info-card">
                        <div class="info-card-header">
                            ${icon('microchip')}
                            <h3>Device Info</h3>
                        </div>
                        <div class="info-card-content">
                            <div class="info-row">
                                <span class="info-label">Model:</span>
                                <span class="info-value">${this.data.deviceInfo.model}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Android:</span>
                                <span class="info-value">${this.data.deviceInfo.android}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">KernelSU:</span>
                                <span class="info-value">${this.data.ksuVersion}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-card">
                        <div class="info-card-header">
                            ${icon('hdd')}
                            <h3>Image Status</h3>
                        </div>
                        <div class="info-card-content">
                            <div class="info-row">
                                <span class="info-label">Status:</span>
                                <span class="info-value" id="mount-status">${this.data.imageStatus.mounted ? 'Mounted' : 'Not Mounted'}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Image:</span>
                                <span class="info-value">${this.data.imageStatus.exists ? 'Exists' : 'Not Found'}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Path:</span>
                                <span class="info-value path">${CONFIG.IMG_FILE}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="quick-stats">
                    <div class="quick-stat">
                        ${icon('shield-alt')}
                        <div>
                            <div class="quick-stat-value">Root</div>
                            <div class="quick-stat-label">${this.data.rootStatus}</div>
                        </div>
                    </div>
                    <div class="quick-stat">
                        ${icon('clock')}
                        <div>
                            <div class="quick-stat-value">${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}</div>
                            <div class="quick-stat-label">Last Updated</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadData() {
        try {
            const model = await Utils.execCommand('getprop ro.product.model').catch(() => 'Unknown');
            const android = await Utils.execCommand('getprop ro.build.version.release').catch(() => 'Unknown');
            const ksuVersion = await Utils.execCommand('ksud -V 2>/dev/null || echo "Unknown"').catch(() => 'Unknown');
            const rootStatus = await Utils.checkRoot() ? 'Active' : 'Inactive';
            
            const storageUsage = await Utils.getStorageUsage(CONFIG.IMG_FILE, CONFIG.MNT_DIR);
            
            const liveOutput = await Utils.execCommand(`cat "${CONFIG.LIVE_MODULES_FILE}" 2>/dev/null || echo ""`).catch(() => '');
            const liveCount = liveOutput.trim().split('\n').filter(Boolean).length;
            
            const modules = await this.getModules();
            const moduleStats = {
                total: modules.length,
                active: modules.filter(m => m.enabled && !m.hasUpdate).length,
                inactive: modules.filter(m => !m.enabled && !m.hasUpdate).length,
                updating: modules.filter(m => m.hasUpdate).length,
                live: liveCount
            };
            
            this.data = {
                deviceInfo: { model: model.trim(), android: android.trim() },
                ksuVersion: ksuVersion.trim(),
                rootStatus,
                imageStatus: { 
                    mounted: storageUsage.mounted, 
                    exists: storageUsage.exists 
                },
                imageUsage: {
                    used: storageUsage.used,
                    total: storageUsage.total,
                    free: storageUsage.free,
                    percent: storageUsage.percent,
                    usedFormatted: storageUsage.usedFormatted,
                    totalFormatted: storageUsage.totalFormatted,
                    freeFormatted: storageUsage.freeFormatted
                },
                moduleStats,
                modules
            };
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.data = {
                deviceInfo: { model: 'Error', android: 'Error' },
                ksuVersion: 'Error',
                rootStatus: 'Error',
                imageStatus: { mounted: false, exists: false },
                imageUsage: { 
                    percent: 0, 
                    usedFormatted: 'Error', 
                    totalFormatted: 'Error', 
                    freeFormatted: 'Error',
                    used: 0, 
                    total: 0,
                    free: 0
                },
                moduleStats: { total: 0, active: 0, inactive: 0, updating: 0, live: 0 },
                modules: []
            };
        }
    }

    async getModules() {
        try {
            const mounted = await Utils.execCommand(`mountpoint -q "${CONFIG.MNT_DIR}" && echo "1"`)
                .then(() => true)
                .catch(() => false);
            
            if (!mounted) return [];
            
            const output = await Utils.execCommand(`ls -1 "${CONFIG.MNT_DIR}" 2>/dev/null | grep -v lost+found`).catch(() => '');
            const moduleNames = output.trim().split('\n').filter(Boolean);
            
            const modules = [];
            const uniqueNames = new Set();
            
            for (const name of moduleNames) {
                if (uniqueNames.has(name)) continue;
                uniqueNames.add(name);
                
                const modulePath = `${CONFIG.MODULES_DIR}/${name}`;
                const hasUpdate = await Utils.execCommand(`[ -f "${modulePath}/update" ] && echo "1"`).then(() => true).catch(() => false);
                
                const moduleExists = await Utils.execCommand(`[ -d "${modulePath}" ] && echo "1"`).then(() => true).catch(() => false);
                
                let enabled = true;
                if (moduleExists) {
                    enabled = hasUpdate ? false : await Utils.execCommand(`[ -f "${modulePath}/disable" ] && echo "0" || echo "1"`)
                        .then(res => res.trim() === '1')
                        .catch(() => true);
                } else {
                    enabled = false;
                }
                
                modules.push({ name, enabled, hasUpdate });
            }
            
            return modules;
        } catch {
            return [];
        }
    }

    async bindEvents() {
        const refreshBtn = document.getElementById('auto-refresh-toggle');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                this.autoRefresh = !this.autoRefresh;
                localStorage.setItem('dashboard_auto_refresh', this.autoRefresh.toString());
                
                const headerActions = document.querySelector('.header-actions');
                if (this.autoRefresh) {
                    refreshBtn.innerHTML = `${icon('sync', 'fa-spin')} Auto On`;
                    Utils.showToast('Auto-refresh enabled', 'info', 2000);
                    
                    const manualBtn = document.getElementById('manual-refresh');
                    if (manualBtn) {
                        manualBtn.remove();
                    }
                } else {
                    refreshBtn.innerHTML = `${icon('sync')} Auto Off`;
                    Utils.showToast('Auto-refresh disabled', 'warning', 2000);
                    
                    if (!document.getElementById('manual-refresh')) {
                        const manualBtn = document.createElement('button');
                        manualBtn.className = 'btn btn-sm btn-primary';
                        manualBtn.id = 'manual-refresh';
                        manualBtn.innerHTML = `${icon('redo')} Refresh`;
                        headerActions.appendChild(manualBtn);
                        
                        manualBtn.addEventListener('click', async () => {
                            const iconEl = manualBtn.querySelector('.icon');
                            iconEl.classList.add('fa-spin');
                            manualBtn.disabled = true;
                            
                            await this.update();
                            Utils.showToast('Dashboard refreshed', 'success', 2000);
                            
                            iconEl.classList.remove('fa-spin');
                            manualBtn.disabled = false;
                        });
                    }
                }
            });
        }
        
        const manualBtn = document.getElementById('manual-refresh');
        if (manualBtn) {
            manualBtn.addEventListener('click', async () => {
                const iconEl = manualBtn.querySelector('.icon');
                iconEl.classList.add('fa-spin');
                manualBtn.disabled = true;
                
                await this.update();
                Utils.showToast('Dashboard refreshed', 'success', 2000);
                
                iconEl.classList.remove('fa-spin');
                manualBtn.disabled = false;
            });
        }
        
        document.getElementById('total-modules')?.addEventListener('click', () => {
            this.app.showPage('modules', { filter: 'all' });
        });
        
        document.getElementById('active-modules')?.addEventListener('click', () => {
            this.app.showPage('modules', { filter: 'active' });
        });
        
        document.getElementById('inactive-modules')?.addEventListener('click', () => {
            this.app.showPage('modules', { filter: 'inactive' });
        });
        
        document.getElementById('updating-modules')?.addEventListener('click', () => {
            this.app.showPage('modules', { filter: 'updating' });
        });

        document.getElementById('live-modules')?.addEventListener('click', () => {
            this.app.showPage('modules', { filter: 'live' });
        });
    }

    async update() {
        await this.loadData();
        
        const storageProgress = document.getElementById('storage-progress');
        if (storageProgress) {
            const fillCircle = storageProgress.querySelector('.progress-ring-fill');
            if (fillCircle) {
                const circumference = 339.292;
                const offset = circumference * (1 - this.data.imageUsage.percent / 100);
                fillCircle.style.strokeDashoffset = offset;
            }
            
            const progressText = storageProgress.querySelector('.progress-value');
            if (progressText) {
                progressText.textContent = `${this.data.imageUsage.percent}%`;
            }
        }
        
        const progressDetails = document.querySelectorAll('.progress-detail .detail-value');
        if (progressDetails.length >= 3) {
            progressDetails[0].textContent = this.data.imageUsage.usedFormatted;
            progressDetails[1].textContent = this.data.imageUsage.totalFormatted;
            progressDetails[2].textContent = this.data.imageUsage.freeFormatted;
        }
        
        const moduleStats = document.querySelectorAll('.module-stat-value');
        if (moduleStats.length >= 5) {
            moduleStats[0].textContent = this.data.moduleStats.total;
            moduleStats[1].textContent = this.data.moduleStats.active;
            moduleStats[2].textContent = this.data.moduleStats.inactive;
            moduleStats[3].textContent = this.data.moduleStats.live;
            moduleStats[4].textContent = this.data.moduleStats.updating;
        }
        
        const infoCards = document.querySelectorAll('.info-card-content .info-value');
        if (infoCards.length >= 6) {
            infoCards[0].textContent = this.data.deviceInfo.model;
            infoCards[1].textContent = this.data.deviceInfo.android;
            infoCards[2].textContent = this.data.ksuVersion;
            infoCards[3].textContent = this.data.imageStatus.mounted ? 'Mounted' : 'Not Mounted';
            infoCards[4].textContent = this.data.imageStatus.exists ? 'Exists' : 'Not Found';
        }
        
        const quickStats = document.querySelectorAll('.quick-stat-value');
        if (quickStats.length >= 2) {
            quickStats[1].textContent = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;
        }
    }
}