/**
 * SF Flow Utility Toolkit - API Name Prefix Configuration
 *
 * Loads prefix mappings from config/default-prefixes.json as the baseline.
 * Individual row overrides are stored in chrome.storage.local as a diff against
 * the defaults — only the changes are persisted, not the full list.
 *
 * Storage key: apiNameGenerator.prefixOverrides
 * Format: { [type]: { Snake_Case, PascalCase, camelCase } }
 *
 * The Settings page also supports importing/exporting the full merged config
 * as a JSON file for declarative or code-based management workflows.
 *
 * Legacy key (apiNameGenerator.customPrefixes) is automatically migrated
 * to the new override format on first load if present.
 */

const APINamePrefixes = (() => {

  const STORAGE_KEY   = 'apiNameGenerator.prefixOverrides';
  const STORAGE_LEGACY = 'apiNameGenerator.customPrefixes';

  let _defaults  = [];   // Entries from default-prefixes.json (includes "table" field)
  let _overrides = {};   // { [type]: { Snake_Case, PascalCase, camelCase } }
  let _loaded    = false;

  /**
   * Icon-name to type mapping for identifying element types from the panel header icon.
   */
  const ICON_TO_TYPE = {
    'standard:record_lookup':       'get records',
    'standard:record_create':       'create records',
    'standard:record_update':       'update records',
    'standard:record_delete':       'delete records',
    'standard:decision':            'decision',
    'standard:assignment':          'assignment',
    'standard:screen':              'screen',
    'standard:loop':                'loop',
    'standard:apex':                'action',
    'standard:custom':              'action',
    'standard:flow':                'subflow',
    'standard:waits':               'wait',
    'standard:custom_notification': 'custom error',
    'standard:record':              'roll back records',
    'standard:data_transforms':     'transform',
    'standard:sales_path':          'stage',
    'standard:work_order_item':     'step'
  };

  // ===== Public API =====

  /**
   * Loads defaults from the shipped JSON file and overrides from storage.
   * Migrates from the legacy full-array storage format if present.
   */
  async function load() {
    if (_loaded) return;

    _defaults = await _loadDefaults();

    const stored = await _getFromStorage(STORAGE_KEY);

    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      // New override format
      _overrides = stored;
    } else {
      // Check for legacy full-array custom config and migrate
      const legacy = await _getFromStorage(STORAGE_LEGACY);
      if (legacy && Array.isArray(legacy) && legacy.length > 0) {
        _overrides = _migrateFromLegacy(legacy);
        await _saveToStorage(STORAGE_KEY, _overrides);
        await _clearStorage(STORAGE_LEGACY);
        console.log('[SFUT APIGen] Migrated legacy custom prefixes to override format.');
      } else {
        _overrides = {};
      }
    }

    _loaded = true;
    console.log('[SFUT APIGen] Loaded', _defaults.length, 'defaults,', Object.keys(_overrides).length, 'override(s).');
  }

  /**
   * Returns all prefix entries with overrides merged in.
   * Each entry includes the "table" classification field from defaults.
   */
  function getAll() {
    return _defaults.map(d => {
      const ov = _overrides[d.type];
      return ov ? { ...d, ...ov } : { ...d };
    });
  }

  /**
   * Returns the raw defaults array (unmodified by overrides).
   */
  function getDefaults() {
    return _defaults.map(d => ({ ...d }));
  }

  /**
   * Returns the current overrides map { [type]: { Snake_Case, PascalCase, camelCase } }.
   */
  function getOverrides() {
    return { ..._overrides };
  }

  /**
   * Returns true if any overrides are active.
   */
  function isCustom() {
    return Object.keys(_overrides).length > 0;
  }

  /**
   * Returns true if a specific type has an active override.
   * @param {string} type
   */
  function hasOverride(type) {
    return Object.prototype.hasOwnProperty.call(_overrides, type);
  }

  /**
   * Saves an override for a single row. Creates the storage entry lazily
   * (only when the first row is actually saved).
   * @param {string} type  - The prefix type (e.g. "Screen Flow")
   * @param {{ Snake_Case: string, PascalCase: string, camelCase: string }} values
   */
  async function saveRowOverride(type, values) {
    _overrides[type] = {
      Snake_Case: (values.Snake_Case || '').trim(),
      PascalCase: (values.PascalCase || '').trim(),
      camelCase:  (values.camelCase  || '').trim(),
    };
    await _saveToStorage(STORAGE_KEY, _overrides);
  }

  /**
   * Removes the override for a single row, reverting it to its default.
   * If no overrides remain after removal, the storage key is cleared entirely.
   * @param {string} type
   */
  async function resetRow(type) {
    delete _overrides[type];
    await _saveToStorage(STORAGE_KEY, _overrides);
  }

  /**
   * Removes all overrides for every row belonging to the given table.
   * @param {string} tableId  - e.g. "flowApi", "element", "variable", "formula", "resource"
   */
  async function resetTable(tableId) {
    const types = _defaults
      .filter(d => d.table === tableId)
      .map(d => d.type);
    types.forEach(t => delete _overrides[t]);
    await _saveToStorage(STORAGE_KEY, _overrides);
  }

  /**
   * Clears all overrides, reverting every row to its shipped default.
   */
  async function resetToDefaults() {
    _overrides = {};
    await _saveToStorage(STORAGE_KEY, _overrides);
  }

  /**
   * Imports a user-provided JSON file (full merged config format).
   * Diffs it against the current defaults and stores only the overrides.
   * Also accepts the legacy flat-array format for backward compatibility.
   * @param {string} jsonString
   * @returns {{ success: boolean, count: number, error?: string }}
   */
  async function importCustom(jsonString) {
    try {
      const data = JSON.parse(jsonString);

      if (!data.prefixes || !Array.isArray(data.prefixes)) {
        return { success: false, count: 0, error: 'JSON must contain a "prefixes" array.' };
      }

      const incoming = data.prefixes.filter(e => e.type && typeof e.type === 'string');
      if (incoming.length === 0) {
        return { success: false, count: 0, error: 'No valid prefix entries found. Each entry needs at least a "type" field.' };
      }

      // Build a map from the defaults for comparison
      const defaultMap = {};
      _defaults.forEach(d => { defaultMap[d.type] = d; });

      // Compute new overrides: only store entries that differ from the default
      const newOverrides = {};
      incoming.forEach(entry => {
        const def = defaultMap[entry.type];
        const snake  = (entry.Snake_Case || entry.snake || '').trim();
        const pascal = (entry.PascalCase || entry.pascal || '').trim();
        const camel  = (entry.camelCase  || entry.camel  || '').trim();

        const differsFromDefault = !def
          || snake  !== def.Snake_Case
          || pascal !== def.PascalCase
          || camel  !== def.camelCase;

        if (differsFromDefault && (snake || pascal || camel)) {
          newOverrides[entry.type] = { Snake_Case: snake, PascalCase: pascal, camelCase: camel };
        }
      });

      _overrides = newOverrides;
      await _saveToStorage(STORAGE_KEY, _overrides);

      const count = Object.keys(_overrides).length;
      return { success: true, count };
    } catch (err) {
      return { success: false, count: 0, error: `Invalid JSON: ${err.message}` };
    }
  }

  /**
   * Exports the full merged prefix configuration as a formatted JSON string.
   * The exported file can be re-imported via importCustom().
   */
  function exportAsJson() {
    const merged = getAll();
    return JSON.stringify({
      version: 2,
      description: 'API name prefix configuration for SF Flow Utility Toolkit. Import this file via Settings > API Name Prefixes to apply these prefixes.',
      prefixes: merged.map(({ table, type, Snake_Case, PascalCase, camelCase }) =>
        ({ table, type, Snake_Case, PascalCase, camelCase })
      )
    }, null, 2);
  }

  /**
   * Finds a prefix entry by type name (case-insensitive), with overrides applied.
   * @param {string} typeName
   */
  function getByType(typeName) {
    if (!typeName) return null;
    const lower = typeName.toLowerCase();
    return getAll().find(p => (p.type || '').toLowerCase() === lower) || null;
  }

  /**
   * Maps an icon-name attribute to a type key.
   * @param {string} iconName
   */
  function getTypeFromIconName(iconName) {
    if (!iconName) return null;
    return ICON_TO_TYPE[iconName] || null;
  }

  /**
   * Returns the display list for the modal dropdown.
   */
  function getDisplayList() {
    return getAll().map(p => ({
      type: (p.type || '').toLowerCase(),
      display: p.type || 'Unknown'
    }));
  }

  // ===== Private =====

  /**
   * Fetches and parses the shipped default-prefixes.json via background worker.
   * Falls back to a hardcoded list if the file can't be loaded.
   */
  async function _loadDefaults() {
    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'fetchExtensionFile', path: 'config/default-prefixes.json' },
          (r) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(r || { ok: false, error: 'No response' });
            }
          }
        );
      });

      if (resp.ok && resp.base64) {
        const data = JSON.parse(atob(resp.base64));
        if (data.prefixes && Array.isArray(data.prefixes)) {
          console.log('[SFUT APIGen] Default prefixes loaded from JSON:', data.prefixes.length, 'entries');
          return data.prefixes.map(_normaliseEntry);
        }
      }
    } catch (err) {
      console.warn('[SFUT APIGen] Failed to load default-prefixes.json:', err);
    }

    console.log('[SFUT APIGen] Using hardcoded fallback prefixes.');
    return _hardcodedFallback();
  }

  /**
   * Migrates the legacy full-array custom config to the new overrides diff format.
   * @param {Array} legacyArray
   * @returns {{ [type]: { Snake_Case, PascalCase, camelCase } }}
   */
  function _migrateFromLegacy(legacyArray) {
    const defaultMap = {};
    _defaults.forEach(d => { defaultMap[d.type] = d; });

    const overrides = {};
    legacyArray.forEach(entry => {
      const type = (entry.type || '').trim();
      if (!type) return;
      const def = defaultMap[type];
      const snake  = (entry.Snake_Case || '').trim();
      const pascal = (entry.PascalCase || '').trim();
      const camel  = (entry.camelCase  || '').trim();
      if (!def || snake !== def.Snake_Case || pascal !== def.PascalCase || camel !== def.camelCase) {
        overrides[type] = { Snake_Case: snake, PascalCase: pascal, camelCase: camel };
      }
    });
    return overrides;
  }

  function _normaliseEntry(entry) {
    return {
      table:      (entry.table      || '').trim(),
      type:       (entry.type       || '').trim(),
      Snake_Case: (entry.Snake_Case || entry.snake  || '').trim(),
      PascalCase: (entry.PascalCase || entry.pascal || '').trim(),
      camelCase:  (entry.camelCase  || entry.camel  || '').trim(),
    };
  }

  function _getFromStorage(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => resolve(result[key] || null));
    });
  }

  function _saveToStorage(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  function _clearStorage(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, resolve);
    });
  }

  /**
   * Live-reload: when overrides change in chrome.storage.local (e.g. from the
   * settings page), invalidate the cache and reload so Flow Builder tabs stay
   * in sync without needing a page refresh.
   */
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'local') return;
      if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return;

      _loaded = false;
      _defaults = [];
      _overrides = {};

      load()
        .then(() => console.log('[SFUT APIGen] Prefix config changed — reloaded.'))
        .catch(err => console.warn('[SFUT APIGen] Failed to reload prefixes after storage change:', err));
    });
  }

  function _hardcodedFallback() {
    return [
      { table: 'flowApi',  type: 'Screen Flow',                              Snake_Case: 'SF_',            PascalCase: 'SF',            camelCase: 'sf'            },
      { table: 'flowApi',  type: 'Record-Triggered Flow',                    Snake_Case: 'RTF_',           PascalCase: 'RTF',           camelCase: 'rtf'           },
      { table: 'flowApi',  type: 'Record-Triggered Flow - Approval Process', Snake_Case: 'RTAP_',          PascalCase: 'RTAP',          camelCase: 'rtap'          },
      { table: 'flowApi',  type: 'Schedule-Triggered Flow',                  Snake_Case: 'STF_',           PascalCase: 'STF',           camelCase: 'stf'           },
      { table: 'flowApi',  type: 'Platform Event-Triggered Flow',            Snake_Case: 'PET_',           PascalCase: 'PET',           camelCase: 'pet'           },
      { table: 'flowApi',  type: 'Automation Event-Triggered Flow',          Snake_Case: 'AETF_',          PascalCase: 'AETF',          camelCase: 'aetf'          },
      { table: 'flowApi',  type: 'Autolaunched Flow',                        Snake_Case: 'AF_',            PascalCase: 'AF',            camelCase: 'af'            },
      { table: 'flowApi',  type: 'Autolaunched Flow - Approval Process',     Snake_Case: 'ALAP_',          PascalCase: 'ALAP',          camelCase: 'alap'          },
      { table: 'flowApi',  type: 'Orchestration',                            Snake_Case: 'Orch_',          PascalCase: 'Orch',          camelCase: 'orch'          },
      { table: 'flowApi',  type: 'Flow',                                     Snake_Case: 'Flow_',          PascalCase: 'Flow',          camelCase: 'flow'          },
      { table: 'element',  type: 'Get Records',                              Snake_Case: 'Get_',           PascalCase: 'Get',           camelCase: 'get'           },
      { table: 'element',  type: 'Create Records',                           Snake_Case: 'Create_',        PascalCase: 'Create',        camelCase: 'create'        },
      { table: 'element',  type: 'Update Records',                           Snake_Case: 'Update_',        PascalCase: 'Update',        camelCase: 'update'        },
      { table: 'element',  type: 'Delete Records',                           Snake_Case: 'Delete_',        PascalCase: 'Delete',        camelCase: 'delete'        },
      { table: 'element',  type: 'Decision',                                 Snake_Case: 'Decision_',      PascalCase: 'Decision',      camelCase: 'decision'      },
      { table: 'element',  type: 'Outcome',                                  Snake_Case: 'Outcome_',       PascalCase: 'Outcome',       camelCase: 'outcome'       },
      { table: 'element',  type: 'Assignment',                               Snake_Case: 'Set_',           PascalCase: 'Set',           camelCase: 'set'           },
      { table: 'element',  type: 'Screen',                                   Snake_Case: 'Screen_',        PascalCase: 'Screen',        camelCase: 'screen'        },
      { table: 'element',  type: 'Input',                                    Snake_Case: 'Input_',         PascalCase: 'Input',         camelCase: 'input'         },
      { table: 'element',  type: 'Section',                                  Snake_Case: 'Section_',       PascalCase: 'Section',       camelCase: 'section'       },
      { table: 'element',  type: 'Display',                                  Snake_Case: 'Display_',       PascalCase: 'Display',       camelCase: 'display'       },
      { table: 'element',  type: 'Message',                                  Snake_Case: 'Message_',       PascalCase: 'Message',       camelCase: 'message'       },
      { table: 'element',  type: 'Repeater',                                 Snake_Case: 'Repeater_',      PascalCase: 'Repeater',      camelCase: 'repeater'      },
      { table: 'element',  type: 'LWC',                                      Snake_Case: 'LWC_',           PascalCase: 'LWC',           camelCase: 'lwc'           },
      { table: 'element',  type: 'Loop',                                     Snake_Case: 'Loop_',          PascalCase: 'Loop',          camelCase: 'loop'          },
      { table: 'element',  type: 'Action',                                   Snake_Case: 'Apex_',          PascalCase: 'Apex',          camelCase: 'apex'          },
      { table: 'element',  type: 'Subflow',                                  Snake_Case: 'Subflow_',       PascalCase: 'Subflow',       camelCase: 'subflow'       },
      { table: 'element',  type: 'Transform',                                Snake_Case: 'Transform_',     PascalCase: 'Transform',     camelCase: 'transform'     },
      { table: 'element',  type: 'Wait',                                     Snake_Case: 'Wait_',          PascalCase: 'Wait',          camelCase: 'wait'          },
      { table: 'element',  type: 'Custom Error',                             Snake_Case: 'Error_',         PascalCase: 'Error',         camelCase: 'error'         },
      { table: 'element',  type: 'Roll Back Records',                        Snake_Case: 'Rollback_',      PascalCase: 'Rollback',      camelCase: 'rollback'      },
      { table: 'element',  type: 'Collection Sort',                          Snake_Case: 'Sort_',          PascalCase: 'Sort',          camelCase: 'sort'          },
      { table: 'element',  type: 'Collection Filter',                        Snake_Case: 'Filter_',        PascalCase: 'Filter',        camelCase: 'filter'        },
      { table: 'variable', type: 'Variable (Text)',                          Snake_Case: 'VarString_',     PascalCase: 'VarString',     camelCase: 'varstring'     },
      { table: 'variable', type: 'Variable (Number)',                        Snake_Case: 'VarNum_',        PascalCase: 'VarNum',        camelCase: 'varnum'        },
      { table: 'variable', type: 'Variable (Currency)',                      Snake_Case: 'VarCur_',        PascalCase: 'VarCur',        camelCase: 'varcur'        },
      { table: 'variable', type: 'Variable (Boolean)',                       Snake_Case: 'VarCheck_',      PascalCase: 'VarCheck',      camelCase: 'varcheck'      },
      { table: 'variable', type: 'Variable (Date)',                          Snake_Case: 'VarDate_',       PascalCase: 'VarDate',       camelCase: 'vardate'       },
      { table: 'variable', type: 'Variable (Date/Time)',                     Snake_Case: 'VarDateTime_',   PascalCase: 'VarDateTime',   camelCase: 'vardatetime'   },
      { table: 'variable', type: 'Variable (Time)',                          Snake_Case: 'VarTime_',       PascalCase: 'VarTime',       camelCase: 'vartime'       },
      { table: 'variable', type: 'Variable (Record)',                        Snake_Case: 'Rec_',           PascalCase: 'Rec',           camelCase: 'rec'           },
      { table: 'variable', type: 'Variable (Picklist)',                      Snake_Case: 'VarPick_',       PascalCase: 'VarPick',       camelCase: 'varpick'       },
      { table: 'variable', type: 'Variable (Multi-Select Picklist)',         Snake_Case: 'VarMultiPick_',  PascalCase: 'VarMultiPick',  camelCase: 'varmultipick'  },
      { table: 'variable', type: 'Variable (Apex-Defined)',                  Snake_Case: 'VarApex_',       PascalCase: 'VarApex',       camelCase: 'varapex'       },
      { table: 'variable', type: 'Variable',                                 Snake_Case: 'Var_',           PascalCase: 'Var',           camelCase: 'var'           },
      { table: 'variable', type: 'Collection (Text)',                        Snake_Case: 'CollString_',    PascalCase: 'CollString',    camelCase: 'collstring'    },
      { table: 'variable', type: 'Collection (Number)',                      Snake_Case: 'CollNum_',       PascalCase: 'CollNum',       camelCase: 'collnum'       },
      { table: 'variable', type: 'Collection (Currency)',                    Snake_Case: 'CollCur_',       PascalCase: 'CollCur',       camelCase: 'collcur'       },
      { table: 'variable', type: 'Collection (Boolean)',                     Snake_Case: 'CollCheck_',     PascalCase: 'CollCheck',     camelCase: 'collcheck'     },
      { table: 'variable', type: 'Collection (Date)',                        Snake_Case: 'CollDate_',      PascalCase: 'CollDate',      camelCase: 'colldate'      },
      { table: 'variable', type: 'Collection (Date/Time)',                   Snake_Case: 'CollDateTime_',  PascalCase: 'CollDateTime',  camelCase: 'colldatetime'  },
      { table: 'variable', type: 'Collection (Time)',                        Snake_Case: 'CollTime_',      PascalCase: 'CollTime',      camelCase: 'colltime'      },
      { table: 'variable', type: 'Collection (Record)',                      Snake_Case: 'RecColl_',       PascalCase: 'RecColl',       camelCase: 'reccoll'       },
      { table: 'variable', type: 'Collection (Picklist)',                    Snake_Case: 'CollPick_',      PascalCase: 'CollPick',      camelCase: 'collpick'      },
      { table: 'variable', type: 'Collection (Multi-Select Picklist)',       Snake_Case: 'CollMultiPick_', PascalCase: 'CollMultiPick', camelCase: 'collmultipick' },
      { table: 'variable', type: 'Collection (Apex-Defined)',                Snake_Case: 'CollApex_',      PascalCase: 'CollApex',      camelCase: 'collapex'      },
      { table: 'variable', type: 'Collection',                               Snake_Case: 'Coll_',          PascalCase: 'Coll',          camelCase: 'coll'          },
      { table: 'formula',  type: 'Formula (Text)',                           Snake_Case: 'CalcString_',    PascalCase: 'CalcString',    camelCase: 'calcstring'    },
      { table: 'formula',  type: 'Formula (Number)',                         Snake_Case: 'CalcNum_',       PascalCase: 'CalcNum',       camelCase: 'calcnum'       },
      { table: 'formula',  type: 'Formula (Currency)',                       Snake_Case: 'CalcCur_',       PascalCase: 'CalcCur',       camelCase: 'calccur'       },
      { table: 'formula',  type: 'Formula (Boolean)',                        Snake_Case: 'CalcCheck_',     PascalCase: 'CalcCheck',     camelCase: 'calccheck'     },
      { table: 'formula',  type: 'Formula (Date)',                           Snake_Case: 'CalcDate_',      PascalCase: 'CalcDate',      camelCase: 'calcdate'      },
      { table: 'formula',  type: 'Formula (Date/Time)',                      Snake_Case: 'CalcDateTime_',  PascalCase: 'CalcDateTime',  camelCase: 'calcdatetime'  },
      { table: 'formula',  type: 'Formula (Time)',                           Snake_Case: 'CalcTime_',      PascalCase: 'CalcTime',      camelCase: 'calctime'      },
      { table: 'formula',  type: 'Formula',                                  Snake_Case: 'Calc_',          PascalCase: 'Calc',          camelCase: 'calc'          },
      { table: 'resource', type: 'Constant',                                 Snake_Case: 'Const_',         PascalCase: 'Const',         camelCase: 'const'         },
      { table: 'resource', type: 'Text Template',                            Snake_Case: 'Template_',      PascalCase: 'Template',      camelCase: 'template'      },
      { table: 'resource', type: 'Choice',                                   Snake_Case: 'Choice_',        PascalCase: 'Choice',        camelCase: 'choice'        },
      { table: 'resource', type: 'Collection Choice Set',                    Snake_Case: 'CollChoice_',    PascalCase: 'CollChoice',    camelCase: 'collchoice'    },
      { table: 'resource', type: 'Record Choice Set',                        Snake_Case: 'RecChoice_',     PascalCase: 'RecChoice',     camelCase: 'recchoice'     },
      { table: 'resource', type: 'Picklist Choice Set',                      Snake_Case: 'PickList_',      PascalCase: 'PickList',      camelCase: 'picklist'      },
      { table: 'resource', type: 'Stage',                                    Snake_Case: 'Stage_',         PascalCase: 'Stage',         camelCase: 'stage'         },
      { table: 'resource', type: 'Step',                                     Snake_Case: 'Step_',          PascalCase: 'Step',          camelCase: 'step'          },
    ];
  }

  // --- Public API ---
  return {
    load,
    getAll,
    getDefaults,
    getOverrides,
    isCustom,
    hasOverride,
    saveRowOverride,
    resetRow,
    resetTable,
    resetToDefaults,
    importCustom,
    exportAsJson,
    getByType,
    getTypeFromIconName,
    getDisplayList,
    ICON_TO_TYPE
  };

})();