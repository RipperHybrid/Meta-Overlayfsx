class AboutPage {
    constructor(app) {
        this.app = app;
        this.moduleInfo = null;
    }

    async render() {
        this.moduleInfo = this.getModuleInfo();
        
        return `
            <div class="settings-page">
                <div class="settings-header">
                    <h2>${icon('info-circle')} About</h2>
                </div>
                
                <div class="settings-sections">
                    <section class="settings-section">
                        <div class="section-header">
                            ${icon('layer-group')}
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
                            ${icon('laptop-code')}
                            <h3>WebUI & Modifications</h3>
                        </div>
                        
                        <div class="contributor-card" style="margin-top: 1rem; border-color: var(--primary-color); background: rgba(124, 58, 237, 0.1);">
                            <div class="contributor-icon">
                                ${icon('user-astronaut')}
                            </div>
                            <div class="contributor-info">
                                <div class="contributor-name">AshBorn</div>
                                <div class="contributor-username">WebUI & Selective Live Patching</div>
                                <div class="contributor-username" style="opacity: 0.7; font-size: 0.8rem;">GitHub: @RipperHybrid</div>
                            </div>
                        </div>

                        <div class="info-box warning" style="margin-top: 1rem;">
                            ${icon('exclamation-triangle')}
                            <div>
                                <strong>Note:</strong> This WebUI and specific module tweaks are maintained by <strong>AshBorn</strong>. 
                                Please report UI bugs to AshBorn, distinct from the core project.
                            </div>
                        </div>
                    </section>
                    
                    <section class="settings-section">
                        <div class="section-header">
                            ${icon('book')}
                            <h3>What is Meta OverlayFS?</h3>
                        </div>
                        
                        <div class="info-box info">
                            ${icon('lightbulb')}
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
                            ${icon('users')}
                            <h3>Original Base Project</h3>
                        </div>
                        
                        <div class="contributors-grid">
                            <div class="contributor-card">
                                <div class="contributor-icon">
                                    ${icon('user-tie')}
                                </div>
                                <div class="contributor-info">
                                    <div class="contributor-name">weishu</div>
                                    <div class="contributor-username">KernelSU Creator</div>
                                </div>
                            </div>
                            
                            <div class="contributor-card">
                                <div class="contributor-icon">
                                    ${icon('user-tie')}
                                </div>
                                <div class="contributor-info">
                                    <div class="contributor-name">tiann</div>
                                    <div class="contributor-username">KernelSU Core</div>
                                </div>
                            </div>
                            
                            <div class="contributor-card">
                                <div class="contributor-icon">
                                    ${icon('user')}
                                </div>
                                <div class="contributor-info">
                                    <div class="contributor-name">Ylarod</div>
                                    <div class="contributor-username">Magic Mount</div>
                                </div>
                            </div>
                            
                            <div class="contributor-card">
                                <div class="contributor-icon">
                                    ${icon('user')}
                                </div>
                                <div class="contributor-info">
                                    <div class="contributor-name">Wang Han</div>
                                    <div class="contributor-username">GitHub: @aviraxp</div>
                                </div>
                            </div>
                            
                            <div class="contributor-card">
                                <div class="contributor-icon">
                                    ${icon('user')}
                                </div>
                                <div class="contributor-info">
                                    <div class="contributor-name">7a72</div>
                                    <div class="contributor-username">GitHub: @7a72</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="info-box info" style="margin-top: 1rem;">
                            ${icon('heart')}
                            <div>
                                Special thanks to the original creators who built the Meta OverlayFS foundation.
                            </div>
                        </div>
                    </section>
                    
                    <section class="settings-section">
                        <div class="section-header">
                            ${icon('code')}
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