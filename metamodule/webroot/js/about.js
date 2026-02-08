export default class AboutPage {
    constructor(app) {
        this.app = app;
        this.moduleInfo = null;

        this.maintainer = {
            name: 'AshBorn',
            role: 'WebUI Development',
            handle: 'GitHub: @RipperHybrid',
            icon: 'user-astronaut'
        };

        this.contributors = [
            { name: 'weishu', role: 'KernelSU Creator', icon: 'user-tie' },
            { name: 'tiann', role: 'KernelSU Core', icon: 'user-tie' },
            { name: 'Ylarod', role: 'Magic Mount', icon: 'user' },
            { name: 'Wang Han', role: 'GitHub: @aviraxp', icon: 'user' },
            { name: '7a72', role: 'GitHub: @7a72', icon: 'user' }
        ];
    }

    renderContributorCard(data, isHighlight = false) {
        const style = isHighlight
            ? 'margin-top: 1rem; border-color: var(--primary-color); background: rgba(124, 58, 237, 0.1);'
            : '';

        const extraInfo = data.handle
            ? `<div class="contributor-username" style="opacity: 0.7; font-size: 0.8rem;">${data.handle}</div>`
            : '';

        return `
            <div class="contributor-card" style="${style}">
                <div class="contributor-icon">
                    ${this.app.icon(data.icon)}
                </div>
                <div class="contributor-info">
                    <div class="contributor-name">${data.name}</div>
                    <div class="contributor-username">${data.role}</div>
                    ${extraInfo}
                </div>
            </div>
        `;
    }

    async render() {
        this.moduleInfo = this.getModuleInfo();

        return `
            <div class="settings-page">
                <div class="settings-header">
                    <h2>${this.app.icon('info-circle')} About</h2>
                </div>

                <div class="settings-sections">
                    <section class="settings-section">
                        <div class="section-header">
                            ${this.app.icon('layer-group')}
                            <h3>Module Information</h3>
                        </div>

                        <div class="about-info">
                            <div class="about-item">
                                <span class="about-label">Module Name:</span>
                                <span class="about-value">${this.moduleInfo.name || 'Unknown'}</span>
                            </div>
                            <div class="about-item">
                                <span class="about-label">Version:</span>
                                <span class="about-value">${this.moduleInfo.version || 'Unknown'}</span>
                            </div>
                            <div class="about-item">
                                <span class="about-label">Version Code:</span>
                                <span class="about-value">${this.moduleInfo.versionCode || 'Unknown'}</span>
                            </div>
                            <div class="about-item">
                                <span class="about-label">Author:</span>
                                <span class="about-value">${this.moduleInfo.author || 'Unknown'}</span>
                            </div>
                            <div class="about-item">
                                <span class="about-label">Module ID:</span>
                                <span class="about-value">${this.moduleInfo.id || 'Unknown'}</span>
                            </div>
                            <div class="about-item">
                                <span class="about-label">Type:</span>
                                <span class="about-value">${this.moduleInfo.metamodule === '1' ? 'Meta Module' : 'Regular Module'}</span>
                            </div>
                            <div class="about-item">
                                <span class="about-label">Status:</span>
                                <span class="about-value status-badge ${this.moduleInfo.enabled === 'true' ? 'status-success' : 'status-error'}">
                                    ${this.moduleInfo.enabled === 'true' ? 'Enabled' : 'Disabled'}
                                </span>
                            </div>
                        </div>
                    </section>

                    <section class="settings-section">
                        <div class="section-header">
                            ${this.app.icon('laptop-code')}
                            <h3>WebUI & Modifications</h3>
                        </div>

                        ${this.renderContributorCard(this.maintainer, true)}

                        <div class="info-box warning" style="margin-top: 1rem;">
                            ${this.app.icon('exclamation-triangle')}
                            <div>
                                <strong>Note:</strong> This WebUI and specific module tweaks are maintained by <strong>${this.maintainer.name}</strong>.
                                Please report UI bugs to ${this.maintainer.name}, distinct from the core project.
                            </div>
                        </div>
                    </section>

                    <section class="settings-section">
                        <div class="section-header">
                            ${this.app.icon('book')}
                            <h3>What is Meta OverlayFS?</h3>
                        </div>

                        <div class="info-box info">
                            ${this.app.icon('lightbulb')}
                            <div>
                                <p style="margin-bottom: 0.8rem;">
                                    Meta OverlayFS is an advanced KernelSU module that uses an image file and overlay filesystem
                                    to manage modules separately from the main modules directory.
                                </p>
                                <p style="margin-bottom: 0.8rem;">
                                    This approach allows for better organization, isolation, and management of modules
                                    without directly modifying the core system directories.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section class="settings-section">
                        <div class="section-header">
                            ${this.app.icon('users')}
                            <h3>Original Base Project</h3>
                        </div>

                        <div class="contributors-grid">
                            ${this.contributors.map(c => this.renderContributorCard(c)).join('')}
                        </div>

                        <div class="info-box info" style="margin-top: 1rem;">
                            ${this.app.icon('heart')}
                            <div>
                                Special thanks to the original creators who built the Meta OverlayFS foundation.
                            </div>
                        </div>
                    </section>

                    <section class="settings-section">
                        <div class="section-header">
                            ${this.app.icon('code')}
                            <h3>Technical Details</h3>
                        </div>

                        <div class="about-info">
                            <div class="about-item">
                                <span class="about-label">Module Directory:</span>
                                <span class="about-value path">${this.moduleInfo.moduleDir || 'Unknown'}</span>
                            </div>
                            <div class="about-item">
                                <span class="about-label">Image Path:</span>
                                <span class="about-value path">${CONFIG.IMG_FILE}</span>
                            </div>
                            <div class="about-item">
                                <span class="about-label">Mount Point:</span>
                                <span class="about-value path">${CONFIG.MNT_DIR}</span>
                            </div>
                            <div class="about-item">
                                <span class="about-label">Filesystem:</span>
                                <span class="about-value">ext4</span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        `;
    }

    getModuleInfo() {
        try {
            if (typeof ksu !== 'undefined' && typeof ksu.moduleInfo === 'function') {
                const info = ksu.moduleInfo();
                if (info) {
                    if (typeof info === 'string') {
                        return JSON.parse(info);
                    }
                    return info;
                }
            }
        } catch (error) {
            console.error('Error getting module info:', error);
        }

        return {
            id: 'Unknown',
            moduleDir: 'Unknown',
            name: 'Unknown',
            version: 'Unknown',
            versionCode: 'Unknown',
            author: 'Unknown',
            metamodule: '0',
            enabled: 'false'
        };
    }

    async bindEvents() {
        return;
    }
}