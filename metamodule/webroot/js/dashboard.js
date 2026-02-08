export default class DashboardPage {
    constructor(app) {
        this.app = app;
        this.data = {
            deviceInfo: { model: 'Loading...', android: 'Loading...' },
            ksuVersion: 'Loading...',
            rootStatus: 'Loading...',
            imageStatus: { mounted: false, exists: false },
            imageUsage: { percent: 0, usedFormatted: '0B', totalFormatted: '0B', used: 0, total: 0, freeFormatted: '0B' },
            moduleStats: { total: 0, active: 0, inactive: 0, updating: 0 },
            modules: []
        };
    }

    async render() {
        await this.loadData();

        return `
            <div class="dashboard-page">
                <div class="dashboard-header">
                    <h2>${this.app.icon('tachometer-alt')} System Overview</h2>
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
                                ${this.app.icon('cubes')}
                            </div>
                            <div class="module-stat-content">
                                <div class="module-stat-value">${this.data.moduleStats.total}</div>
                                <div class="module-stat-label">Total Modules</div>
                            </div>
                        </div>

                        <div class="module-stat-card active" id="active-modules">
                            <div class="module-stat-icon">
                                ${this.app.icon('check-circle')}
                            </div>
                            <div class="module-stat-content">
                                <div class="module-stat-value">${this.data.moduleStats.active}</div>
                                <div class="module-stat-label">Active</div>
                            </div>
                        </div>

                        <div class="module-stat-card inactive" id="inactive-modules">
                            <div class="module-stat-icon">
                                ${this.app.icon('pause-circle')}
                            </div>
                            <div class="module-stat-content">
                                <div class="module-stat-value">${this.data.moduleStats.inactive}</div>
                                <div class="module-stat-label">Disabled</div>
                            </div>
                        </div>

                        <div class="module-stat-card updating" id="updating-modules">
                            <div class="module-stat-icon">
                                ${this.app.icon('sync-alt')}
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
                            ${this.app.icon('microchip')}
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
                            ${this.app.icon('hdd')}
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
            </div>
        `;
    }

    async loadData() {
        try {
            const utils = this.app.utils;
            const model = await utils.execCommand('getprop ro.product.model').catch(() => 'Unknown');
            const android = await utils.execCommand('getprop ro.build.version.release').catch(() => 'Unknown');
            const ksuVersion = await utils.execCommand('ksud -V 2>/dev/null || echo "Unknown"').catch(() => 'Unknown');
            const rootStatus = await utils.checkRoot() ? 'Active' : 'Inactive';

            const storageUsage = await utils.getStorageUsage(CONFIG.IMG_FILE, CONFIG.MNT_DIR);

            const modules = await this.getModules();
            const moduleStats = {
                total: modules.length,
                active: modules.filter(m => m.enabled && !m.hasUpdate).length,
                inactive: modules.filter(m => !m.enabled && !m.hasUpdate).length,
                updating: modules.filter(m => m.hasUpdate).length
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
                moduleStats: { total: 0, active: 0, inactive: 0, updating: 0 },
                modules: []
            };
        }
    }

    async getModules() {
        try {
            const utils = this.app.utils;
            const mounted = await utils.execCommand(`mountpoint -q "${CONFIG.MNT_DIR}" && echo "1"`)
                .then(() => true)
                .catch(() => false);

            if (!mounted) return [];

            const output = await utils.execCommand(`ls -1 "${CONFIG.MNT_DIR}" 2>/dev/null | grep -v lost+found`).catch(() => '');
            const moduleNames = output.trim().split('\n').filter(Boolean);

            const modules = [];
            const uniqueNames = new Set();

            for (const name of moduleNames) {
                if (uniqueNames.has(name)) continue;
                uniqueNames.add(name);

                const modulePath = `${CONFIG.MODULES_DIR}/${name}`;
                const hasUpdate = await utils.execCommand(`[ -f "${modulePath}/update" ] && echo "1"`).then(() => true).catch(() => false);

                const moduleExists = await utils.execCommand(`[ -d "${modulePath}" ] && echo "1"`).then(() => true).catch(() => false);

                let enabled = true;
                if (moduleExists) {
                    enabled = hasUpdate ? false : await utils.execCommand(`[ -f "${modulePath}/disable" ] && echo "0" || echo "1"`)
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
        if (moduleStats.length >= 4) {
            moduleStats[0].textContent = this.data.moduleStats.total;
            moduleStats[1].textContent = this.data.moduleStats.active;
            moduleStats[2].textContent = this.data.moduleStats.inactive;
            moduleStats[3].textContent = this.data.moduleStats.updating;
        }

        const infoCards = document.querySelectorAll('.info-card-content .info-value');
        if (infoCards.length >= 6) {
            infoCards[0].textContent = this.data.deviceInfo.model;
            infoCards[1].textContent = this.data.deviceInfo.android;
            infoCards[2].textContent = this.data.ksuVersion;
            infoCards[3].textContent = this.data.imageStatus.mounted ? 'Mounted' : 'Not Mounted';
            infoCards[4].textContent = this.data.imageStatus.exists ? 'Exists' : 'Not Found';
        }
    }
}