function hasElementChanged(current, previous) {
    // New element
    if (!previous) {
        return true;
    }

    // Text changed
    if (current.text !== previous.text) {
        return true;
    }

    // Bounding box changed
    if (JSON.stringify(current.bbox) !== JSON.stringify(previous.bbox)) {
        return true;
    }

    // Element type changed
    if (current.type !== previous.type) {
        return true;
    }

    // ARIA role changed
    if (current.role !== previous.role) {
        return true;
    }

    return false;
}


function detectChanges(elements, previousState) {
    return elements.map(element => ({
        element,
        changed: hasElementChanged(
            element,
            previousState[element.id]
        )
    }));
}


function buildPreviousState(elements) {
    const state = {};

    for (const element of elements) {
        state[element.id] = {
            id: element.id,
            text: element.text,
            bbox: element.bbox,
            type: element.type,
            role: element.role
        };
    }

    return state;
}


module.exports = {
    hasElementChanged,
    detectChanges,
    buildPreviousState
};