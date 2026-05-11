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
        this.pages = { dashboard: null, modules: null, settings: null, about: null };
        this.init();
    }

    async init() {
        this.renderNav();
        this.bindGlobalEvents();
        this.bindGlobalSwipe();
        await this.showPage('dashboard');
        setTimeout(() => this.updateIslandStatus(), 150);
    }

    async updateIslandStatus() {
        const el = document.getElementById('island-status');
        const txt = document.getElementById('island-status-text');
        if (!el || !txt) return;

        try {
            const mounted = await this.utils.execCommand(`mountpoint -q "${CONFIG.MNT_DIR}" && echo "1"`)
                .then(() => true).catch(() => false);
            const hasRoot = await this.utils.checkRoot();

            if (mounted) {
                el.className = 'island-status';
                txt.textContent = 'Mounted';
            } else if (hasRoot) {
                el.className = 'island-status warn';
                txt.textContent = 'Unmounted';
            } else {
                el.className = 'island-status err';
                txt.textContent = 'No Root';
            }
        } catch {
            el.className = 'island-status err';
            txt.textContent = 'Error';
        }
    }

    bindGlobalEvents() {
        const btn = document.getElementById('global-refresh-btn');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            btn.classList.add('spinning');
            btn.disabled = true;
            try {
                await this.refreshCurrentPage();
                await this.updateIslandStatus();
                this.utils.showToast('Refreshed global webUI', 'success', 1500);
            } catch {
                this.utils.showToast('Refresh failed', 'error');
            } finally {
                btn.classList.remove('spinning');
                btn.disabled = false;
            }
        });
    }

    bindGlobalSwipe() {
        const el = document.getElementById('page-content');
        if (!el) return;
        let startX = 0, startY = 0, locked = false;

        el.addEventListener('touchstart', e => {
            startX = e.changedTouches[0].screenX;
            startY = e.changedTouches[0].screenY;
            locked = false;
        }, { passive: true });

        el.addEventListener('touchmove', e => {
            if (locked) return;
            const dx = Math.abs(e.changedTouches[0].screenX - startX);
            const dy = Math.abs(e.changedTouches[0].screenY - startY);
            if (dy > dx + 10) locked = true;
        }, { passive: true });

        el.addEventListener('touchend', e => {
            if (locked) return;
            const dx = e.changedTouches[0].screenX - startX;
            const dy = e.changedTouches[0].screenY - startY;
            if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.6) return;

            const navOrder = ['dashboard', 'modules', 'settings', 'about'];
            const currentIndex = navOrder.indexOf(this.currentPage);
            if (currentIndex === -1) return;

            let nextIndex = currentIndex;
            if (dx < 0 && currentIndex < navOrder.length - 1) {
                nextIndex = currentIndex + 1;
            } else if (dx > 0 && currentIndex > 0) {
                nextIndex = currentIndex - 1;
            }

            if (nextIndex !== currentIndex) {
                this.showPage(navOrder[nextIndex]);
            }
        }, { passive: true });
    }

    async refreshCurrentPage() {
        if (this.currentPage && this.pages[this.currentPage]) {
            const page = this.pages[this.currentPage];
            if (typeof page.update === 'function') {
                await page.update();
            } else if (typeof page.render === 'function') {
                const content = document.getElementById('page-content');
                content.innerHTML = await page.render();
                if (typeof page.bindEvents === 'function') await page.bindEvents();
            }
        }
    }

    renderNav() {
        const nav = document.getElementById('bottom-nav');
        if (!nav) return;

        const pages = [
            { id: 'dashboard', label: 'Dash',     iconName: 'tachometer-alt' },
            { id: 'modules',   label: 'Modules',  iconName: 'cubes' },
            { id: 'settings',  label: 'Settings', iconName: 'sliders-h' },
            { id: 'about',     label: 'About',    iconName: 'info-circle' },
        ];

        nav.innerHTML = pages.map(p => `
            <button class="nav-item ${this.currentPage === p.id ? 'active' : ''}" data-page="${p.id}">
                ${this.icon(p.iconName)}
                <span>${p.label}</span>
            </button>
        `).join('');

        nav.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', e => {
                const page = e.currentTarget.dataset.page;
                if (this.currentPage !== page) this.showPage(page);
            });
        });
    }

    async showPage(page, options = {}) {
        if (this.isLoading) return;
        this.isLoading = true;
        this.currentPage = page;
        this.renderNav();

        document.body.className = `theme-${page}`;

        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

        const content = document.getElementById('page-content');
        content.innerHTML = '<div class="spinner"></div>';

        try {
            let html = '';
            if (page === 'dashboard') {
                this.pages.dashboard = new DashboardPage(this);
                html = await this.pages.dashboard.render();
                content.innerHTML = html;
                await this.pages.dashboard.bindEvents();
            } else if (page === 'modules') {
                this.pages.modules = new ModulesPage(this);
                html = await this.pages.modules.render();
                content.innerHTML = html;
                await this.pages.modules.bindEvents();
            } else if (page === 'settings') {
                this.pages.settings = new SettingsPage(this);
                html = await this.pages.settings.render();
                content.innerHTML = html;
                await this.pages.settings.bindEvents();
            } else if (page === 'about') {
                this.pages.about = new AboutPage(this);
                html = await this.pages.about.render();
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
    document.addEventListener('DOMContentLoaded', () => { window.app = new MetaOverlayApp(); });
} else {
    window.app = new MetaOverlayApp();
}