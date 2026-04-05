/*
 * Theme controller for the CV site.
 *
 * Responsibilities:
 * - restore the previously selected theme from localStorage,
 * - expose a tiny global API through window.cvTheme,
 * - keep the theme toggle button label/title/accessibility state in sync.
 */
(function () {
    // Persisted theme state shared across the page.
    var theme = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';

    // Applies the requested theme to the document root and persists it.
    function applyTheme(nextTheme) {
        theme = nextTheme === 'dark' ? 'dark' : 'light';
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
    }

    // Apply the stored theme as early as possible to avoid a visual flash.
    applyTheme(theme);

    // Small public API used by the theme button and other site scripts.
    window.cvTheme = {
        get: function () {
            return theme;
        },
        set: function (nextTheme) {
            applyTheme(nextTheme);
        }
    };

    // Wires the top-right toggle button to the shared theme API.
    function initThemeToggle() {
        var button = document.getElementById('theme-toggle');
        if (!button || !window.cvTheme) {
            return;
        }

        var text = button.querySelector('.theme-toggle-text');

        // Mirrors the current theme into button state and accessibility text.
        function syncButton() {
            var current = window.cvTheme.get();
            var nextLabel = current === 'dark' ? 'light' : 'dark';
            button.setAttribute('aria-pressed', String(current === 'dark'));
            button.setAttribute('aria-label', 'Switch to ' + nextLabel + ' mode');
            button.setAttribute('title', 'Switch to ' + nextLabel + ' mode');

            if (text) {
                text.textContent = 'Switch to ' + nextLabel + ' mode';
            }
        }

        // Toggle between the two supported themes.
        button.addEventListener('click', function () {
            var next = window.cvTheme.get() === 'dark' ? 'light' : 'dark';
            window.cvTheme.set(next);
            syncButton();
        });

        syncButton();
    }

    // Initialize immediately when possible, otherwise wait for DOM readiness.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeToggle);
    } else {
        initThemeToggle();
    }
}());