const LOCATIONS_JSON_URL = './assets/data/states-and-districts.json';
let locationsPromise = null;

async function loadLocations() {
    if (!locationsPromise) {
        locationsPromise = fetch(LOCATIONS_JSON_URL)
            .then((res) => (res.ok ? res.json() : { states: [] }))
            .then((data) => {
                const states = Array.isArray(data?.states) ? data.states : [];
                return states
                    .filter((item) => item && typeof item.state === 'string')
                    .map((item) => ({
                        state: item.state.trim(),
                        districts: Array.isArray(item.districts)
                            ? item.districts.map((d) => String(d).trim()).filter(Boolean)
                            : []
                    }))
                    .filter((item) => item.state);
            })
            .catch(() => []);
    }
    return locationsPromise;
}

function ensureOption(selectEl, value, label = value) {
    if (!selectEl || !value) return;
    const exists = Array.from(selectEl.options).some((opt) => opt.value === value);
    if (!exists) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        selectEl.appendChild(option);
    }
}

function setSelectValue(selectEl, value) {
    if (!selectEl) return;
    const normalizedValue = (value || '').trim();
    if (!normalizedValue) {
        selectEl.value = '';
        return;
    }
    ensureOption(selectEl, normalizedValue);
    selectEl.value = normalizedValue;
}

async function getStateRecord(stateName) {
    const target = (stateName || '').trim().toLowerCase();
    if (!target) return null;
    const states = await loadLocations();
    return states.find((s) => s.state.toLowerCase() === target) || null;
}

export async function getStates() {
    const states = await loadLocations();
    return states.map((s) => s.state);
}

export async function getDistrictsByState(stateName) {
    const record = await getStateRecord(stateName);
    return record?.districts || [];
}

export async function populateStateOptions(selectEl, opts = {}) {
    if (!selectEl) return;
    const placeholder = opts.placeholder || 'Select State';
    const selectedValue = opts.selectedValue || selectEl.value || '';
    const states = await getStates();

    selectEl.innerHTML = `<option value="">${placeholder}</option>${states
        .map((state) => `<option value="${state}">${state}</option>`)
        .join('')}`;
    setSelectValue(selectEl, selectedValue);
}

export async function populateDistrictOptions(selectEl, stateName, opts = {}) {
    if (!selectEl) return;
    const placeholder = opts.placeholder || 'Select District';
    const selectedValue = opts.selectedValue || selectEl.value || '';
    const districts = await getDistrictsByState(stateName);

    selectEl.innerHTML = `<option value="">${placeholder}</option>${districts
        .map((district) => `<option value="${district}">${district}</option>`)
        .join('')}`;
    setSelectValue(selectEl, selectedValue);
}

export async function setStateDistrictValues(stateEl, districtEl, stateValue, districtValue, opts = {}) {
    if (!stateEl || !districtEl) return;
    await populateStateOptions(stateEl, {
        placeholder: opts.statePlaceholder || 'Select State',
        selectedValue: stateValue
    });
    await populateDistrictOptions(districtEl, stateEl.value, {
        placeholder: opts.districtPlaceholder || 'Select District',
        selectedValue: districtValue
    });
}

export async function initializeStateDistrictPair(stateEl, districtEl, opts = {}) {
    if (!stateEl || !districtEl) return;

    await setStateDistrictValues(stateEl, districtEl, stateEl.value, districtEl.value, opts);

    if (stateEl.dataset.locationPairBound === '1') return;
    stateEl.dataset.locationPairBound = '1';
    stateEl.addEventListener('change', async () => {
        await populateDistrictOptions(districtEl, stateEl.value, {
            placeholder: opts.districtPlaceholder || 'Select District',
            selectedValue: ''
        });
    });
}

export async function initializeStateSelect(selectEl, opts = {}) {
    if (!selectEl) return;
    await populateStateOptions(selectEl, {
        placeholder: opts.placeholder || 'Select State',
        selectedValue: selectEl.value
    });
}
