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
 *   "content": {
 *     "en": {
 *       "page": { "tab": "...", "title": "...", "subtitle": "..." },
 *       "text": ["paragraph", ...],
 *       "groups": [{ "title": "...", "items": [...] }],
 *       "articles": [{ ... }],
 *       "cards": [{ ... }]
 *     }
 *   }
 * }
 *
 * Legacy top-level "title" / "subtitle" values are still accepted as fallbacks.
 */
(function () {
    // Site-wide defaults and persisted language preference.
    var DEFAULT_LANGUAGE = 'en';
    var LANGUAGE_STORAGE_KEY = 'language';
    var NAV_PAGE_IDS = ['profile', 'experience', 'skills', 'education', 'references', 'passions', 'projects'];
    var selectedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) || DEFAULT_LANGUAGE;
    var pageDataCache = {};
    var pageDataPromises = {};
    var pageData = null;

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
        var container = document.createElement('div');
        container.innerHTML = normalizeRichText(value);
        return (container.textContent || container.innerText || '').trim();
    }

    // Maps the current HTML page name to its JSON file name.
    function getPageId() {
        var fileName = window.location.pathname.split('/').pop() || 'index.html';
        var pageId = fileName.replace(/\.html$/i, '');

        return pageId === 'index' ? 'profile' : pageId;
    }

    // Returns the data file path relative to the site root.
    function getDataUrl(pageId) {
        return 'data/' + pageId + '.json';
    }

    // Parses raw JSON text while tolerating an optional UTF-8 BOM.
    function parsePageData(text) {
        var trimmed = text.replace(/^\uFEFF/, '').trim();

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
        var languages;
        var i;
        var nextValue;

        if (value == null) {
            return '';
        }

        if (typeof value === 'string' || Array.isArray(value)) {
            return value;
        }

        if (typeof value !== 'object') {
            return '';
        }

        languages = [language].concat(fallbacks || []);

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
        var availableLanguages = getAvailableLanguages(data);

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
        var availableLanguages = getAvailableLanguages(data);

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
                var data = parsePageData(text);

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
        var element = document.createElement(tagName);

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
        var paragraphs = Array.isArray(values) ? values : [values];

        paragraphs.filter(Boolean).forEach(function (value) {
            parent.appendChild(createElement('p', '', normalizeRichText(value)));
        });
    }

    // Renders the top-level free-text section of a page.
    function renderTextSection(values) {
        if (!values || !values.length) {
            return null;
        }

        var section = createElement('section', 'content-section');
        appendParagraphs(section, values);
        return section;
    }

    // Renders a shared pill/tag list used across multiple page types.
    function renderTagList(items, className) {
        if (!items || !items.length) {
            return null;
        }

        var list = createElement('ul', 'tag-list' + (className ? ' ' + className : ''));

        items.forEach(function (item) {
            var element = createElement('li');
            element.innerHTML = normalizeRichText(item);
            list.appendChild(element);
        });

        return list;
    }

    // Renders a standard unordered list of bullet items.
    function renderBulletList(items) {
        if (!items || !items.length) {
            return null;
        }

        var list = createElement('ul', 'entry-list');

        items.forEach(function (item) {
            var element = createElement('li', '', normalizeRichText(item));
            list.appendChild(element);
        });

        return list;
    }

    // Renders highlighted callout boxes shown under some entries.
    function renderHighlights(highlights) {
        var fragment = document.createDocumentFragment();

        (highlights || []).forEach(function (highlight) {
            var box = createElement('div', 'entry-highlight');

            if (highlight.title) {
                box.appendChild(createElement('h4', '', normalizeRichText(highlight.title)));
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
        var card = createElement('article', 'card entry-card');
        var tags;
        var bullets;

        if (article.title) {
            card.appendChild(createElement('h3', '', normalizeRichText(article.title)));
        }

        [article.company, article.duration, article.location].filter(Boolean).forEach(function (value) {
            card.appendChild(createElement('p', 'entry-meta', normalizeRichText(value)));
        });

        if (article.description) {
            appendParagraphs(card, article.description);
        }

        bullets = renderBulletList(article.achievements);
        if (bullets) {
            card.appendChild(bullets);
        }

        tags = renderTagList(article.skills, 'entry-tags');
        if (tags) {
            card.appendChild(tags);
        }

        card.appendChild(renderHighlights(article.highlights));

        return card;
    }

    // Renders a section containing multiple article cards.
    function renderArticleSection(values) {
        if (!values || !values.length) {
            return null;
        }

        var section = createElement('section', 'content-section');
        var list = createElement('div', 'card-list');

        values.forEach(function (value) {
            list.appendChild(renderArticleCard(value));
        });

        section.appendChild(list);
        return section;
    }

    // Renders group items either as tags or as bullet points.
    function renderGroupItems(items) {
        if (!items || !items.length) {
            return null;
        }

        if (typeof items[0] === 'string') {
            return renderTagList(items, 'entry-tags');
        }

        return renderBulletList(items.map(function (item) {
            if (typeof item === 'string') {
                return item;
            }

            if (item.description) {
                return '<b>' + normalizeRichText(item.title || '') + '</b>: ' + normalizeRichText(item.description);
            }

            return normalizeRichText(item.title || '');
        }));
    }

    // Renders a group card, mainly intended for the Skills page structure.
    function renderGroupCard(group) {

        let card = createElement('article', 'card group-card');

        let items;

        if (group.title) {
            card.appendChild(createElement('h3', '', normalizeRichText(group.title)));
        }

        if (group.description) {
            appendParagraphs(card, group.description);
        }

        if (group.text) {
            console.log("HERE");
            appendParagraphs(card, group.text);
        }

        console.log(group);

        items = renderGroupItems(group.items);

        if (items) {
            card.appendChild(items);
        }

        return card;
    }

    // Renders a section containing multiple group cards.
    function renderGroupSection(values) {

        // If no article to display, return early.
        if (!values || !values.length) {
            return null;
        }

        let section = createElement('section', 'content-section');
        let div = createElement('div', 'card-list');

        // Add each article card to the div
        values.forEach(function (value) {
            div.appendChild(renderGroupCard(value));
        });

        section.appendChild(div);

        return section;
    }

    // Returns localized page metadata from content.<lang>.page with safe fallbacks.
    function getPageMetadata(data, language, content) {
        var availableLanguages = getAvailableLanguages(data);
        var fallbackLanguage = data.content[DEFAULT_LANGUAGE] ? DEFAULT_LANGUAGE : availableLanguages[0];
        var fallbackContent = fallbackLanguage ? data.content[fallbackLanguage] : null;
        var page = content && content.page ? content.page : {};
        var fallbackPage = fallbackContent && fallbackContent.page ? fallbackContent.page : {};

        return {
            tab: page.tab || fallbackPage.tab || page.title || fallbackPage.title || getLocalizedValue(data.title, language, [DEFAULT_LANGUAGE]),
            title: page.title || fallbackPage.title || getLocalizedValue(data.title, language, [DEFAULT_LANGUAGE]),
            subtitle: page.subtitle || fallbackPage.subtitle || getLocalizedValue(data.subtitle, language, [DEFAULT_LANGUAGE])
        };
    }

    // Updates sidebar navigation labels using each page's localized page.tab value.
    function updateNavigationTabs(language) {
        var links = document.querySelectorAll('.sidebar-nav [data-page-id]');

        Array.prototype.forEach.call(links, function (link) {
            var pageId = link.getAttribute('data-page-id');
            var defaultLabel = link.getAttribute('data-default-label') || link.innerHTML;

            if (NAV_PAGE_IDS.indexOf(pageId) === -1) {
                return;
            }

            fetchPageData(pageId).then(function (data) {
                var content;
                var metadata;
                var label = defaultLabel;

                if (data && data.content) {
                    content = getContentForLanguage(data, language);
                    metadata = getPageMetadata(data, language, content);

                    if (metadata.tab) {
                        label = metadata.tab;
                    }
                }

                link.innerHTML = normalizeRichText(label);
            });
        });
    }

    // Marks the current page entry as active in the sidebar navigation.
    function updateActiveNavigationTab() {
        var currentPageId = getPageId();
        var links = document.querySelectorAll('.sidebar-nav [data-page-id]');

        Array.prototype.forEach.call(links, function (link) {
            var isActive = link.getAttribute('data-page-id') === currentPageId;
            link.classList.toggle('active', isActive);
            if (isActive) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    // Updates the page header and browser title from localized JSON data.
    function updateHeader(data, language, content) {
        var titleElement = document.querySelector('.page-title');
        var subtitleElement = document.querySelector('.page-subtitle');
        var pageMetadata = getPageMetadata(data, language, content);
        var title = pageMetadata.title;
        var subtitle = pageMetadata.subtitle;

        if (titleElement && title) {
            titleElement.innerHTML = normalizeRichText(title);
            document.title = htmlToText(title) + ' | Julien Rudmann';
        }

        if (subtitleElement) {
            subtitleElement.innerHTML = normalizeRichText(subtitle);
            subtitleElement.hidden = !subtitle;
        }
    }

    // Keeps the language button aligned with the current renderable languages.
    function updateLanguageToggle(data, renderedLanguage) {
        var button = document.getElementById('language-toggle');
        var label = button ? button.querySelector('.language-toggle-label') : null;
        var text = button ? button.querySelector('.language-toggle-text') : null;
        var availableLanguages = getAvailableLanguages(data);
        var canToggle = availableLanguages.length > 1;
        var currentLanguage = renderedLanguage || selectedLanguage;
        var nextLanguage = currentLanguage === 'fr' ? 'en' : 'fr';

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

    // Replaces page content with the JSON-rendered version for the active language.
    function renderPage(data) {
        var root = document.getElementById('page-content');
        var renderedLanguage;
        var content;
        var fragments = [];

        if (!root) {
            return;
        }

        renderedLanguage = getRenderedLanguage(data);

        if (!renderedLanguage) {
            updateLanguageToggle(null, selectedLanguage);
            return;
        }

        content = data.content[renderedLanguage];

        pageData = data;
        pageDataCache[getPageId()] = data;
        document.documentElement.setAttribute('lang', renderedLanguage);
        updateHeader(data, renderedLanguage, content);
        updateLanguageToggle(data, renderedLanguage);
        updateNavigationTabs(renderedLanguage);

        fragments.push(renderTextSection(content.text));
        fragments.push(renderGroupSection(content.groups));
        fragments.push(renderArticleSection(content.articles || content.cards));

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
        var button = document.getElementById('language-toggle');

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

    // Main entry point for JSON page rendering.
    function initPageLoader() {
        initLanguageToggle();
        updateActiveNavigationTab();
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
