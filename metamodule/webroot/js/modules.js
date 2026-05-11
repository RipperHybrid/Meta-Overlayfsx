export default class ModulesPage {
    constructor(app) {
        this.app = app;
        this.modules = [];
        this.searchTerm = '';
        this.loading = false;
    }

    async render() {
        await this.loadModules();
        return this.buildHTML();
    }

    buildHTML() {
        const filtered = this.filterModules();
        const m = this.modules;
        const activeCount = m.filter(x => x.enabled && !x.removePending).length;
        const fParts = [`<span>${m.length} total</span>`, `<span class="text-green">${activeCount} active</span>`].join('<span>·</span>');

        return `
        <div class="modules-page">
            <div class="search-bar mb-4">
                ${this.app.icon('search')}
                <input type="text" id="module-search" placeholder="Search modules..." value="${this.searchTerm}" autocomplete="off" spellcheck="false">
            </div>
            <div id="modules-content">
                ${this.renderList(filtered)}
            </div>
            <div class="modules-footer" id="modules-footer">
                ${fParts}
            </div>
        </div>
        `;
    }

    renderList(filtered) {
        if (filtered.length === 0) {
            return `<div class="empty-state">${this.app.icon('inbox')}<h3>No modules</h3><p>${this.searchTerm ? 'No modules match.' : 'No modules found.'}</p></div>`;
        }
        return filtered.map((m, i) => this.renderSlab(m, i)).join('');
    }

    renderSlab(module, index) {
        const name = module.name || module.id;
        let statusClass = 'active';
        let badgeHtml = '';
        let avatarIcon = 'check-circle';
        if (module.removePending) {
            statusClass = 'uninstalling'; avatarIcon = 'trash';
            badgeHtml = `<span class="slab-badge uninstalling">Removing</span>`;
        } else if (module.hasUpdate) {
            statusClass = 'updating'; avatarIcon = 'sync-alt';
            badgeHtml = `<span class="slab-badge updating">${this.app.icon('sync-alt')} Update</span>`;
        } else if (!module.enabled) {
            statusClass = 'inactive'; avatarIcon = 'pause-circle';
            badgeHtml = `<span class="slab-badge inactive">Off</span>`;
        } else {
            badgeHtml = `<span class="slab-badge active"><span class="live-dot"></span> On</span>`;
        }
        const tags = [];
        if (module.id !== name) tags.push(`<span class="slab-tag">${this.app.icon('code')} ${module.id}</span>`);
        if (module.activeFiles !== undefined) tags.push(`<span class="slab-tag">${this.app.icon('file-alt')} ${module.activeFiles} Files</span>`);

        if (module.conflictsLost && module.conflictsLost.length > 0) {
            tags.push(`<span class="slab-tag text-red tag-danger">${this.app.icon('exclamation-circle')} ${module.conflictsLost.length} Ignored</span>`);
        }
        if (module.conflictsWon && module.conflictsWon.length > 0) {
            tags.push(`<span class="slab-tag text-yellow tag-warning">${this.app.icon('exclamation-triangle')} ${module.conflictsWon.length} Overwrites</span>`);
        }

        if (!module.existsInModulesDir) tags.push(`<span class="slab-tag text-red">${this.app.icon('exclamation-triangle')} Not Linked</span>`);

        let actionsHtml = module.removePending ?
            `<button class="slab-btn success restore-module" data-module="${module.id}">${this.app.icon('undo')} Restore</button>` :
            (module.hasUpdate ? `<button class="slab-btn" disabled>${this.app.icon('ban')} Update Pending</button>` :
            `<button class="slab-btn info-module" data-module="${module.id}">${this.app.icon('info-circle')} Info</button>
             <button class="slab-btn danger uninstall-module" data-module="${module.id}">${this.app.icon('trash')} Delete</button>
             <button class="slab-btn ${module.enabled ? 'warning' : 'success'} toggle-module" data-module="${module.id}" data-action="${module.enabled ? 'disable' : 'enable'}">${this.app.icon(module.enabled ? 'pause' : 'play')} ${module.enabled ? 'Disable' : 'Enable'}</button>`);

        return `
            <div class="module-slab ${statusClass}" data-module="${module.id}" style="animation-delay:${(index % 10) * 40}ms">
                <div class="slab-top">
                    <div class="slab-avatar">${this.app.icon(avatarIcon)}</div>
                    <div class="slab-info"><div class="slab-name">${name}</div>${tags.length ? `<div class="slab-meta">${tags.join('')}</div>` : ''}</div>
                    ${badgeHtml}
                </div>
                <div class="slab-actions">${actionsHtml}</div>
            </div>`;
    }

    async loadModules() {
        if (this.loading) return;
        this.loading = true;
        try {
            const utils = this.app.utils;
            const mounted = await utils.execCommand(`mountpoint -q "${CONFIG.MNT_DIR}" && echo "1"`).then(() => true).catch(() => false);
            if (!mounted) { this.modules = []; return; }
            const cmd = `sizes=$(du -sk "${CONFIG.MODULES_DIR}"/* 2>/dev/null); ls -1 "${CONFIG.MNT_DIR}" 2>/dev/null | grep -v 'lost+found' | grep -v '_update$' | while read -r id; do [ -z "$id" ] && continue; p="${CONFIG.MODULES_DIR}/$id"; name=$(grep "^name=" "$p/module.prop" 2>/dev/null | cut -d'=' -f2-); exists=$([ -d "$p" ] && echo "1" || echo "0"); upd=$([ -f "$p/update" ] && echo "1" || echo "0"); rmv=$([ -f "$p/remove" ] && echo "1" || echo "0"); dis=$([ -f "$p/disable" ] && echo "1" || echo "0"); size=0; if [ "$exists" = "1" ]; then size=$(echo "$sizes" | grep -w "$p" | awk '{print $1}'); fi; echo "$id|__NAME__|$name|__STAT__|$exists|$upd|$rmv|$dis|$size"; done`;
            const out = await utils.execCommand(cmd);
            if (!out) return [];
            const modules = [];
            const lines = out.trim().split('\n');
            for (const line of lines) {
                if (!line.includes('|__NAME__|')) continue;
                const parts = line.split('|__STAT__|');
                const [id, namePart] = parts[0].split('|__NAME__|');
                const [existsStr, updStr, rmvStr, disStr, sizeStr] = parts[1].split('|');

                const exists = existsStr === '1';
                const hasUpdate = updStr === '1';
                const removePending = rmvStr === '1';
                const disabled = disStr === '1';

                const name = namePart.trim() || id;
                const sizeBytes = (parseInt(sizeStr) || 0) * 1024;
                const enabled = exists ? !disabled : false;

                modules.push({
                    id,
                    name,
                    enabled,
                    hasUpdate,
                    removePending,
                    existsInModulesDir: exists,
                    sizeFormatted: utils.formatBytes(sizeBytes),
                    conflictsLost: [],
                    conflictsWon: [],
                    activeFiles: undefined,
                    partitions: []
                });
            }
            modules.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
            try {
                const inspectRaw = await utils.execCommand(`"${CONFIG.BINARY}" inspect -r 2>/dev/null`);
                const sIdx = inspectRaw.indexOf('{'), eIdx = inspectRaw.lastIndexOf('}');
                if (sIdx !== -1 && eIdx !== -1) {
                    const cleanJson = inspectRaw.substring(sIdx, eIdx + 1);
                    const inspectData = JSON.parse(cleanJson);
                    if (inspectData.status === 'success') {
                        for (const m of modules) {
                            const mData = (inspectData.modules || []).find(x => x.id === m.id);
                            if (mData) { m.activeFiles = mData.files; m.partitions = mData.partitions || []; }
                            if (inspectData.conflicts) {
                                for (const c of inspectData.conflicts) {
                                    if (c.ignored && c.ignored.includes(m.id)) m.conflictsLost.push(c);
                                    if (c.winner === m.id) m.conflictsWon.push(c);
                                }
                            }
                        }
                    }
                }
            } catch (e) {}
            this.modules = modules;
        } catch (err) { this.modules = []; } finally { this.loading = false; }
    }

    filterModules() {
        let list = this.modules;
        if (this.searchTerm) {
            const q = this.searchTerm.toLowerCase();
            list = list.filter(m => m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q)));
        }
        return list;
    }

    async bindEvents() {
        document.getElementById('module-search')?.addEventListener('input', e => {
            this.searchTerm = e.target.value;
            this.refreshContent();
        });
        this.bindModuleActions();
    }

    bindModuleActions() {
        const content = document.getElementById('modules-content');
        if (!content) return;
        content.onclick = async e => {
            const toggleBtn = e.target.closest('.toggle-module');
            const uninstallBtn = e.target.closest('.uninstall-module');
            const restoreBtn = e.target.closest('.restore-module');
            const infoBtn = e.target.closest('.info-module');
            if (toggleBtn) await this.toggleModule(toggleBtn.dataset.module, toggleBtn.dataset.action === 'enable');
            else if (uninstallBtn) {
                const id = uninstallBtn.dataset.module;
                const m = this.modules.find(x => x.id === id);
                if (await this.app.utils.confirmAction('Uninstall', `Remove <strong>${m?.name || id}</strong> on next reboot?`, 'Uninstall')) await this.toggleUninstall(id, true);
            } else if (restoreBtn) await this.toggleUninstall(restoreBtn.dataset.module, false);
            else if (infoBtn) await this.showModuleInfo(this.modules.find(x => x.id === infoBtn.dataset.module));
        };
    }

    async showModuleInfo(m) {
        if (!m) return;
        let content = `<div class="module-info-modal">
            <div class="info-stats-card">
                <div class="info-stat"><span class="stat-label">Active Files</span><span class="stat-value text-blue">${m.activeFiles !== undefined ? m.activeFiles : '—'}</span></div>
                <div class="info-stat"><span class="stat-label">Mounted In</span><span class="stat-value mounts-list">${m.partitions?.length ? [...new Set(m.partitions)].map(p => `<span class="mount-tag">${p}</span>`).join('') : '<span class="text-3">None</span>'}</span></div>
            </div>`;

        const renderConflictItems = (list, isLost) => {
            const seen = new Set();
            return list.map(c => {
                const fileName = c.file.split('/').pop();
                const sig = `${fileName}-${isLost ? c.winner : c.ignored.join(',')}`;
                if (seen.has(sig)) return '';
                seen.add(sig);
                return `<div class="conflict-item clickable-conflict" onclick="app.pages.modules.showPathDetails('${c.file}', '${c.winner}', '${(c.ignored || []).join(',')}')">
                    <div class="conflict-icon">${this.app.icon('file-alt')}</div>
                    <div class="conflict-details">
                        <div class="conflict-file">${fileName}</div>
                        <div class="conflict-reason">${isLost ? `Lost to <span>${c.winner}</span>` : `Overrides <span>${c.ignored.join(', ')}</span>`}</div>
                    </div>
                    <div class="conflict-arrow">${this.app.icon('play')}</div>
                </div>`;
            }).join('');
        };

        if (m.conflictsLost?.length) content += `<div class="conflict-section bad"><div class="conflict-header">${this.app.icon('exclamation-circle')} Ignored by Mount</div><div class="conflict-list">${renderConflictItems(m.conflictsLost, true)}</div></div>`;
        if (m.conflictsWon?.length) content += `<div class="conflict-section warn"><div class="conflict-header">${this.app.icon('exclamation-triangle')} Active Overwrites</div><div class="conflict-list">${renderConflictItems(m.conflictsWon, false)}</div></div>`;
        if (!m.conflictsLost?.length && !m.conflictsWon?.length) content += `<div class="empty-state clean-mount-state">
                ${this.app.icon('check-circle')}
                <h3 class="text-green mb-4">Clean Mount</h3>
                <p>No file conflicts detected.</p>
            </div>`;

        content += `</div>`;
        await this.app.utils.showModal(`${m.name || m.id}`, content, [{ text: 'Close', type: 'secondary', result: 'close' }]);
    }

    async showPathDetails(file, winner, ignoredStr) {
        const ignored = ignoredStr.split(',');
        const content = `
        <div class="path-details-modal">
            <div class="path-group">
                <div class="path-header text-green">${this.app.icon('check-circle')} Running (Active)</div>
                <div class="path-box-full"><strong>Module:</strong> ${winner}<br><strong>Path:</strong> /${file}</div>
            </div>
            <div class="path-group">
                <div class="path-header text-red">${this.app.icon('ban')} Ignored (Shadowed)</div>
                ${ignored.map(id => `<div class="path-box-full"><strong>Module:</strong> ${id}<br><strong>Path:</strong> /${file}</div>`).join('')}
            </div>
        </div>`;
        await this.app.utils.showModal('Path Conflict Details', content, [{ text: 'Done', type: 'primary', result: 'ok' }]);
    }

    refreshContent() {
        const content = document.getElementById('modules-content');
        if (content) content.innerHTML = this.renderList(this.filterModules());
    }

    async toggleModule(moduleId, enable) {
        try {
            const m = this.modules.find(x => x.id === moduleId);
            const displayName = m?.name || moduleId;
            await this.app.utils.execCommand(enable ? `rm -f "${CONFIG.MODULES_DIR}/${moduleId}/disable"` : `touch "${CONFIG.MODULES_DIR}/${moduleId}/disable"`);
            this.app.utils.showToast(`Module '${displayName}' ${enable ? 'enabled' : 'disabled'}`, enable ? 'success' : 'warning');
            await this.update();
        } catch (err) {
            this.app.utils.logToFile(`Toggle failure: ${err.message}`, 'ERROR');
            this.app.utils.showToast(err.message, 'error');
        }
    }

    async toggleUninstall(moduleId, remove) {
        try {
            const m = this.modules.find(x => x.id === moduleId);
            const displayName = m?.name || moduleId;
            await this.app.utils.execCommand(remove ? `touch "${CONFIG.MODULES_DIR}/${moduleId}/remove"` : `rm -f "${CONFIG.MODULES_DIR}/${moduleId}/remove"`);
            this.app.utils.showToast(remove ? `'${displayName}' queued for removal` : `'${displayName}' restored`, remove ? 'error' : 'success');
            await this.update();
        } catch (err) {
            this.app.utils.logToFile(`Removal toggle failure: ${err.message}`, 'ERROR');
            this.app.utils.showToast(err.message, 'error');
        }
    }

    async update() {
        await this.loadModules();
        this.refreshContent();
    }
}