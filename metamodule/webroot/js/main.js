import '../style.css';
import Utils from './utils.js';
import { icon } from './icons.js';
import DashboardPage from './dashboard.js';
import ModulesPage from './modules.js';
import SettingsPage from './settings.js';
import AboutPage from './about.js';

class MetaOverlayApp {
    constructor() {

        this.utils = Utils;
        this.icon = icon;

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
        this.bindGlobalEvents();
        await this.showPage('dashboard');

        setTimeout(async () => {
            await this.utils.updateRootStatus();
        }, 100);
    }

    bindGlobalEvents() {
        const globalRefreshBtn = document.getElementById('global-refresh-btn');
        if (globalRefreshBtn) {
            globalRefreshBtn.addEventListener('click', async () => {
                const iconEl = globalRefreshBtn.querySelector('.icon');
                if (iconEl) iconEl.classList.add('fa-spin');
                globalRefreshBtn.disabled = true;

                try {
                    await this.refreshCurrentPage();
                    this.utils.showToast('Page refreshed', 'success', 1500);
                } catch (e) {
                    this.utils.showToast('Refresh failed', 'error');
                } finally {
                    if (iconEl) iconEl.classList.remove('fa-spin');
                    globalRefreshBtn.disabled = false;
                }
            });
        }
    }

    async refreshCurrentPage() {
        if (this.currentPage && this.pages[this.currentPage]) {
            if (typeof this.pages[this.currentPage].update === 'function') {
                await this.pages[this.currentPage].update();
            } else if (typeof this.pages[this.currentPage].render === 'function') {
                const content = document.getElementById('page-content');
                const html = await this.pages[this.currentPage].render();
                content.innerHTML = html;
                if (typeof this.pages[this.currentPage].bindEvents === 'function') {
                    await this.pages[this.currentPage].bindEvents();
                }
            }
        }
        await this.utils.updateRootStatus();
    }

    renderNav() {
        const nav = document.getElementById('bottom-nav');
        nav.innerHTML = `
            <button class="nav-item ${this.currentPage === 'dashboard' ? 'active' : ''}" data-page="dashboard">
                ${this.icon('tachometer-alt')}
                <span>Dashboard</span>
            </button>
            <button class="nav-item ${this.currentPage === 'modules' ? 'active' : ''}" data-page="modules">
                ${this.icon('cubes')}
                <span>Modules</span>
            </button>
            <button class="nav-item ${this.currentPage === 'settings' ? 'active' : ''}" data-page="settings">
                ${this.icon('sliders-h')}
                <span>Settings</span>
            </button>
            <button class="nav-item ${this.currentPage === 'about' ? 'active' : ''}" data-page="about">
                ${this.icon('info-circle')}
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
                    ${this.icon('exclamation-triangle')}
                    <h3>Error Loading Page</h3>
                    <p>${error.message}</p>
                </div>
            `;
        } finally {
            this.isLoading = false;
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new MetaOverlayApp();
    });
} else {
    window.app = new MetaOverlayApp();
}