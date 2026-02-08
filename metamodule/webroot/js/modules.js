export default class ModulesPage {
    constructor(app) {
        this.app = app;
        this.modules = [];
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
        const filtered = this.filterModules();

        return `
            <div class="modules-page">
                <div class="modules-header">
                    <h2>${this.app.icon('cubes')} Module Management</h2>
                    <div class="header-actions">
                        <div class="search-box">
                            ${this.app.icon('search')}
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
                            Active <span class="filter-count">${this.modules.filter(m => m.enabled && !m.hasUpdate && !m.removePending).length}</span>
                        </button>
                        <button class="filter-tab ${this.filter === 'inactive' ? 'active' : ''}" data-filter="inactive">
                            Disabled <span class="filter-count">${this.modules.filter(m => !m.enabled && !m.hasUpdate && !m.removePending).length}</span>
                        </button>
                        <button class="filter-tab ${this.filter === 'updating' ? 'active' : ''}" data-filter="updating">
                            Updating <span class="filter-count">${this.modules.filter(m => m.hasUpdate).length}</span>
                        </button>
                        <button class="filter-tab ${this.filter === 'uninstalling' ? 'active' : ''}" data-filter="uninstalling">
                            Uninstalling <span class="filter-count">${this.modules.filter(m => m.removePending).length}</span>
                        </button>
                    </div>
                </div>

                <div id="modules-content">
                    ${this.renderModulesList(filtered)}
                </div>

                <div class="modules-footer">
                    ${this.renderFooterStats()}
                </div>
            </div>
        `;
    }

    renderModulesList(filtered) {
        if (filtered.length === 0) {
            return `
                <div class="empty-state">
                    ${this.app.icon('inbox')}
                    <h3>No modules found</h3>
                    <p>${this.getEmptyMessage()}</p>
                </div>
            `;
        }
        return `
            <div class="modules-list">
                ${filtered.map(module => this.renderModule(module)).join('')}
            </div>
        `;
    }

    renderFooterStats() {
        return `
            <div class="module-stats">
                <span class="stat-item">Total: ${this.modules.length}</span>
                <span class="stat-item">•</span>
                <span class="stat-item">Active: ${this.modules.filter(m => m.enabled && !m.hasUpdate && !m.removePending).length}</span>
                <span class="stat-item">•</span>
                <span class="stat-item">Disabled: ${this.modules.filter(m => !m.enabled && !m.hasUpdate && !m.removePending).length}</span>
                ${this.modules.filter(m => m.removePending).length > 0 ? `
                    <span class="stat-item">•</span>
                    <span class="stat-item uninstalling">Uninstalling: ${this.modules.filter(m => m.removePending).length}</span>
                ` : ''}
            </div>
        `;
    }

    getEmptyMessage() {
        switch (this.filter) {
            case 'all':
                return 'No modules are currently loaded in the image.';
            default:
                return `No ${this.filter} modules found.`;
        }
    }

    renderModule(module) {
        const displayName = module.name || module.id;

        let statusText = 'Active';
        let statusClass = 'active';
        let iconClass = 'check-circle';

        if (module.removePending) {
            statusText = 'Uninstalling';
            statusClass = 'uninstalling';
            iconClass = 'trash';
        } else if (module.hasUpdate) {
            statusText = 'Update Pending';
            statusClass = 'updating';
            iconClass = 'sync-alt fa-spin';
        } else if (!module.enabled) {
            statusText = 'Disabled';
            statusClass = 'inactive';
            iconClass = 'pause-circle';
        }

        return `
            <div class="module-card ${statusClass}" data-module="${module.id}">
                <div class="module-icon">
                    ${this.app.icon(iconClass)}
                </div>

                <div class="module-info-fixed">
                    <div class="fixed-row header">
                        <h3 class="module-name">${displayName}</h3>
                        <div class="status-group">
                            <span class="status-text ${statusClass}">${statusText}</span>
                        </div>
                    </div>

                    <div class="fixed-row details">
                        ${module.id !== displayName ? `
                            <span class="detail-item">
                                ${this.app.icon('code')}
                                <span style="font-family: monospace; font-size: 0.85em;">${module.id}</span>
                            </span>
                        ` : ''}
                        <span class="detail-item">
                            ${this.app.icon('folder')}
                            <span>${module.existsInModulesDir ? 'In Image' : 'Not Linked'}</span>
                        </span>
                        <span class="detail-item">
                            ${this.app.icon('hdd')}
                            <span>${module.sizeFormatted || 'Unknown'}</span>
                        </span>
                    </div>

                    <div class="fixed-row actions">
                        ${module.removePending ? `
                            <button class="btn btn-sm btn-primary full-width restore-module"
                                    data-module="${module.id}">
                                ${this.app.icon('undo')} Restore
                            </button>
                        ` : module.hasUpdate ? `
                            <button class="btn btn-sm btn-secondary full-width" disabled>
                                ${this.app.icon('ban')} Update Pending
                            </button>
                        ` : `
                            <button class="btn btn-sm btn-danger uninstall-module" style="flex: 0 0 auto;"
                                    data-module="${module.id}"
                                    title="Uninstall">
                                ${this.app.icon('trash')}
                            </button>
                            <button class="btn btn-sm ${module.enabled ? 'btn-warning' : 'btn-success'} toggle-module" style="flex: 1;"
                                    data-module="${module.id}"
                                    data-action="${module.enabled ? 'disable' : 'enable'}">
                                ${this.app.icon(module.enabled ? 'pause' : 'play')}
                                ${module.enabled ? 'Disable' : 'Enable'}
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
            const utils = this.app.utils;
            const mounted = await utils.execCommand(`mountpoint -q "${CONFIG.MNT_DIR}" && echo "1"`)
                .then(() => true)
                .catch(() => false);

            if (!mounted) {
                this.modules = [];
                return;
            }

            const sizesOutput = await utils.execCommand(`du -sk "${CONFIG.MODULES_DIR}"/* 2>/dev/null`).catch(() => '');
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

            const mntModules = await utils.execCommand(`ls -1 "${CONFIG.MNT_DIR}" 2>/dev/null | grep -v lost+found`).catch(() => '');
            const moduleNames = mntModules.trim().split('\n').filter(Boolean);

            const uniqueModules = new Set();
            this.modules = [];

            for (const id of moduleNames) {
                if (uniqueModules.has(id)) continue;
                uniqueModules.add(id);

                const modulePath = `${CONFIG.MODULES_DIR}/${id}`;
                const hasUpdate = await utils.execCommand(`[ -f "${modulePath}/update" ] && echo "1"`).then(() => true).catch(() => false);
                const moduleExists = await utils.execCommand(`[ -d "${modulePath}" ] && echo "1"`).then(() => true).catch(() => false);
                const removePending = await utils.execCommand(`[ -f "${modulePath}/remove" ] && echo "1"`).then(() => true).catch(() => false);

                let enabled = true;
                if (moduleExists) {
                    enabled = hasUpdate ? false : await utils.execCommand(`[ -f "${modulePath}/disable" ] && echo "0" || echo "1"`)
                        .then(res => res.trim() === '1')
                        .catch(() => true);
                } else {
                    enabled = false;
                }

                const sizeBytes = sizeMap.get(id) || 0;
                const moduleName = await utils.getModuleProp(id, 'name');

                this.modules.push({
                    id,
                    name: moduleName,
                    enabled,
                    hasUpdate,
                    removePending,
                    existsInModulesDir: moduleExists,
                    sizeFormatted: utils.formatBytes(sizeBytes)
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

    filterModules() {
        let filtered = this.modules;

        if (this.filter === 'active') {
            filtered = filtered.filter(m => m.enabled && !m.hasUpdate && !m.removePending);
        } else if (this.filter === 'inactive') {
            filtered = filtered.filter(m => !m.enabled && !m.hasUpdate && !m.removePending);
        } else if (this.filter === 'updating') {
            filtered = filtered.filter(m => m.hasUpdate);
        } else if (this.filter === 'uninstalling') {
            filtered = filtered.filter(m => m.removePending);
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
        this.bindStaticEvents();
        this.bindDynamicEvents();
    }

    bindStaticEvents() {
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
    }

    bindDynamicEvents() {
        document.querySelectorAll('.toggle-module').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const moduleId = e.currentTarget.dataset.module;
                const action = e.currentTarget.dataset.action;
                const enabled = action === 'enable';

                const btnEl = e.currentTarget;
                btnEl.innerHTML = this.app.icon('spinner', 'fa-spin');
                btnEl.disabled = true;

                await this.toggleModule(moduleId, enabled);
            });
        });

        document.querySelectorAll('.uninstall-module').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const moduleId = e.currentTarget.dataset.module;
                const btnEl = e.currentTarget;

                const confirmed = await this.app.utils.confirmAction(
                    'Uninstall Module',
                    'Are you sure you want to uninstall this module? Changes will take effect after reboot.',
                    'Uninstall',
                    'Cancel'
                );

                if (confirmed) {
                    btnEl.innerHTML = this.app.icon('spinner', 'fa-spin');
                    btnEl.disabled = true;
                    await this.toggleUninstall(moduleId, true);
                }
            });
        });

        document.querySelectorAll('.restore-module').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const moduleId = e.currentTarget.dataset.module;
                const btnEl = e.currentTarget;

                btnEl.innerHTML = this.app.icon('spinner', 'fa-spin');
                btnEl.disabled = true;
                await this.toggleUninstall(moduleId, false);
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

        const filters = ['all', 'active', 'inactive', 'updating', 'uninstalling'];
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
            filterTabs[1].querySelector('.filter-count').textContent = this.modules.filter(m => m.enabled && !m.hasUpdate && !m.removePending).length;
            filterTabs[2].querySelector('.filter-count').textContent = this.modules.filter(m => !m.enabled && !m.hasUpdate && !m.removePending).length;
            filterTabs[3].querySelector('.filter-count').textContent = this.modules.filter(m => m.hasUpdate).length;
            filterTabs[4].querySelector('.filter-count').textContent = this.modules.filter(m => m.removePending).length;
        }
    }

    updateContent() {
        const filtered = this.filterModules();
        const contentDiv = document.getElementById('modules-content');

        if (!contentDiv) return;

        contentDiv.innerHTML = this.renderModulesList(filtered);

        this.bindDynamicEvents();

        this.updateFilterButtons();
        this.updateFilterCounts();

        const footerDiv = document.querySelector('.modules-footer');
        if (footerDiv) {
            footerDiv.innerHTML = this.renderFooterStats();
        }
    }

    async toggleModule(moduleId, enable) {
        try {
            const utils = this.app.utils;
            const modulePath = `${CONFIG.MODULES_DIR}/${moduleId}`;
            const module = this.modules.find(m => m.id === moduleId);
            const displayName = module ? (module.name || moduleId) : moduleId;

            utils.logToFile(`${enable ? 'Enabling' : 'Disabling'} module: ${displayName} (${moduleId})`);

            if (enable) {
                await utils.execCommand(`rm -f "${modulePath}/disable"`);
                utils.showToast(`Module "${displayName}" enabled`, 'success');
            } else {
                await utils.execCommand(`touch "${modulePath}/disable"`);
                utils.showToast(`Module "${displayName}" disabled`, 'warning');
            }

            await this.update();

            if (this.app.pages.dashboard) {
                await this.app.pages.dashboard.loadData();
            }

        } catch (error) {
            this.app.utils.showToast(`Failed to toggle module: ${error.message}`, 'error');
        }
    }

    async toggleUninstall(moduleId, remove) {
        try {
            const utils = this.app.utils;
            const modulePath = `${CONFIG.MODULES_DIR}/${moduleId}`;
            const module = this.modules.find(m => m.id === moduleId);
            const displayName = module ? (module.name || moduleId) : moduleId;

            utils.logToFile(`${remove ? 'Marking for removal' : 'Restoring'} module: ${displayName} (${moduleId})`);

            if (remove) {
                await utils.execCommand(`touch "${modulePath}/remove"`);
                utils.showToast(`Module "${displayName}" marked for uninstall`, 'error');
            } else {
                await utils.execCommand(`rm -f "${modulePath}/remove"`);
                utils.showToast(`Module "${displayName}" restored`, 'success');
            }

            await this.update();

        } catch (error) {
            this.app.utils.showToast(`Operation failed: ${error.message}`, 'error');
        }
    }

    async update() {
        await this.loadModules();
        this.updateContent();
    }
}