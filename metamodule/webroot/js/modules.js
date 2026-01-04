class ModulesPage {
    constructor(app) {
        this.app = app;
        this.modules = [];
        this.liveModules = new Set();
        this.filter = 'all';
        this.searchTerm = '';
        this.loading = false;
        this.touchStartX = 0;
        this.touchEndX = 0;
        this.touchStartY = 0;
        this.touchEndY = 0;
        this.toastTimer = null;
    }

    async render() {
        await this.loadModules();
        await this.loadLiveModules();
        const filtered = this.filterModules();
        
        return `
            <div class="modules-page">
                <div class="modules-header">
                    <h2>${icon('cubes')} Module Management</h2>
                    <div class="header-actions">
                        <div class="search-box">
                            ${icon('search')}
                            <input type="text" id="module-search" placeholder="Search modules..." value="${this.searchTerm}">
                        </div>
                    </div>
                </div>
                
                <div class="modules-filters" id="modules-filters">
                    <div class="filter-tabs">
                        <button class="filter-tab ${this.filter === 'all' ? 'active' : ''}" data-filter="all">
                            All <span class="filter-count">${this.modules.length}</span>
                        </button>
                        <button class="filter-tab ${this.filter === 'active' ? 'active' : ''}" data-filter="active">
                            Active <span class="filter-count">${this.modules.filter(m => m.enabled && !m.hasUpdate).length}</span>
                        </button>
                        <button class="filter-tab ${this.filter === 'inactive' ? 'active' : ''}" data-filter="inactive">
                            Disabled <span class="filter-count">${this.modules.filter(m => !m.enabled && !m.hasUpdate).length}</span>
                        </button>
                        <button class="filter-tab ${this.filter === 'updating' ? 'active' : ''}" data-filter="updating">
                            Updating <span class="filter-count">${this.modules.filter(m => m.hasUpdate).length}</span>
                        </button>
                        <button class="filter-tab ${this.filter === 'live' ? 'active' : ''}" data-filter="live">
                            Live <span class="filter-count">${this.liveModules.size}</span>
                        </button>
                    </div>
                </div>
                
                <div id="modules-content">
                    ${filtered.length === 0 ? `
                        <div class="empty-state">
                            ${icon('inbox')}
                            <h3>No modules found</h3>
                            <p>${this.getEmptyMessage()}</p>
                        </div>
                    ` : `
                        <div class="modules-list">
                            ${filtered.map(module => this.renderModule(module)).join('')}
                        </div>
                    `}
                </div>
                
                <div class="modules-footer">
                    <div class="module-stats">
                        <span class="stat-item">Total: ${this.modules.length}</span>
                        <span class="stat-item">•</span>
                        <span class="stat-item">Active: ${this.modules.filter(m => m.enabled && !m.hasUpdate).length}</span>
                        <span class="stat-item">•</span>
                        <span class="stat-item">Disabled: ${this.modules.filter(m => !m.enabled && !m.hasUpdate).length}</span>
                        <span class="stat-item">•</span>
                        <span class="stat-item live">Live: ${this.liveModules.size}</span>
                        ${this.modules.filter(m => m.hasUpdate).length > 0 ? `
                            <span class="stat-item">•</span>
                            <span class="stat-item updating">Updating: ${this.modules.filter(m => m.hasUpdate).length}</span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    getEmptyMessage() {
        switch (this.filter) {
            case 'all':
                return 'No modules are currently loaded in the image.';
            case 'live':
                return 'No modules are enabled for live patching. Use the Live button next to each module to enable.';
            default:
                return `No ${this.filter} modules found.`;
        }
    }

    renderModule(module) {
        const isLive = this.liveModules.has(module.id);
        const displayName = module.name || module.id;
        
        let statusText = 'Active';
        let statusClass = 'active';
        let iconClass = 'fa-check-circle';
        
        if (module.hasUpdate) {
            statusText = 'Update Pending';
            statusClass = 'updating';
            iconClass = 'fa-sync-alt fa-spin';
        } else if (!module.enabled) {
            statusText = 'Disabled';
            statusClass = 'inactive';
            iconClass = 'fa-pause-circle';
        }

        return `
            <div class="module-card ${statusClass} ${isLive ? 'live-enabled' : ''}" data-module="${module.id}">
                <div class="module-icon">
                    ${icon(iconClass.replace('fa-', ''))}
                </div>
                
                <div class="module-info-fixed">
                    <div class="fixed-row header">
                        <h3 class="module-name">${displayName}</h3>
                        <div class="status-group">
                            <span class="status-text ${statusClass}">${statusText}</span>
                            ${isLive ? `<span class="status-text live">${icon('bolt')} Live</span>` : ''}
                        </div>
                    </div>

                    <div class="fixed-row details">
                        ${module.id !== displayName ? `
                            <span class="detail-item">
                                ${icon('code')}
                                <span style="font-family: monospace; font-size: 0.85em;">${module.id}</span>
                            </span>
                        ` : ''}
                        <span class="detail-item">
                            ${icon('folder')}
                            <span>${module.existsInModulesDir ? 'In Image' : 'Not Linked'}</span>
                        </span>
                        <span class="detail-item">
                            ${icon('hdd')}
                            <span>${module.sizeFormatted || 'Unknown'}</span>
                        </span>
                    </div>

                    <div class="fixed-row actions">
                        ${module.hasUpdate ? `
                            <button class="btn btn-sm btn-secondary full-width" disabled>
                                ${icon('ban')} Update Pending
                            </button>
                        ` : `
                            <button class="btn btn-sm ${module.enabled ? 'btn-warning' : 'btn-success'} toggle-module" 
                                    data-module="${module.id}" 
                                    data-action="${module.enabled ? 'disable' : 'enable'}">
                                ${icon(module.enabled ? 'pause' : 'play')} 
                                ${module.enabled ? 'Disable' : 'Enable'}
                            </button>
                            
                            <button class="btn btn-sm ${isLive ? 'btn-live-active' : 'btn-live'} toggle-live" data-module="${module.id}">
                                ${icon('bolt')} ${isLive ? 'Live' : 'Live'}
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    async loadModules() {
        if (this.loading) return;
        this.loading = true;
        
        try {
            const mounted = await Utils.execCommand(`mountpoint -q "${CONFIG.MNT_DIR}" && echo "1"`)
                .then(() => true)
                .catch(() => false);
            
            if (!mounted) {
                this.modules = [];
                return;
            }
            
            const sizesOutput = await Utils.execCommand(`du -sk "${CONFIG.MODULES_DIR}"/* 2>/dev/null`).catch(() => '');
            const sizeMap = new Map();
            if (sizesOutput) {
                sizesOutput.split('\n').forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        const sizeKb = parseInt(parts[0]);
                        const path = parts[1];
                        const name = path.split('/').pop();
                        if (name && !isNaN(sizeKb)) {
                            sizeMap.set(name, sizeKb * 1024);
                        }
                    }
                });
            }
            
            const mntModules = await Utils.execCommand(`ls -1 "${CONFIG.MNT_DIR}" 2>/dev/null | grep -v lost+found`).catch(() => '');
            const moduleNames = mntModules.trim().split('\n').filter(Boolean);
            
            const uniqueModules = new Set();
            this.modules = [];
            
            for (const id of moduleNames) {
                if (uniqueModules.has(id)) continue;
                uniqueModules.add(id);
                
                const modulePath = `${CONFIG.MODULES_DIR}/${id}`;
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
                
                const sizeBytes = sizeMap.get(id) || 0;
                const moduleName = await Utils.getModuleProp(id, 'name');
                
                this.modules.push({ 
                    id,
                    name: moduleName,
                    enabled, 
                    hasUpdate,
                    existsInModulesDir: moduleExists,
                    sizeFormatted: Utils.formatBytes(sizeBytes)
                });
            }
            
            this.modules.sort((a, b) => {
                const nameA = a.name || a.id;
                const nameB = b.name || b.id;
                return nameA.localeCompare(nameB);
            });
            
        } catch (error) {
            console.error('Error loading modules:', error);
            this.modules = [];
        } finally {
            this.loading = false;
        }
    }

    async loadLiveModules() {
        try {
            const output = await Utils.execCommand(`cat "${CONFIG.LIVE_MODULES_FILE}" 2>/dev/null || echo ""`).catch(() => '');
            const liveModIds = output.trim().split('\n').filter(Boolean);
            this.liveModules = new Set(liveModIds);
        } catch (error) {
            console.error('Error loading live modules:', error);
            this.liveModules = new Set();
        }
    }

    filterModules() {
        let filtered = this.modules;
        
        if (this.filter === 'active') {
            filtered = filtered.filter(m => m.enabled && !m.hasUpdate);
        } else if (this.filter === 'inactive') {
            filtered = filtered.filter(m => !m.enabled && !m.hasUpdate);
        } else if (this.filter === 'updating') {
            filtered = filtered.filter(m => m.hasUpdate);
        } else if (this.filter === 'live') {
            filtered = filtered.filter(m => this.liveModules.has(m.id));
        }
        
        if (this.searchTerm) {
            filtered = filtered.filter(m => {
                const searchLower = this.searchTerm.toLowerCase();
                const idMatch = m.id.toLowerCase().includes(searchLower);
                const nameMatch = m.name && m.name.toLowerCase().includes(searchLower);
                return idMatch || nameMatch;
            });
        }
        
        return filtered;
    }

    async bindEvents() {
        const searchInput = document.getElementById('module-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.updateContent();
            });
        }
        
        document.querySelectorAll('.filter-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.filter = e.currentTarget.dataset.filter;
                this.updateFilterButtons();
                this.updateContent();
            });
        });
        
        this.setupSwipeGestures();
        
        document.querySelectorAll('.toggle-module').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const moduleId = e.currentTarget.dataset.module;
                const action = e.currentTarget.dataset.action;
                const enabled = action === 'enable';
                
                e.currentTarget.innerHTML = icon('spinner', 'fa-spin');
                e.currentTarget.disabled = true;
                
                await this.toggleModule(moduleId, enabled);
                
                e.currentTarget.disabled = false;
            });
        });

        document.querySelectorAll('.toggle-live').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const moduleId = e.currentTarget.dataset.module;
                await this.toggleLive(moduleId);
            });
        });
    }

    setupSwipeGestures() {
        const contentContainer = document.getElementById('modules-content');
        if (contentContainer) {
            contentContainer.addEventListener('touchstart', (e) => {
                if (document.body.classList.contains('modal-open')) return;
                
                this.touchStartX = e.changedTouches[0].screenX;
                this.touchStartY = e.changedTouches[0].screenY;
            }, { passive: true });
            
            contentContainer.addEventListener('touchend', (e) => {
                if (document.body.classList.contains('modal-open')) return;
                
                this.touchEndX = e.changedTouches[0].screenX;
                this.touchEndY = e.changedTouches[0].screenY;
                this.handleFilterSwipe();
            }, { passive: true });
        }
    }

    updateFilterButtons() {
        document.querySelectorAll('.filter-tab').forEach(btn => {
            if (btn.dataset.filter === this.filter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    handleFilterSwipe() {
        const xDiff = this.touchStartX - this.touchEndX;
        const yDiff = this.touchStartY - this.touchEndY;
        const swipeThreshold = 50;
        
        if (Math.abs(yDiff) >= Math.abs(xDiff) * 0.5) return;
        if (Math.abs(xDiff) < swipeThreshold) return;
        
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
        }
        
        const filters = ['all', 'active', 'inactive', 'updating', 'live'];
        const currentIndex = filters.indexOf(this.filter);
        
        let newIndex;
        if (xDiff > 0) {
            newIndex = (currentIndex + 1) % filters.length;
        } else {
            newIndex = (currentIndex - 1 + filters.length) % filters.length;
        }
        
        this.filter = filters[newIndex];
        this.updateFilterButtons();
        this.updateContent();

        this.toastTimer = setTimeout(() => {
            const name = this.filter.charAt(0).toUpperCase() + this.filter.slice(1);
            if (typeof ksu !== 'undefined' && typeof ksu.toast === 'function') {
                ksu.toast(`Showing ${name} modules`);
            }
        }, 1000);
    }

    updateFilterCounts() {
        const filterTabs = document.querySelectorAll('.filter-tab');
        if (filterTabs.length >= 5) {
            filterTabs[0].querySelector('.filter-count').textContent = this.modules.length;
            filterTabs[1].querySelector('.filter-count').textContent = this.modules.filter(m => m.enabled && !m.hasUpdate).length;
            filterTabs[2].querySelector('.filter-count').textContent = this.modules.filter(m => !m.enabled && !m.hasUpdate).length;
            filterTabs[3].querySelector('.filter-count').textContent = this.modules.filter(m => m.hasUpdate).length;
            filterTabs[4].querySelector('.filter-count').textContent = this.liveModules.size;
        }
    }

    updateContent() {
        const filtered = this.filterModules();
        const contentDiv = document.getElementById('modules-content');
        
        if (!contentDiv) return;
        
        if (filtered.length === 0) {
            contentDiv.innerHTML = `
                <div class="empty-state">
                    ${icon('inbox')}
                    <h3>No modules found</h3>
                    <p>${this.getEmptyMessage()}</p>
                </div>
            `;
        } else {
            contentDiv.innerHTML = `
                <div class="modules-list">
                    ${filtered.map(module => this.renderModule(module)).join('')}
                </div>
            `;
            
            document.querySelectorAll('.toggle-module').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const moduleId = e.currentTarget.dataset.module;
                    const action = e.currentTarget.dataset.action;
                    const enabled = action === 'enable';
                    
                    e.currentTarget.innerHTML = icon('spinner', 'fa-spin');
                    e.currentTarget.disabled = true;
                    
                    await this.toggleModule(moduleId, enabled);
                    
                    e.currentTarget.disabled = false;
                });
            });

            document.querySelectorAll('.toggle-live').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const moduleId = e.currentTarget.dataset.module;
                    await this.toggleLive(moduleId);
                });
            });
        }
        
        this.updateFilterButtons();
        this.updateFilterCounts();
        this.updateFooter();
    }

    updateFooter() {
        const footer = document.querySelector('.modules-footer .module-stats');
        if (footer) {
            footer.innerHTML = `
                <span class="stat-item">Total: ${this.modules.length}</span>
                <span class="stat-item">•</span>
                <span class="stat-item">Active: ${this.modules.filter(m => m.enabled && !m.hasUpdate).length}</span>
                <span class="stat-item">•</span>
                <span class="stat-item">Disabled: ${this.modules.filter(m => !m.enabled && !m.hasUpdate).length}</span>
                <span class="stat-item">•</span>
                <span class="stat-item live">Live: ${this.liveModules.size}</span>
                ${this.modules.filter(m => m.hasUpdate).length > 0 ? `
                    <span class="stat-item">•</span>
                    <span class="stat-item updating">Updating: ${this.modules.filter(m => m.hasUpdate).length}</span>
                ` : ''}
            `;
        }
    }

    async toggleModule(moduleId, enable) {
        try {
            const modulePath = `${CONFIG.MODULES_DIR}/${moduleId}`;
            const module = this.modules.find(m => m.id === moduleId);
            const displayName = module ? (module.name || moduleId) : moduleId;
            
            Utils.logToFile(`${enable ? 'Enabling' : 'Disabling'} module: ${displayName} (${moduleId})`);
            
            if (enable) {
                await Utils.execCommand(`rm -f "${modulePath}/disable"`);
                Utils.showToast(`Module "${displayName}" enabled`, 'success');
            } else {
                await Utils.execCommand(`touch "${modulePath}/disable"`);
                Utils.showToast(`Module "${displayName}" disabled`, 'warning');
            }
            
            if (module) {
                module.enabled = enable;
            }
            
            await this.update();
            
            if (this.app.pages.dashboard) {
                await this.app.pages.dashboard.loadData();
                if (this.app.currentPage === 'dashboard') {
                    await this.app.pages.dashboard.update();
                }
            }
            
        } catch (error) {
            Utils.showToast(`Failed to toggle module: ${error.message}`, 'error');
        }
    }

    async toggleLive(moduleId) {
        const isCurrentlyLive = this.liveModules.has(moduleId);
        const module = this.modules.find(m => m.id === moduleId);
        const displayName = module ? (module.name || moduleId) : moduleId;
        
        if (isCurrentlyLive) {
            const confirmed = await Utils.confirmAction(
                'Disable Live Patching',
                `Disable live patching for "${displayName}"? Future updates will require a reboot.`,
                'Disable'
            );
            
            if (!confirmed) return;
            
            try {
                const output = await Utils.execCommand(`cat "${CONFIG.LIVE_MODULES_FILE}" 2>/dev/null || echo ""`);
                const currentLive = new Set(output.trim().split('\n').filter(Boolean));
                currentLive.delete(moduleId);
                
                const liveList = Array.from(currentLive).join('\n');
                await Utils.execCommand(`echo '${liveList}' > ${CONFIG.LIVE_MODULES_FILE}`);
                
                this.liveModules.delete(moduleId);
                Utils.showToast(`Live patching disabled for "${displayName}"`, 'success');
                await this.update();
            } catch (error) {
                Utils.showToast(`Failed to disable live: ${error.message}`, 'error');
            }
        } else {
            const confirmed = await Utils.showModal(
                'Enable Live Patching',
                `
                    <div class="live-warning">
                        <div class="warning-icon">
                            ${icon('bolt')}
                        </div>
                        <p style="text-align: center; margin-bottom: 1rem;">
                            Updates to <strong>${displayName}</strong> will be applied instantly without a reboot.
                        </p>
                        
                        <div class="info-box warning">
                            ${icon('exclamation-triangle')}
                            <div>
                                <strong>System Crash Risk:</strong><br>
                                Do not enable this for modules that modify active system components (e.g., fonts, frameworks). Modifying files currently in use by the system can cause immediate crashes or instability.
                            </div>
                        </div>
                    </div>
                `,
                [
                    { text: 'Cancel', type: 'secondary', result: 'cancel' },
                    { text: 'Enable Live', type: 'primary', result: 'enable' }
                ]
            );
            
            if (confirmed !== 'enable') return;
            
            try {
                const output = await Utils.execCommand(`cat "${CONFIG.LIVE_MODULES_FILE}" 2>/dev/null || echo ""`);
                const currentLive = new Set(output.trim().split('\n').filter(Boolean));
                currentLive.add(moduleId);
                
                const liveList = Array.from(currentLive).join('\n');
                await Utils.execCommand(`echo '${liveList}' > ${CONFIG.LIVE_MODULES_FILE}`);
                
                this.liveModules.add(moduleId);
                Utils.showToast(`Live patching enabled for "${displayName}"`, 'success');
                await this.update();
            } catch (error) {
                Utils.showToast(`Failed to enable live: ${error.message}`, 'error');
            }
        }
    }

    async update() {
        await this.loadModules();
        await this.loadLiveModules();
        this.updateContent();
    }
}