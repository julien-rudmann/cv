/*
 * Generic JSON-driven page renderer for the CV site.
 *
 * Each HTML page keeps the shared Jekyll layout, while page-specific content can
 * be provided from data/<page>.json. The loader keeps the existing HTML as
 * a safe fallback: if a JSON file is missing or empty, the original static content
 * remains visible.
 *
 * Supported JSON structure:
 * {
 *   "name": "...",
 *   "layout": "...",
 *   "content": {
 *     "en": {
 *       "page": { "tab": "...", "title": "...", "subtitle": "..." },
 *       "text": ["...", "..."],
 *       "articles": [{
 *         "title": "...",
 *         "company": "...",
 *         "duration": "...",
 *         "location": "..."
 *         "description": "...",
 *         "achievements": [...],
 *         "skills": [...],
 *         "highlights": [{ "title": "...", "description": "..." }]
 *       }]
 *     }
 *   }
 * }
 *
 */
(function () {

    const NAV_PAGE_IDS = ['profile', 'experience', 'skills', 'education', 'references', 'interests', 'projects'];

    // Site-wide defaults and persisted language preference.
    const DEFAULT_LANGUAGE = 'en';
    const LANGUAGE_STORAGE_KEY = 'language';

    let selectedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) || DEFAULT_LANGUAGE;

    let pageDataCache = {};
    let pageDataPromises = {};

    let pageData = null;

    // Normalizes trusted rich text snippets coming from JSON.
    function normalizeRichText(value) {

        if (typeof value !== 'string') {
            return '';
        }

        return value
            .replace(/^\uFEFF/, '')
            .replace(/^\s*<p[^>]*>/i, '')
            .replace(/<\/p>\s*$/i, '')
            .trim();
    }

    // Converts HTML content to plain text, mainly for the document title.
    function htmlToText(value) {
        let container = document.createElement('div');
        container.innerHTML = normalizeRichText(value);
        return (container.textContent || container.innerText || '').trim();
    }

    // Maps the current HTML page name to its JSON file name.
    function getPageId() {
        let fileName = window.location.pathname.split('/').pop() || 'index.html';
        let pageId = fileName.replace(/\.html$/i, '');

        return pageId === 'index' ? 'profile' : pageId;
    }

    // Returns the data file path relative to the site root.
    function getDataUrl(pageId) {
        return 'data/' + pageId + '.json';
    }

    // Parses raw JSON text while tolerating an optional UTF-8 BOM.
    function parsePageData(text) {
        let trimmed = text.replace(/^\uFEFF/, '').trim();

        if (!trimmed) {
            return null;
        }

        return JSON.parse(trimmed);
    }

    // Lists the languages actually present in the JSON payload.
    function getAvailableLanguages(data) {
        if (!data || !data.content || typeof data.content !== 'object') {
            return [];
        }

        return Object.keys(data.content).filter(function (key) {
            return data.content[key] && typeof data.content[key] === 'object';
        });
    }

    // Reads either a simple string value or a localized object with fallbacks.
    function getLocalizedValue(value, language, fallbacks) {


        if (value == null) {
            return '';
        }

        if (typeof value === 'string' || Array.isArray(value)) {
            return value;
        }

        if (typeof value !== 'object') {
            return '';
        }

        let languages = [language].concat(fallbacks || []);

        let i;
        let nextValue;

        for (i = 0; i < languages.length; i += 1) {
            nextValue = value[languages[i]];
            if (nextValue != null) {
                return nextValue;
            }
        }

        languages = Object.keys(value);

        return languages.length ? value[languages[0]] : '';
    }

    // Chooses the language that will actually be rendered for the page.
    function getRenderedLanguage(data) {
        let availableLanguages = getAvailableLanguages(data);

        if (!availableLanguages.length) {
            return null;
        }

        if (data.content[selectedLanguage]) {
            return selectedLanguage;
        }

        if (data.content[DEFAULT_LANGUAGE]) {
            return DEFAULT_LANGUAGE;
        }

        return availableLanguages[0];
    }

    // Returns the content block that best matches the requested language.
    function getContentForLanguage(data, language) {
        let availableLanguages = getAvailableLanguages(data);

        if (!availableLanguages.length) {
            return null;
        }

        if (data.content[language]) {
            return data.content[language];
        }

        if (data.content[DEFAULT_LANGUAGE]) {
            return data.content[DEFAULT_LANGUAGE];
        }

        return data.content[availableLanguages[0]];
    }

    // Loads a page JSON file once and caches the parsed payload for reuse.
    function fetchPageData(pageId) {

        if (pageDataCache[pageId]) {
            return Promise.resolve(pageDataCache[pageId]);
        }

        if (pageDataPromises[pageId]) {
            return pageDataPromises[pageId];
        }

        pageDataPromises[pageId] = fetch(getDataUrl(pageId))
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Unable to load page data');
                }
                return response.text();
            })
            .then(function (text) {
                let data = parsePageData(text);
                if (data) {
                    pageDataCache[pageId] = data;
                }
                return data;
            })
            .catch(function () {
                return null;
            });

        return pageDataPromises[pageId];
    }

    // Small helper used to create HTML elements consistently.
    function createElement(tagName, className, html) {

        let element = document.createElement(tagName);

        if (className) {
            element.className = className;
        }

        if (html != null) {
            element.innerHTML = html;
        }

        return element;
    }

    // Appends one or more paragraphs to a parent node.
    function appendParagraphs(parent, values) {
        let paragraphs = Array.isArray(values) ? values : [values];

        paragraphs.filter(Boolean).forEach(function (value) {
            parent.appendChild(createElement('p', '', normalizeRichText(value)));
        });
    }

    // Renders the top-level free-text section of a page.
    function renderTextSection(values) {

        if (!values || !values.length) {
            return null;
        }

        let section = createElement('section', 'content-section');

        appendParagraphs(section, values);

        return section;
    }

    // Renders a shared pill/tag list used across multiple page types.
    function renderSkillsList(items) {

        if (!items || !items.length) {
            return null;
        }

        let list = createElement('ul', 'tag-list article-skill');

        items.forEach(function (item) {
            list.appendChild(createElement('li', '', normalizeRichText(item)));
        });

        return list;
    }

    // Renders a standard unordered list of bullet items.
    function renderAchievementsList(items) {

        if (!items || !items.length) {
            return null;
        }

        let list = createElement('ul', 'article-achievement');

        items.forEach(function (item) {
            list.appendChild(createElement('li', '', normalizeRichText(item)));
        });

        return list;
    }

    // Renders highlighted callout boxes shown under some entries.
    function renderHighlightsList(highlights) {

        let fragment = document.createDocumentFragment();

        (highlights || []).forEach(function (highlight) {

            let box = createElement('div', 'article-highlight');

            if (highlight.title) {
                box.appendChild(createElement('h3', '', normalizeRichText(highlight.title)));
            }

            if (highlight.description) {
                box.appendChild(createElement('p', '', normalizeRichText(highlight.description)));
            }

            fragment.appendChild(box);
        });

        return fragment;
    }

    // Renders one article-style card, used for experience/education/projects.
    function renderArticleCard(article) {

        let card = createElement('article', 'card article-card');

        if (article.title) {
            card.appendChild(createElement('h3', '', normalizeRichText(article.title)));
        }

        [article.company, article.duration, article.location].filter(Boolean).forEach(function (value) {
            card.appendChild(createElement('p', 'article-meta', normalizeRichText(value)));
        });

        if (article.description) {
            appendParagraphs(card, article.description);
        }

        let bullets = renderAchievementsList(article.achievements);

        if (bullets) {
            card.appendChild(bullets);
        }

        let tags = renderSkillsList(article.skills);

        if (tags) {
            card.appendChild(tags);
        }

        card.appendChild(renderHighlightsList(article.highlights));

        return card;
    }

    // Renders a section containing multiple article cards.
    function renderArticleSection(values) {

        if (!values || !values.length) {
            return null;
        }

        let section = createElement('section', 'content-section');
        let list = createElement('div', 'card-list');

        values.forEach(function (value) {
            list.appendChild(renderArticleCard(value));
        });

        section.appendChild(list);

        return section;
    }

    // Returns localized page metadata from content.<lang>.page with safe fallbacks.
    function getPageMetadata(data, language) {

        let availableLanguages = getAvailableLanguages(data);

        let content = getContentForLanguage(data, language);

        let fallbackLanguage = data.content[DEFAULT_LANGUAGE] ? DEFAULT_LANGUAGE : availableLanguages[0];
        let fallbackContent = fallbackLanguage ? data.content[fallbackLanguage] : null;

        let page = content && content.page ? content.page : {};
        let fallbackPage = fallbackContent && fallbackContent.page ? fallbackContent.page : {};

        return {
            tab: page.tab || fallbackPage.tab || page.title || fallbackPage.title || getLocalizedValue(data.title, language, [DEFAULT_LANGUAGE]),
            title: page.title || fallbackPage.title || getLocalizedValue(data.title, language, [DEFAULT_LANGUAGE]),
            subtitle: page.subtitle || fallbackPage.subtitle || getLocalizedValue(data.subtitle, language, [DEFAULT_LANGUAGE])
        };
    }

    // Updates the page header and browser title from localized JSON data.
    function updateHeader(data, language, content) {

        let pageMetadata = getPageMetadata(data, language, content);

        let titleElement = document.querySelector('#page-title');
        let title = pageMetadata.title;

        if (titleElement && title) {
            titleElement.innerHTML = normalizeRichText(title);
            document.title = htmlToText(title) + ' | Julien Rudmann';
        }

        let subtitleElement = document.querySelector('#page-subtitle');
        let subtitle = pageMetadata.subtitle;

        if (subtitleElement) {
            subtitleElement.innerHTML = normalizeRichText(subtitle);
            subtitleElement.hidden = !subtitle;
        }
    }

    // Replaces page content with the JSON-rendered version for the active language.
    function renderPage(data) {

        let root = document.getElementById('page-content');

        if (!root) {
            return;
        }

        let renderedLanguage = getRenderedLanguage(data);

        if (!renderedLanguage) {
            updateLanguageToggle(null, selectedLanguage);
            return;
        }

        let content = data.content[renderedLanguage];

        pageData = data;
        pageDataCache[getPageId()] = data;

        document.documentElement.setAttribute('lang', renderedLanguage);

        updateLanguageToggle(data, renderedLanguage);
        updateNavigationTabs(renderedLanguage);
        updateHeader(data, renderedLanguage, content);

        let fragments = [];

        fragments.push(renderTextSection(content.text));
        fragments.push(renderArticleSection(content.articles));

        fragments = fragments.filter(Boolean);

        if (!fragments.length) {
            return;
        }

        root.innerHTML = '';

        fragments.forEach(function (fragment) {
            root.appendChild(fragment);
        });
    }

    // Fetches and parses the JSON data for the current page.
    function loadPage() {
        fetchPageData(getPageId())
            .then(function (data) {
                if (data && data.content) {
                    renderPage(data);
                } else {
                    updateLanguageToggle(null, selectedLanguage);
                    updateNavigationTabs(selectedLanguage);
                }
            })
            .catch(function () {
                updateLanguageToggle(null, selectedLanguage);
                updateNavigationTabs(selectedLanguage);
            });
    }

    // Wires the language button and persists the chosen language.
    function initLanguageToggle() {

        let button = document.getElementById('language-toggle');

        if (!button) {
            return;
        }

        button.addEventListener('click', function () {

            if (button.disabled) {
                return;
            }

            selectedLanguage = selectedLanguage === 'fr' ? 'en' : 'fr';

            localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);

            updateNavigationTabs(selectedLanguage);

            if (pageData) {
                renderPage(pageData);
            }
        });

        updateLanguageToggle(null, selectedLanguage);
    }

    // Keeps the language button aligned with the current renderable languages.
    function updateLanguageToggle(data, renderedLanguage) {

        let button = document.getElementById('language-toggle');

        let label = button ? button.querySelector('.language-toggle-label') : null;
        let text = button ? button.querySelector('.language-toggle-text') : null;

        let availableLanguages = getAvailableLanguages(data);

        let canToggle = availableLanguages.length > 1;
        let currentLanguage = renderedLanguage || selectedLanguage;

        let nextLanguage = currentLanguage === 'fr' ? 'en' : 'fr';

        if (!button) {
            return;
        }

        button.disabled = !canToggle;

        button.setAttribute('aria-pressed', String(currentLanguage === 'fr'));
        button.setAttribute('aria-label', canToggle ? 'Switch language to ' + nextLanguage.toUpperCase() : 'Single language available');
        button.setAttribute('title', canToggle ? 'Switch language to ' + nextLanguage.toUpperCase() : 'Single language available');

        if (label) {
            label.textContent = nextLanguage.toUpperCase();
        }

        if (text) {
            text.textContent = canToggle ? 'Switch language to ' + nextLanguage.toUpperCase() : 'Single language available';
        }
    }

    // Updates sidebar navigation labels using each page's localized page.tab value and set the active tab class
    function updateNavigationTabs(language) {

        let currentPageId = getPageId();

        // Get each tab of the navigation panel
        let links = document.querySelectorAll('.sidebar-nav [data-page-id]');

        Array.prototype.forEach.call(links, function (link) {

            let pageId = link.getAttribute('data-page-id');
            let defaultLabel = link.getAttribute('data-default-label') || link.innerHTML;

            // Check if the page is valid
            if (NAV_PAGE_IDS.indexOf(pageId) === -1) {
                return;
            }

            fetchPageData(pageId).then(function (data) {

                let metadata;
                let label = defaultLabel;

                if (data && data.content) {

                    metadata = getPageMetadata(data, language);

                    if (metadata.tab) {
                        label = metadata.tab;
                    }
                }

                link.innerHTML = normalizeRichText(label);
            });

            let isActive = pageId === currentPageId;

            link.classList.toggle('active', isActive);

            if (isActive) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    // Main entry point for JSON page rendering.
    function initPageLoader() {
        initLanguageToggle();
        updateNavigationTabs(selectedLanguage);
        loadPage();
    }

    // Execute once the DOM is ready.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPageLoader);
    } else {
        initPageLoader();
    }
}());
