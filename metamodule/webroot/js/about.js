export default class AboutPage {
    constructor(app) {
        this.app = app;
        this.moduleInfo = null;
        this.bannerBase64 = '';
        this.maintainer = {
            name: 'AshBorn',
            role: 'Fork Maintainer (WebUI & Core)',
            handle: '@RipperHybrid',
            icon: 'user-astronaut',
            highlight: true
        };
        this.contributors = [
            { name: 'weishu / tiann', role: 'KernelSU Creator & Core', icon: 'user-tie' },
            { name: 'Ylarod',         role: 'Magic Mount',              icon: 'user' },
            { name: 'Wang Han',       role: 'GitHub: @aviraxp',         icon: 'user' },
            { name: '7a72',           role: 'GitHub: @7a72',            icon: 'user' },
        ];
    }

    async render() {
        this.moduleInfo = this.getModuleInfo();
        const moduleId = this.moduleInfo.id && this.moduleInfo.id !== '—' ? this.moduleInfo.id : 'overlayfsx';

        try {
            const rawB64 = await this.app.utils.execCommand(`base64 "${CONFIG.MODULES_DIR}/${moduleId}/banner" 2>/dev/null`);
            if (rawB64) {
                const cleanB64 = rawB64.replace(/\s+/g, '');
                if (cleanB64.length > 100) {
                    this.bannerBase64 = `data:image/png;base64,${cleanB64}`;
                }
            }
        } catch (err) {}

        return this.buildHTML();
    }

    buildHTML() {
        const info = this.moduleInfo;
        const bannerHtml = this.bannerBase64 ? `<img src="${this.bannerBase64}" class="about-banner">` : '';

        return `
        <div class="about-page">
            ${bannerHtml}

            <div class="s-plane">
                <div class="s-plane-head">
                    <div class="s-plane-icon icon-blue">
                        ${this.app.icon('layer-group')}
                    </div>
                    <div class="s-plane-title">Module</div>
                </div>
                ${[
                    { k: 'Name',        v: info.name || '—' },
                    { k: 'Version',     v: info.version || '—' },
                    { k: 'Version Code',v: info.versionCode || '—' },
                    { k: 'Author',      v: info.author || '—' },
                    { k: 'Module ID',   v: info.id || '—' },
                    { k: 'Type',        v: info.metamodule === '1' ? 'Meta Module' : 'Regular Module' },
                ].map(row => `
                    <div class="s-row cursor-default">
                        <div class="s-row-body">
                            <div class="s-row-label">${row.k}</div>
                        </div>
                        <span class="s-row-value">${row.v}</span>
                    </div>
                `).join('')}
                <div class="s-row cursor-default border-none">
                    <div class="s-row-body">
                        <div class="s-row-label">Status</div>
                    </div>
                    <span class="s-row-value ${info.enabled === 'true' ? 'ok' : 'bad'}">
                        ${info.enabled === 'true' ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
            </div>

            <div class="s-plane">
                <div class="s-plane-head">
                    <div class="s-plane-icon icon-violet">
                        ${this.app.icon('laptop-code')}
                    </div>
                    <div class="s-plane-title">WebUI & Modifications</div>
                </div>
                <div class="contributor-card">
                    <div class="contributor-avatar highlight">
                        ${this.app.icon(this.maintainer.icon)}
                    </div>
                    <div class="contributor-info">
                        <div class="contributor-name">${this.maintainer.name}</div>
                        <div class="contributor-role">${this.maintainer.role}</div>
                        <div class="contributor-handle">${this.maintainer.handle}</div>
                    </div>
                </div>
                <div class="info-banner warn border-top-subtle">
                    ${this.app.icon('exclamation-triangle')}
                    <span>Problem with this fork project? Report it to <strong>${this.maintainer.name}</strong>. Do not report bugs for this modified fork to the original creators.</span>
                </div>
            </div>

            <div class="s-plane">
                <div class="s-plane-head">
                    <div class="s-plane-icon icon-blue">
                        ${this.app.icon('book')}
                    </div>
                    <div class="s-plane-title">What is Meta OverlayFS?</div>
                </div>
                <div class="info-banner pad-14 border-none">
                    ${this.app.icon('lightbulb')}
                    <span>An advanced KernelSU module that uses an image file and overlay filesystem to manage modules separately from the main modules directory — enabling better isolation and organization without touching core system directories.</span>
                </div>
            </div>

            <div class="s-plane">
                <div class="s-plane-head">
                    <div class="s-plane-icon icon-green">
                        ${this.app.icon('users')}
                    </div>
                    <div class="s-plane-title">Original Base Project</div>
                </div>
                ${this.contributors.map(c => `
                    <div class="contributor-card">
                        <div class="contributor-avatar">
                            ${this.app.icon(c.icon)}
                        </div>
                        <div class="contributor-info">
                            <div class="contributor-name">${c.name}</div>
                            <div class="contributor-role">${c.role}</div>
                        </div>
                    </div>
                `).join('')}
                <div class="info-banner ok border-top-subtle">
                    ${this.app.icon('heart')}
                    <span>Thanks to the original creators who built the Meta OverlayFS foundation.</span>
                </div>
            </div>
        </div>
        `;
    }

    getModuleInfo() {
        try {
            if (typeof ksu !== 'undefined' && typeof ksu.moduleInfo === 'function') {
                const info = ksu.moduleInfo();
                if (info) return typeof info === 'string' ? JSON.parse(info) : info;
            }
        } catch (err) {}
        return { id: '—', moduleDir: '—', name: '—', version: '—', versionCode: '—', author: '—', metamodule: '0', enabled: 'false' };
    }

    async bindEvents() {}
}