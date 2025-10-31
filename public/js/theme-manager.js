// Theme Management System
class ThemeManager {
    constructor() {
        this.themes = {
            light: '/css/light-theme.css',
            dark: '/css/dark-theme.css'
        };
        this.currentTheme = this.getStoredTheme() || 'dark';
        this.themeLink = null;
        this.init();
    }

    init() {
        this.createThemeLink();
        this.loadTheme(this.currentTheme);
        this.createThemeSwitcher();
        this.addEventListeners();
    }

    createThemeLink() {
        this.themeLink = document.createElement('link');
        this.themeLink.rel = 'stylesheet';
        this.themeLink.id = 'theme-stylesheet';
        document.head.appendChild(this.themeLink);
    }

    createThemeSwitcher() {
        const switcher = document.createElement('div');
        switcher.className = 'theme-switcher';
        switcher.innerHTML = `
            <button class="theme-toggle ${this.currentTheme === 'light' ? 'active' : ''}" data-theme="light">
                ☀️ Light
            </button>
            <button class="theme-toggle ${this.currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
                🌙 Dark
            </button>
        `;
        document.body.appendChild(switcher);
    }

    addEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('theme-toggle')) {
                const theme = e.target.getAttribute('data-theme');
                this.switchTheme(theme);
            }
        });

        // Keyboard shortcut: Ctrl+Shift+T to toggle theme
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                const nextTheme = this.currentTheme === 'light' ? 'dark' : 'light';
                this.switchTheme(nextTheme);
            }
        });
    }

    switchTheme(theme) {
        if (this.themes[theme] && theme !== this.currentTheme) {
            this.loadTheme(theme);
            this.updateSwitcherUI(theme);
            this.storeTheme(theme);
            this.currentTheme = theme;
            
            // Dispatch custom event for theme change
            window.dispatchEvent(new CustomEvent('themeChanged', { 
                detail: { theme: theme } 
            }));
        }
    }

    loadTheme(theme) {
        if (this.themeLink && this.themes[theme]) {
            this.themeLink.href = this.themes[theme];
            
            // Add loading class for smooth transition
            document.body.classList.add('theme-loading');
            
            // Update HTML element class for theme-based styling
            document.documentElement.classList.remove('light-theme', 'dark-theme');
            document.documentElement.classList.add(theme + '-theme');
            
            this.themeLink.onload = () => {
                document.body.classList.remove('theme-loading');
                document.body.setAttribute('data-theme', theme);
                
                // Dispatch a custom event when theme is fully loaded
                document.dispatchEvent(new CustomEvent('themeChanged', { 
                    detail: { theme: theme } 
                }));
            };
        }
    }

    updateSwitcherUI(activeTheme) {
        const buttons = document.querySelectorAll('.theme-toggle');
        buttons.forEach(button => {
            const theme = button.getAttribute('data-theme');
            button.classList.toggle('active', theme === activeTheme);
        });
    }

    storeTheme(theme) {
        try {
            localStorage.setItem('preferred-theme', theme);
        } catch (e) {
            console.warn('Could not save theme preference:', e);
        }
    }

    getStoredTheme() {
        try {
            return localStorage.getItem('preferred-theme');
        } catch (e) {
            console.warn('Could not load theme preference:', e);
            return null;
        }
    }

    // Public method to get current theme
    getCurrentTheme() {
        return this.currentTheme;
    }

    // Public method to set theme programmatically
    setTheme(theme) {
        this.switchTheme(theme);
    }
}

// Auto-detect system preference if no stored preference
function getSystemThemePreference() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

// Initialize theme manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if theme manager already exists
    if (!window.themeManager) {
        window.themeManager = new ThemeManager();
        
        // If no stored preference, use system preference
        if (!window.themeManager.getStoredTheme()) {
            const systemTheme = getSystemThemePreference();
            window.themeManager.setTheme(systemTheme);
        }
    }
});

// Listen for system theme changes
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // Only auto-switch if user hasn't manually set a preference
        if (window.themeManager && !window.themeManager.getStoredTheme()) {
            const newTheme = e.matches ? 'dark' : 'light';
            window.themeManager.setTheme(newTheme);
        }
    });
}

// Add CSS for theme loading transition
const style = document.createElement('style');
style.textContent = `
    body.theme-loading {
        transition: opacity 0.2s ease;
        opacity: 0.9;
    }
`;
document.head.appendChild(style);

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}