/**
 * SF Flow Utility Toolkit - API Name Prefix Configuration
 *
 * Loads prefix mappings from a JSON configuration file.
 * Ships with config/default-prefixes.json as the baseline.
 * Users can import their own JSON file to override defaults.
 * Custom prefixes are stored in chrome.storage.local.
 *
 * JSON format:
 * {
 *   "version": 1,
 *   "prefixes": [
 *     { "type": "Get Records", "Snake_Case": "Get_", "PascalCase": "get", "camelCase": "get" },
 *     ...
 *   ]
 * }
 *
 * The "type" field is matched (case-insensitive) against the element/resource
 * type detected from the Flow Builder panel header.
 */

const APINamePrefixes = (() => {

  const STORAGE_KEY = 'apiNameGenerator.customPrefixes';
  let _prefixes = [];       // Active prefix list (custom or default)
  let _isCustom = false;    // Whether custom prefixes are loaded
  let _loaded = false;

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

  /**
   * Loads prefixes. Checks for custom prefixes in storage first,
   * falls back to the shipped default-prefixes.json.
   */
  async function load() {
    if (_loaded) return;

    // Try custom prefixes from storage
    const custom = await _getFromStorage();
    if (custom && Array.isArray(custom) && custom.length > 0) {
      _prefixes = custom;
      _isCustom = true;
      _loaded = true;
      console.log('[SFUT APIGen] Custom prefixes loaded:', _prefixes.length, 'entries');
      return;
    }

    // Load shipped defaults via background worker (avoids web_accessible_resources issues)
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
        const jsonStr = atob(resp.base64);
        const data = JSON.parse(jsonStr);
        if (data.prefixes && Array.isArray(data.prefixes)) {
          _prefixes = data.prefixes.map(_normaliseEntry);
          _isCustom = false;
          _loaded = true;
          console.log('[SFUT APIGen] Default prefixes loaded:', _prefixes.length, 'entries');
          return;
        }
      }
    } catch (err) {
      console.warn('[SFUT APIGen] Failed to load default-prefixes.json:', err);
    }

    // Hardcoded fallback if JSON file can't be loaded
    _prefixes = _hardcodedFallback();
    _isCustom = false;
    _loaded = true;
    console.log('[SFUT APIGen] Using hardcoded fallback prefixes.');
  }

  /**
   * Imports a user-provided JSON file, validates it, and saves to storage.
   * @param {string} jsonString - The raw JSON string from the imported file
   * @returns {{ success: boolean, count: number, error?: string }}
   */
  async function importCustom(jsonString) {
    try {
      const data = JSON.parse(jsonString);

      if (!data.prefixes || !Array.isArray(data.prefixes)) {
        return { success: false, count: 0, error: 'JSON must contain a "prefixes" array.' };
      }

      // Validate entries
      const valid = data.prefixes.filter(entry => {
        return entry.type && typeof entry.type === 'string';
      }).map(_normaliseEntry);

      if (valid.length === 0) {
        return { success: false, count: 0, error: 'No valid prefix entries found. Each entry needs at least a "type" field.' };
      }

      await _saveToStorage(valid);
      _prefixes = valid;
      _isCustom = true;

      return { success: true, count: valid.length };
    } catch (err) {
      return { success: false, count: 0, error: `Invalid JSON: ${err.message}` };
    }
  }

  /**
   * Resets to default prefixes by clearing custom prefixes from storage.
   */
  async function resetToDefaults() {
    await _clearStorage();
    _loaded = false;
    _isCustom = false;
    _prefixes = [];
    await load();
  }

  /**
   * Returns whether custom prefixes are currently active.
   */
  function isCustom() {
    return _isCustom;
  }

  /**
   * Returns all loaded prefixes.
   */
  function getAll() {
    return _prefixes;
  }

  /**
   * Finds a prefix entry by type name (case-insensitive).
   */
  function getByType(typeName) {
    if (!typeName) return null;
    const lower = typeName.toLowerCase();
    return _prefixes.find(p => (p.type || '').toLowerCase() === lower) || null;
  }

  /**
   * Maps an icon-name attribute to a type key.
   */
  function getTypeFromIconName(iconName) {
    if (!iconName) return null;
    return ICON_TO_TYPE[iconName] || null;
  }

  /**
   * Returns the display list for the modal dropdown.
   */
  function getDisplayList() {
    return _prefixes.map(p => ({
      type: (p.type || '').toLowerCase(),
      display: p.type || 'Unknown'
    }));
  }

  /**
   * Returns the current prefixes as a formatted JSON string for export.
   */
  function exportAsJson() {
    return JSON.stringify({
      version: 1,
      description: 'Custom API name prefixes for SF Flow Utility Toolkit.',
      prefixes: _prefixes
    }, null, 2);
  }

  // ===== Private =====

  function _normaliseEntry(entry) {
    return {
      type: (entry.type || '').trim(),
      Snake_Case: (entry.Snake_Case || entry.snake || '').trim(),
      PascalCase: (entry.PascalCase || entry.pascal || '').trim(),
      camelCase: (entry.camelCase || entry.camel || '').trim()
    };
  }

  function _getFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        resolve(result[STORAGE_KEY] || null);
      });
    });
  }

  function _saveToStorage(prefixes) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: prefixes }, resolve);
    });
  }

  function _clearStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(STORAGE_KEY, resolve);
    });
  }

  function _hardcodedFallback() {
    return [
      { type: 'Screen Flow',                                Snake_Case: 'SF_',    PascalCase: 'SF',    camelCase: 'sf'    },
      { type: 'Record-Triggered Flow',                      Snake_Case: 'RTF_',   PascalCase: 'RTF',   camelCase: 'rtf'   },
      { type: 'Record-Triggered Flow - Approval Process',   Snake_Case: 'RTAP_',  PascalCase: 'RTAP',  camelCase: 'rtap'  },
      { type: 'Schedule-Triggered Flow',                    Snake_Case: 'STF_',   PascalCase: 'STF',   camelCase: 'stf'   },
      { type: 'Platform Event-Triggered Flow',              Snake_Case: 'PET_',   PascalCase: 'PET',   camelCase: 'pet'   },
      { type: 'Automation Event-Triggered Flow',            Snake_Case: 'AETF_',  PascalCase: 'AETF',  camelCase: 'aetf'  },
      { type: 'Autolaunched Flow',                          Snake_Case: 'AF_',    PascalCase: 'AF',    camelCase: 'af'    },
      { type: 'Autolaunched Flow - Approval Process',       Snake_Case: 'ALAP_',  PascalCase: 'ALAP',  camelCase: 'alap'  },
      { type: 'Orchestration',                              Snake_Case: 'Orch_',  PascalCase: 'Orch',  camelCase: 'orch'  },
      { type: 'Flow',                                       Snake_Case: 'Flow_',  PascalCase: 'Flow',  camelCase: 'flow'  },

      { type: 'Get Records',                       Snake_Case: 'Get_',            PascalCase: 'Get',            camelCase: 'get'            },
      { type: 'Create Records',                    Snake_Case: 'Create_',         PascalCase: 'Create',         camelCase: 'create'         },
      { type: 'Update Records',                    Snake_Case: 'Update_',         PascalCase: 'Update',         camelCase: 'update'         },
      { type: 'Delete Records',                    Snake_Case: 'Delete_',         PascalCase: 'Delete',         camelCase: 'delete'         },
      { type: 'Decision',                          Snake_Case: 'Decision_',       PascalCase: 'Decision',       camelCase: 'decision'       },
      { type: 'Outcome',                           Snake_Case: 'Outcome_',        PascalCase: 'Outcome',        camelCase: 'outcome'        },
      { type: 'Assignment',                        Snake_Case: 'Set_',            PascalCase: 'Set',            camelCase: 'set'            },
      { type: 'Screen',                            Snake_Case: 'Screen_',         PascalCase: 'Screen',         camelCase: 'screen'         },
      { type: 'Input',                             Snake_Case: 'Input_',          PascalCase: 'Input',          camelCase: 'input'          },
      { type: 'Section',                           Snake_Case: 'Section_',        PascalCase: 'Section',        camelCase: 'section'        },
      { type: 'Display',                           Snake_Case: 'Display_',        PascalCase: 'Display',        camelCase: 'display'        },
      { type: 'Message',                           Snake_Case: 'Message_',        PascalCase: 'Message',        camelCase: 'message'        },
      { type: 'Repeater',                          Snake_Case: 'Repeater_',       PascalCase: 'Repeater',       camelCase: 'repeater'       },
      { type: 'LWC',                               Snake_Case: 'LWC_',            PascalCase: 'LWC',            camelCase: 'lwc'            },
      { type: 'Loop',                              Snake_Case: 'Loop_',           PascalCase: 'Loop',           camelCase: 'loop'           },
      { type: 'Action',                            Snake_Case: 'Apex_',           PascalCase: 'Apex',           camelCase: 'apex'           },
      { type: 'Subflow',                           Snake_Case: 'Subflow_',        PascalCase: 'Subflow',        camelCase: 'subflow'        },
      { type: 'Transform',                         Snake_Case: 'Transform_',      PascalCase: 'Transform',      camelCase: 'transform'      },
      { type: 'Wait',                              Snake_Case: 'Wait_',           PascalCase: 'Wait',           camelCase: 'wait'           },
      { type: 'Custom Error',                      Snake_Case: 'Error_',          PascalCase: 'Error',          camelCase: 'error'          },
      { type: 'Roll Back Records',                 Snake_Case: 'Rollback_',       PascalCase: 'Rollback',       camelCase: 'rollback'       },
      { type: 'Collection Sort',                   Snake_Case: 'Sort_',           PascalCase: 'Sort',           camelCase: 'sort'           },
      { type: 'Collection Filter',                 Snake_Case: 'Filter_',         PascalCase: 'Filter',         camelCase: 'filter'         },

      { type: 'Formula (Text)',                    Snake_Case: 'CalcString_',     PascalCase: 'CalcString',     camelCase: 'calcstring'     },
      { type: 'Formula (Number)',                  Snake_Case: 'CalcNum_',        PascalCase: 'CalcNum',        camelCase: 'calcnum'        },
      { type: 'Formula (Currency)',                Snake_Case: 'CalcCur_',        PascalCase: 'CalcCur',        camelCase: 'calccur'        },
      { type: 'Formula (Boolean)',                 Snake_Case: 'CalcCheck_',      PascalCase: 'CalcCheck',      camelCase: 'calccheck'      },
      { type: 'Formula (Date)',                    Snake_Case: 'CalcDate_',       PascalCase: 'CalcDate',       camelCase: 'calcdate'       },
      { type: 'Formula (Date/Time)',               Snake_Case: 'CalcDateTime_',   PascalCase: 'CalcDateTime',   camelCase: 'calcdatetime'   },
      { type: 'Formula (Time)',                    Snake_Case: 'CalcTime_',       PascalCase: 'CalcTime',       camelCase: 'calctime'       },
      { type: 'Formula',                           Snake_Case: 'Calc_',           PascalCase: 'Calc',           camelCase: 'calc'           },

      { type: 'Variable (Text)',                   Snake_Case: 'VarString_',      PascalCase: 'VarString',      camelCase: 'varstring'      },
      { type: 'Variable (Number)',                 Snake_Case: 'VarNum_',         PascalCase: 'VarNum',         camelCase: 'varnum'         },
      { type: 'Variable (Currency)',               Snake_Case: 'VarCur_',         PascalCase: 'VarCur',         camelCase: 'varcur'         },
      { type: 'Variable (Boolean)',                Snake_Case: 'VarCheck_',       PascalCase: 'VarCheck',       camelCase: 'varcheck'       },
      { type: 'Variable (Date)',                   Snake_Case: 'VarDate_',        PascalCase: 'VarDate',        camelCase: 'vardate'        },
      { type: 'Variable (Date/Time)',              Snake_Case: 'VarDateTime_',    PascalCase: 'VarDateTime',    camelCase: 'vardatetime'    },
      { type: 'Variable (Time)',                   Snake_Case: 'VarTime_',        PascalCase: 'VarTime',        camelCase: 'vartime'        },
      { type: 'Variable (Record)',                 Snake_Case: 'Rec_',            PascalCase: 'Rec',            camelCase: 'rec'            },
      { type: 'Variable (Picklist)',               Snake_Case: 'VarPick_',        PascalCase: 'VarPick',        camelCase: 'varpick'        },
      { type: 'Variable (Multi-Select Picklist)',  Snake_Case: 'VarMultiPick_',   PascalCase: 'VarMultiPick',   camelCase: 'varmultipick'   },
      { type: 'Variable (Apex-Defined)',           Snake_Case: 'VarApex_',        PascalCase: 'VarApex',        camelCase: 'varapex'        },
      { type: 'Variable',                          Snake_Case: 'Var_',            PascalCase: 'Var',            camelCase: 'var'            },

      { type: 'Collection (Text)',                 Snake_Case: 'CollString_',     PascalCase: 'CollString',     camelCase: 'collstring'     },
      { type: 'Collection (Number)',               Snake_Case: 'CollNum_',        PascalCase: 'CollNum',        camelCase: 'collnum'        },
      { type: 'Collection (Currency)',             Snake_Case: 'CollCur_',        PascalCase: 'CollCur',        camelCase: 'collcur'        },
      { type: 'Collection (Boolean)',              Snake_Case: 'CollCheck_',      PascalCase: 'CollCheck',      camelCase: 'collcheck'      },
      { type: 'Collection (Date)',                 Snake_Case: 'CollDate_',       PascalCase: 'CollDate',       camelCase: 'colldate'       },
      { type: 'Collection (Date/Time)',            Snake_Case: 'CollDateTime_',   PascalCase: 'CollDateTime',   camelCase: 'colldatetime'   },
      { type: 'Collection (Time)',                 Snake_Case: 'CollTime_',       PascalCase: 'CollTime',       camelCase: 'colltime'       },
      { type: 'Collection (Record)',               Snake_Case: 'RecColl_',        PascalCase: 'RecColl',        camelCase: 'reccoll'        },
      { type: 'Collection (Picklist)',             Snake_Case: 'CollPick_',       PascalCase: 'CollPick',       camelCase: 'collpick'       },
      { type: 'Collection (Multi-Select Picklist)',Snake_Case: 'CollMultiPick_',  PascalCase: 'CollMultiPick',  camelCase: 'collmultipick'  },
      { type: 'Collection (Apex-Defined)',         Snake_Case: 'CollApex_',       PascalCase: 'CollApex',       camelCase: 'collapex'       },
      { type: 'Collection',                        Snake_Case: 'Coll_',           PascalCase: 'Coll',           camelCase: 'coll'           },

      { type: 'Constant',                          Snake_Case: 'Const_',          PascalCase: 'Const',          camelCase: 'const'          },
      { type: 'Text Template',                     Snake_Case: 'Template_',       PascalCase: 'Template',       camelCase: 'template'       },
      { type: 'Choice',                            Snake_Case: 'Choice_',         PascalCase: 'Choice',         camelCase: 'choice'         },
      { type: 'Collection Choice Set',             Snake_Case: 'CollChoice_',     PascalCase: 'CollChoice',     camelCase: 'collchoice'     },
      { type: 'Record Choice Set',                 Snake_Case: 'RecChoice_',      PascalCase: 'RecChoice',      camelCase: 'recchoice'      },
      { type: 'Picklist Choice Set',               Snake_Case: 'PickList_',       PascalCase: 'PickList',       camelCase: 'picklist'       },
      { type: 'Stage',                             Snake_Case: 'Stage_',          PascalCase: 'Stage',          camelCase: 'stage'          },
      { type: 'Step',                              Snake_Case: 'Step_',           PascalCase: 'Step',           camelCase: 'step'           }
    ];
  }

  /**
   * Live-reload: when the custom prefix configuration in chrome.storage.local
   * is changed by another context (typically the settings page), invalidate the
   * cache in this context and reload from storage. This means users don't need
   * to refresh Flow Builder tabs after importing or resetting a custom config.
   */
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace !== 'local') return;
      if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return;

      // Invalidate cache so load() performs a fresh read.
      _loaded = false;
      _prefixes = [];
      _isCustom = false;

      load()
        .then(() => {
          console.log('[SFUT APIGen] Prefix config changed — reloaded.');
        })
        .catch((err) => {
          console.warn('[SFUT APIGen] Failed to reload prefixes after storage change:', err);
        });
    });
  }

  // --- Public API ---
  return {
    load,
    importCustom,
    resetToDefaults,
    isCustom,
    getAll,
    getByType,
    getTypeFromIconName,
    getDisplayList,
    exportAsJson,
    ICON_TO_TYPE
  };

})();