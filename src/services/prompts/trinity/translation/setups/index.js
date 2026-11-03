/**
 * Compatibility shim — Agent Translation prompt setups.
 *
 * Registry kanonik kini berada di prompts/trinity/setups. API lama dikekalkan
 * untuk consumer sedia ada dengan memetakan translationTemplate → template.
 */

const { DEFAULT_TRINITY_PROMPT_SETUP_ID, getTrinitySetup, listTrinitySetups } = require('../../setups');

const DEFAULT_TRANSLATION_PROMPT_SETUP_ID = DEFAULT_TRINITY_PROMPT_SETUP_ID;

function toTranslationSetup(setup) {
    return {
        id: setup.id,
        label: setup.label,
        template: setup.translationTemplate
    };
}

function getTranslationSetup(rawId) {
    return toTranslationSetup(getTrinitySetup(rawId));
}

function listTranslationSetups() {
    return listTrinitySetups();
}

module.exports = {
    DEFAULT_TRANSLATION_PROMPT_SETUP_ID,
    getTranslationSetup,
    listTranslationSetups
};
