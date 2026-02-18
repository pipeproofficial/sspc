(function () {
    function shouldFormatField(field) {
        if (!field) return false;
        if (field.disabled || field.readOnly) return false;
        if (field.dataset && field.dataset.preserveCase === 'true') return false;

        const tag = (field.tagName || '').toLowerCase();
        if (tag === 'textarea') return true;
        if (tag !== 'input') return false;

        const type = String(field.type || 'text').toLowerCase();
        const blockedTypes = new Set([
            'email', 'password', 'number', 'tel', 'url', 'date',
            'datetime-local', 'time', 'month', 'week', 'color',
            'file', 'hidden', 'range', 'checkbox', 'radio'
        ]);
        return !blockedTypes.has(type);
    }

    function toTitleCase(value) {
        const raw = String(value || '');
        if (!raw.trim()) return raw;
        return raw.replace(/[A-Za-z]+/g, function (word) {
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        });
    }

    function formatFieldValue(field) {
        if (!shouldFormatField(field)) return;
        const next = toTitleCase(field.value);
        if (next === field.value) return;
        field.value = next;
    }

    document.addEventListener('blur', function (event) {
        formatFieldValue(event.target);
    }, true);

    document.addEventListener('change', function (event) {
        formatFieldValue(event.target);
    }, true);

    document.addEventListener('submit', function (event) {
        const form = event.target;
        if (!form || !form.elements) return;
        Array.from(form.elements).forEach(formatFieldValue);
    }, true);
})();
