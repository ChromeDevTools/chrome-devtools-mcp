import { Settings } from './Settings.js';
export declare class VersionController {
    #private;
    static readonly GLOBAL_VERSION_SETTING_NAME = "inspectorVersion";
    static readonly SYNCED_VERSION_SETTING_NAME = "syncedInspectorVersion";
    static readonly LOCAL_VERSION_SETTING_NAME = "localInspectorVersion";
    static readonly CURRENT_VERSION = 47;
    constructor(settings: Settings);
    /**
     * Force re-sets all version number settings to the current version without
     * running any migrations.
     */
    resetToCurrent(): void;
    /**
     * Runs the appropriate migrations and updates the version settings accordingly.
     *
     * To determine what migrations to run we take the minimum of all version number settings.
     *
     * IMPORTANT: All migrations must be idempotent since they might be applied multiple times.
     */
    updateVersion(): void;
    private methodsToRunToUpdateVersion;
    updateVersionFrom0To1(): void;
    updateVersionFrom1To2(): void;
    updateVersionFrom2To3(): void;
    updateVersionFrom3To4(): void;
    updateVersionFrom4To5(): void;
    updateVersionFrom5To6(): void;
    updateVersionFrom6To7(): void;
    updateVersionFrom7To8(): void;
    updateVersionFrom8To9(): void;
    updateVersionFrom9To10(): void;
    updateVersionFrom10To11(): void;
    updateVersionFrom11To12(): void;
    updateVersionFrom12To13(): void;
    updateVersionFrom13To14(): void;
    updateVersionFrom14To15(): void;
    updateVersionFrom15To16(): void;
    updateVersionFrom16To17(): void;
    updateVersionFrom17To18(): void;
    updateVersionFrom18To19(): void;
    updateVersionFrom19To20(): void;
    updateVersionFrom20To21(): void;
    updateVersionFrom21To22(): void;
    updateVersionFrom22To23(): void;
    updateVersionFrom23To24(): void;
    updateVersionFrom24To25(): void;
    updateVersionFrom25To26(): void;
    updateVersionFrom26To27(): void;
    updateVersionFrom27To28(): void;
    updateVersionFrom28To29(): void;
    updateVersionFrom29To30(): void;
    updateVersionFrom30To31(): void;
    updateVersionFrom31To32(): void;
    updateVersionFrom32To33(): void;
    updateVersionFrom33To34(): void;
    updateVersionFrom34To35(): void;
    updateVersionFrom35To36(): void;
    updateVersionFrom36To37(): void;
    updateVersionFrom37To38(): void;
    updateVersionFrom38To39(): void;
    /**
     * There are two related migrations here for handling network throttling persistence:
     * 1. Go through all user custom throttling conditions and add a `key` property.
     * 2. If the user has a 'preferred-network-condition' setting, take the value
     *    of that and set the right key for the new 'active-network-condition-key'
     *    setting. Then, remove the now-obsolete 'preferred-network-condition'
     *    setting.
     */
    updateVersionFrom39To40(): void;
    updateVersionFrom40To41(): void;
    /**
     * The recording in recorder panel may have unreasonably long titles
     * or a lot of steps which can cause renderer crashes.
     * Similar to https://crbug.com/40918380
     */
    updateVersionFrom41To42(): void;
    updateVersionFrom42To43(): void;
    updateVersionFrom43To44(): void;
    updateVersionFrom44To45(): void;
    updateVersionFrom45To46(): void;
    updateVersionFrom46To47(): void;
    private migrateSettingsFromLocalStorage;
    private clearBreakpointsWhenTooMany;
}
