// ============================================
// SISTEMA DE TRADUÇÃO I18N - BEMTEVI
// ============================================

const I18n = {
    currentLocale: 'pt-BR',
    fallbackLocale: 'pt-BR',
    translations: {},
    listeners: [],
    initialized: false,
    
    // Inicializar
    async init() {
        if (this.initialized) return this;
        
        const saved = localStorage.getItem('bemtevi_locale');
        if (saved && ['pt-BR', 'en-US', 'es-ES'].includes(saved)) {
            this.currentLocale = saved;
        } else {
            const browserLang = navigator.language || navigator.languages?.[0] || 'pt-BR';
            if (browserLang.startsWith('en')) this.currentLocale = 'en-US';
            else if (browserLang.startsWith('es')) this.currentLocale = 'es-ES';
            else this.currentLocale = 'pt-BR';
        }
        
        await this.loadTranslations(this.currentLocale);
        this.applyTranslations();
        this.setupSelector();
        this.initialized = true;
        
        console.log(`🌐 Bemtevi - Idioma carregado: ${this.currentLocale}`);
        return this;
    },
    
    async loadTranslations(locale) {
        try {
            const response = await fetch(`/translate/bemtevi/locales/${locale}.json`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.translations = await response.json();
            this.currentLocale = locale;
            localStorage.setItem('bemtevi_locale', locale);
        } catch (error) {
            console.error('Erro ao carregar traduções:', error);
            if (locale !== 'pt-BR') {
                await this.loadTranslations('pt-BR');
            } else {
                this.translations = {};
            }
        }
    },
    
    t(key, params = {}) {
        let translation = this.translations[key];
        if (!translation) {
            const keys = key.split('.');
            let value = this.translations;
            for (const k of keys) {
                if (value && value[k] !== undefined) {
                    value = value[k];
                } else {
                    return key;
                }
            }
            translation = value;
        }
        
        if (typeof translation === 'string' && Object.keys(params).length > 0) {
            for (const [k, v] of Object.entries(params)) {
                translation = translation.replace(new RegExp(`{{${k}}}`, 'g'), v);
            }
        }
        
        return translation;
    },
    
    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            if (translation && typeof translation === 'string') {
                if (el.innerHTML && el.innerHTML.includes('<') && translation.includes('<')) {
                    el.innerHTML = translation;
                } else {
                    el.textContent = translation;
                }
            }
        });
        
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const translation = this.t(key);
            if (translation && typeof translation === 'string') {
                el.placeholder = translation;
            }
        });
        
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const translation = this.t(key);
            if (translation && typeof translation === 'string') {
                el.title = translation;
            }
        });
        
        this.listeners.forEach(fn => fn(this.currentLocale, this.translations));
    },
    
    async setLocale(locale) {
        if (locale === this.currentLocale) return;
        await this.loadTranslations(locale);
        this.applyTranslations();
        this.updateSelector();
        
        // Recarregar feed
        if (typeof refreshFeed === 'function') {
            setTimeout(refreshFeed, 300);
        }
        if (typeof loadSuggestions === 'function') {
            setTimeout(loadSuggestions, 400);
        }
        if (typeof loadTrendingTopics === 'function') {
            setTimeout(loadTrendingTopics, 500);
        }
    },
    
    setupSelector() {
        const selector = document.getElementById('languageSelector');
        if (!selector) return;
        selector.value = this.currentLocale;
        selector.addEventListener('change', (e) => {
            this.setLocale(e.target.value);
        });
        this.updateSelector();
    },
    
    updateSelector() {
        const selector = document.getElementById('languageSelector');
        if (selector) selector.value = this.currentLocale;
    },
    
    getLocale() {
        return this.currentLocale;
    },
    
    formatDate(date, options = {}) {
        if (!date) return '';
        let validDate = date;
        if (date.toDate) validDate = date.toDate();
        else if (date.seconds) validDate = new Date(date.seconds * 1000);
        else validDate = new Date(date);
        if (!(validDate instanceof Date) || isNaN(validDate.getTime())) return '';
        
        const localeMap = {
            'pt-BR': 'pt-BR',
            'en-US': 'en-US',
            'es-ES': 'es-ES'
        };
        
        try {
            return validDate.toLocaleDateString(localeMap[this.currentLocale] || 'pt-BR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                ...options
            });
        } catch (e) {
            return validDate.toLocaleDateString('pt-BR', options);
        }
    },
    
    formatNumber(num) {
        const localeMap = {
            'pt-BR': 'pt-BR',
            'en-US': 'en-US',
            'es-ES': 'es-ES'
        };
        try {
            return Number(num).toLocaleString(localeMap[this.currentLocale] || 'pt-BR');
        } catch (e) {
            return String(num);
        }
    },
    
    getCategoryLabel(category) {
        const categories = this.t('categories');
        if (categories && typeof categories === 'object' && categories[category]) {
            return categories[category];
        }
        return category;
    },
    
    getKarmaLevelLabel(level) {
        const levels = this.t('karmaLevels');
        if (levels && typeof levels === 'object' && levels[level]) {
            return levels[level];
        }
        return level;
    },
    
    getFeedLabel(feed) {
        const feeds = this.t('feeds');
        if (feeds && typeof feeds === 'object' && feeds[feed]) {
            return feeds[feed];
        }
        return feed;
    },
    
    getTimeAgo(date) {
        if (!date) return this.t('time.now') || 'agora';
        let validDate = date;
        if (date.toDate) validDate = date.toDate();
        else if (date.seconds) validDate = new Date(date.seconds * 1000);
        else validDate = new Date(date);
        if (!(validDate instanceof Date) || isNaN(validDate.getTime())) return '';
        
        const seconds = Math.floor((new Date().getTime() - validDate.getTime()) / 1000);
        if (seconds < 60) return this.t('time.now') || 'agora';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}${this.t('time.minute') || 'm'}`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}${this.t('time.hour') || 'h'}`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}${this.t('time.day') || 'd'}`;
        const weeks = Math.floor(days / 7);
        if (weeks < 4) return `${weeks}${this.t('time.week') || 'sem'}`;
        const months = Math.floor(days / 30);
        if (months < 12) return `${months}${this.t('time.month') || 'mes'}`;
        return `${Math.floor(months / 12)}${this.t('time.year') || 'ano'}`;
    }
};

window.I18n = I18n;
window.__ = function(key, params) { return I18n.t(key, params); };

// Inicialização automática
document.addEventListener('DOMContentLoaded', async function() {
    await I18n.init();
    console.log(`🌐 Bemtevi - Sistema de tradução inicializado: ${I18n.getLocale()}`);
});

console.log('🌐 Bemtevi - Sistema de tradução I18n carregado!');
