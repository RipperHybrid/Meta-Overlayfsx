class MetaOverlayApp {
    constructor() {
        this.currentPage = null;
        this.isLoading = false;
        this.pages = {
            dashboard: null,
            modules: null,
            settings: null,
            about: null
        };
        this.init();
    }

    async init() {
        this.renderNav();
        await this.showPage('dashboard');
        
        setTimeout(async () => {
            await Utils.updateRootStatus();
        }, 100);
    }

    renderNav() {
        const nav = document.getElementById('bottom-nav');
        nav.innerHTML = `
            <button class="nav-item ${this.currentPage === 'dashboard' ? 'active' : ''}" data-page="dashboard">
                ${icon('tachometer-alt')}
                <span>Dashboard</span>
            </button>
            <button class="nav-item ${this.currentPage === 'modules' ? 'active' : ''}" data-page="modules">
                ${icon('cubes')}
                <span>Modules</span>
            </button>
            <button class="nav-item ${this.currentPage === 'settings' ? 'active' : ''}" data-page="settings">
                ${icon('sliders-h')}
                <span>Settings</span>
            </button>
            <button class="nav-item ${this.currentPage === 'about' ? 'active' : ''}" data-page="about">
                ${icon('info-circle')}
                <span>About</span>
            </button>
        `;
        
        nav.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const page = e.currentTarget.dataset.page;
                if (this.currentPage !== page) {
                    this.showPage(page);
                }
            });
        });
    }

    async showPage(page, options = {}) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.currentPage = page;
        this.renderNav();
        
        const content = document.getElementById('page-content');
        content.innerHTML = '<div class="spinner"></div>';
        
        try {
            if (page === 'dashboard') {
                this.pages.dashboard = new DashboardPage(this);
                const html = await this.pages.dashboard.render();
                content.innerHTML = html;
                await this.pages.dashboard.bindEvents();
            } else if (page === 'modules') {
                this.pages.modules = new ModulesPage(this);
                if (options.filter) {
                    this.pages.modules.filter = options.filter;
                }
                const html = await this.pages.modules.render();
                content.innerHTML = html;
                await this.pages.modules.bindEvents();
            } else if (page === 'settings') {
                this.pages.settings = new SettingsPage(this);
                const html = await this.pages.settings.render();
                content.innerHTML = html;
                await this.pages.settings.bindEvents();
            } else if (page === 'about') {
                this.pages.about = new AboutPage(this);
                const html = await this.pages.about.render();
                content.innerHTML = html;
                await this.pages.about.bindEvents();
            }
        } catch (error) {
            content.innerHTML = `
                <div class="empty-state">
                    ${icon('exclamation-triangle')}
                    <h3>Error Loading Page</h3>
                    <p>${error.message}</p>
                </div>
            `;
        } finally {
            this.isLoading = false;
        }
    }

    setupAutoRefresh() {
        setInterval(() => {
            if (this.currentPage === 'dashboard' && this.pages.dashboard?.autoRefresh) {
                this.pages.dashboard.update();
            }
        }, 10000);
        
        setInterval(() => {
            if (this.currentPage === 'modules' && this.pages.modules) {
                this.pages.modules.update();
            }
        }, 15000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new MetaOverlayApp();
        window.app.setupAutoRefresh();
    });
} else {
    window.app = new MetaOverlayApp();
    window.app.setupAutoRefresh();
}