(function () {
    var theme = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';

    function applyTheme(nextTheme) {
        theme = nextTheme === 'dark' ? 'dark' : 'light';
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
    }

    applyTheme(theme);

    window.cvTheme = {
        get: function () {
            return theme;
        },
        set: function (nextTheme) {
            applyTheme(nextTheme);
        }
    };

    function initThemeToggle() {
        var button = document.getElementById('theme-toggle');
        if (!button || !window.cvTheme) {
            return;
        }

        var text = button.querySelector('.theme-toggle-text');

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

        button.addEventListener('click', function () {
            var next = window.cvTheme.get() === 'dark' ? 'light' : 'dark';
            window.cvTheme.set(next);
            syncButton();
        });

        syncButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeToggle);
    } else {
        initThemeToggle();
    }
}());