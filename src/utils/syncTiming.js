'use strict';

/**
 * Create dependency-free subtitle timing helpers for Node and the Sync Studio browser page.
 * The factory is inlined into the generated page so both consumers execute the same contract.
 */
function createSyncTiming() {
    function detectSubtitleFormat(content) {
        return /^\uFEFF?WEBVTT(?:[ \t].*)?(?:\r?\n|$)/.test(String(content || '').trimStart()) ? 'vtt' : 'srt';
    }

    function parseTimestamp(timestamp) {
        const match = /^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(timestamp);
        if (!match) throw new Error(`Invalid subtitle timestamp: ${timestamp}`);

        const hours = Number(match[1] || 0);
        const minutes = Number(match[2]);
        const seconds = Number(match[3]);
        if (minutes > 59 || seconds > 59) {
            throw new Error(`Invalid subtitle timestamp: ${timestamp}`);
        }
        return ((hours * 60 + minutes) * 60 + seconds) * 1000 + Number(match[4]);
    }

    function formatTimestamp(milliseconds, decimalSeparator, includeHours) {
        const ms = Math.max(0, Math.round(milliseconds));
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const fraction = String(ms % 1000).padStart(3, '0');
        const minuteSecond = `${String(includeHours ? minutes : Math.floor(ms / 60000)).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        return includeHours || hours > 0
            ? `${String(hours).padStart(2, '0')}:${minuteSecond}${decimalSeparator}${fraction}`
            : `${minuteSecond}${decimalSeparator}${fraction}`;
    }

    function shiftSubtitleTimings(content, offsetMs = 0) {
        if (typeof content !== 'string' || !content.trim()) {
            throw new Error('Subtitle content is empty.');
        }
        if (!Number.isFinite(offsetMs)) {
            throw new Error('Subtitle offset must be a finite number of milliseconds.');
        }

        const offset = Math.trunc(offsetMs);
        const format = detectSubtitleFormat(content);
        const decimalSeparator = format === 'vtt' ? '.' : ',';
        const newline = content.includes('\r\n') ? '\r\n' : '\n';
        const lines = content.replace(/\r\n?/g, '\n').split('\n');
        let cueCount = 0;
        let previousEnd = 0;

        const shiftedLines = lines.map((line, index) => {
            const match =
                /^(\s*)((?:(?:\d+):)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:(?:\d+):)?\d{2}:\d{2}[.,]\d{3})(\s+.*)?$/.exec(
                    line
                );
            if (!match) {
                const hasTimestampEndpoint = /(?:\d+:)?\d{2}:\d{2}[.,]\d{3}/.test(line);
                if (line.includes('-->') && hasTimestampEndpoint) {
                    throw new Error(`Invalid subtitle timing line ${index + 1}.`);
                }
                return line;
            }

            const originalStart = parseTimestamp(match[2]);
            const originalEnd = parseTimestamp(match[3]);
            const start = Math.max(0, originalStart + offset, previousEnd);
            const end = Math.max(start + 1, originalEnd + offset);
            const includeHours =
                format === 'srt' || match[2].split(':').length === 3 || match[3].split(':').length === 3;
            const shiftedTiming = `${formatTimestamp(start, decimalSeparator, includeHours)} --> ${formatTimestamp(end, decimalSeparator, includeHours)}`;

            previousEnd = end;
            cueCount += 1;
            return `${match[1]}${shiftedTiming}${match[4] || ''}`;
        });

        if (cueCount === 0) {
            throw new Error('No valid subtitle cues were found.');
        }
        return shiftedLines.join(newline);
    }

    return { detectSubtitleFormat, shiftSubtitleTimings };
}

const syncTiming = createSyncTiming();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createSyncTiming, ...syncTiming };
}
