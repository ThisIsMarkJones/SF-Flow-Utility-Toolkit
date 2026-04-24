/**
 * SF Flow Utility Toolkit - Setup Tabs Feature
 *
 * Injects quick-access tabs into Salesforce's existing Setup tab bar
 * for navigating to Flows, Flow Trigger Explorer, and Process Automation Settings.
 * Optionally injects a tab to open the Automation App Home (Lightning app) when enabled.
 *
 * Controlled by:
 * - 'setupTabs.enabled' (master toggle)
 * - 'setupTabs.automationHome.enabled' (optional Automation Home tab; recommended default: false)
 *
 * Notes:
 * - Flow Trigger Explorer lives on a different subdomain (lightning.force.com) from Setup (salesforce-setup.com),
 *   so it opens in a new browser tab.
 * - Automation Home uses the known working app-developer-name URL suffix:
 *   /lightning/app/standard__FlowsApp
 * - No AppDefinition query or DurableId resolution is needed.
 */

const SetupTabsFeature = (() => {

  const TAB_CLASS = 'sfut-custom-tab';
  const GROUP_LABEL = 'Automation';
  let _isInjecting = false;

  const BASE_TABS = [
    {
      id: 'sfut_tab_flows',
      label: 'Flows',
      getUrl: (hostname) => {
        const setupHostname = _getSetupHostname(hostname);
        return `https://${setupHostname}/lightning/setup/Flows/home`;
      },
      openInNewTab: false
    },
    {
      id: 'sfut_tab_flow_trigger_explorer',
      label: 'Flow Trigger Explorer',
      getUrl: (hostname) => {
        const lightningHostname = _getLightningHostname(hostname);
        return `https://${lightningHostname}/interaction_explorer/flowExplorer.app`;
      },
      openInNewTab: true
    },
    {
      id: 'sfut_tab_process_automation_settings',
      label: 'Process Automation Settings',
      getUrl: (hostname) => {
        const setupHostname = _getSetupHostname(hostname);
        return `https://${setupHostname}/lightning/setup/WorkflowSettings/home`;
      },
      openInNewTab: false
    }
  ];

  const AUTOMATION_HOME_TAB = {
    id: 'sfut_tab_automation_home',
    label: 'Automation Home',
    getUrl: (hostname) => {
      const lightningHostname = _getLightningHostname(hostname);
      return `https://${lightningHostname}/lightning/app/standard__FlowsApp`;
    },
    openInNewTab: true
  };

  async function init() {
    const enabled = await SettingsManager.get('setupTabs.enabled');

    if (!enabled) {
      console.log('[SFUT] Setup Tabs feature is disabled.');
      return;
    }

    _waitForTabBar().then(() => {
      _injectTabs();
    });

    SettingsManager.onChange((key, newValue) => {
      if (key === 'setupTabs.enabled') {
        if (newValue) {
          _waitForTabBar().then(() => {
            _injectTabs();
          });
        } else {
          _removeTabs();
        }
      }

      if (key === 'setupTabs.automationHome.enabled') {
        SettingsManager.get('setupTabs.enabled').then((isEnabled) => {
          if (!isEnabled) return;
          _removeTabs();
          _waitForTabBar().then(() => {
            _injectTabs();
          });
        });
      }

      if (key === 'setupTabs.groupingEnabled') {
        SettingsManager.get('setupTabs.enabled').then((isEnabled) => {
          if (!isEnabled) return;
          _removeTabs();
          _waitForTabBar().then(() => {
            _injectTabs();
          });
        });
      }
    });
  }

  async function onActivate() {
    const existing = document.querySelector(`.${TAB_CLASS}`);
    if (existing) {
      await SettingsManager.set('setupTabs.enabled', false);
      _showToast('Setup Tabs disabled');
    } else {
      await SettingsManager.set('setupTabs.enabled', true);
      _showToast('Setup Tabs enabled');
    }
  }

  function _waitForTabBar() {
    return new Promise((resolve) => {
      const tabBar = _findTabBar();
      if (tabBar) {
        resolve(tabBar);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const foundTabBar = _findTabBar();
        if (foundTabBar) {
          obs.disconnect();
          resolve(foundTabBar);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        const foundTabBar = _findTabBar();
        if (foundTabBar) {
          resolve(foundTabBar);
        } else {
          console.warn('[SFUT] Tab bar not found after timeout.');
        }
      }, 10000);
    });
  }

  function _findTabBar() {
    return document.querySelector('ul.tabBarItems');
  }

  async function _injectTabs() {
    if (_isInjecting) return;
    _isInjecting = true;

    try {
      if (document.querySelector(`.${TAB_CLASS}`)) {
        return;
      }

      const tabBar = _findTabBar();
      if (!tabBar) {
        console.warn('[SFUT] Could not find tab bar for Setup Tabs injection.');
        return;
      }

      const currentHostname = window.location.hostname;

      const tabsToInject = [...BASE_TABS];
      const automationHomeEnabled = await SettingsManager.get('setupTabs.automationHome.enabled');
      if (automationHomeEnabled) {
        tabsToInject.push(AUTOMATION_HOME_TAB);
      }

      const groupingEnabled = await SettingsManager.get('setupTabs.groupingEnabled');

      if (groupingEnabled) {
        await _injectGroupedTab(tabBar, tabsToInject, currentHostname);
      } else {
        await _injectFlatTabs(tabBar, tabsToInject, currentHostname);
      }

      console.log('[SFUT] Setup Tabs injected into tab bar successfully.');
    } finally {
      _isInjecting = false;
    }
  }

  async function _injectFlatTabs(tabBar, tabsToInject, currentHostname) {
    for (const tab of tabsToInject) {
      let tabUrl;
      try {
        tabUrl = await tab.getUrl(currentHostname);
      } catch (e) {
        console.warn('[SFUT] Failed to build tab URL:', tab.id, e);
        continue;
      }

      const isActive = _isActiveTab(tab.id);

      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      li.className = `oneConsoleTabItem tabItem slds-context-bar__item borderRight navexConsoleTabItem ${TAB_CLASS}`;
      li.dataset.tabId = tab.id;
      li.dataset.url = tabUrl;

      const a = document.createElement('a');
      a.setAttribute('role', 'tab');
      a.setAttribute('tabindex', '-1');
      a.setAttribute('title', tab.label);
      a.setAttribute('aria-selected', isActive ? 'true' : 'false');
      a.href = tabUrl;
      a.target = tab.openInNewTab ? '_blank' : '_self';
      a.className = 'tabHeader slds-context-bar__label-action';

      const span = document.createElement('span');
      span.className = 'title slds-truncate';
      span.textContent = tab.label;

      a.appendChild(span);
      li.appendChild(a);

      a.addEventListener('click', async (e) => {
        if (tab.openInNewTab) {
          return;
        }
        e.preventDefault();
        const targetUrl = await tab.getUrl(currentHostname);
        _navigateToTab(targetUrl);
      });

      tabBar.appendChild(li);
    }
  }

  async function _injectGroupedTab(tabBar, tabsToInject, currentHostname) {
    // Resolve URLs for all child tabs upfront
    const tabItems = [];
    for (const tab of tabsToInject) {
      let tabUrl;
      try {
        tabUrl = tab.getUrl(currentHostname);
      } catch (e) {
        console.warn('[SFUT] Failed to build tab URL:', tab.id, e);
        continue;
      }
      tabItems.push({ tab, url: tabUrl });
    }

    if (tabItems.length === 0) return;

    const anyChildActive = tabItems.some(({ tab }) => _isActiveTab(tab.id));

    // Parent group tab
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    li.className = `oneConsoleTabItem tabItem slds-context-bar__item borderRight navexConsoleTabItem ${TAB_CLASS} sfut-group-tab`;
    if (anyChildActive) li.classList.add('slds-is-active');

    // Label anchor — clicking it also toggles the dropdown
    const a = document.createElement('a');
    a.setAttribute('role', 'tab');
    a.setAttribute('tabindex', '-1');
    a.setAttribute('title', GROUP_LABEL);
    a.setAttribute('aria-selected', anyChildActive ? 'true' : 'false');
    a.href = 'javascript:void(0)';
    a.className = 'tabHeader slds-context-bar__label-action';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'title slds-truncate';
    labelSpan.textContent = GROUP_LABEL;
    a.appendChild(labelSpan);

    // Chevron wrapper and button
    const chevronWrapper = document.createElement('div');
    chevronWrapper.className = 'slds-context-bar__label-action slds-p-left--none';

    const chevronBtn = document.createElement('a');
    chevronBtn.className = 'slds-button slds-button--icon sfut-group-chevron';
    chevronBtn.setAttribute('href', 'javascript:void(0)');
    chevronBtn.setAttribute('role', 'button');
    chevronBtn.setAttribute('aria-expanded', 'false');
    chevronBtn.setAttribute('aria-haspopup', 'true');
    chevronBtn.setAttribute('title', `${GROUP_LABEL} options`);
    chevronBtn.innerHTML = `<svg focusable="false" aria-hidden="true" viewBox="0 0 520 520" class="slds-icon slds-icon_xx-small slds-button__icon slds-button__icon--hint"><path d="M476 178L271 385c-6 6-16 6-22 0L44 178c-6-6-6-16 0-22l22-22c6-6 16-6 22 0l161 163c6 6 16 6 22 0l161-162c6-6 16-6 22 0l22 22c5 6 5 15 0 21z"></path></svg>`;
    chevronWrapper.appendChild(chevronBtn);

    // Dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'sfut-group-dropdown';
    dropdown.setAttribute('role', 'menu');

    const ul = document.createElement('ul');
    ul.setAttribute('role', 'presentation');

    for (const { tab, url } of tabItems) {
      const itemLi = document.createElement('li');
      itemLi.setAttribute('role', 'presentation');
      itemLi.className = 'uiMenuItem';

      const link = document.createElement('a');
      link.setAttribute('role', 'menuitem');
      link.setAttribute('href', url);
      link.setAttribute('title', tab.label);
      link.target = tab.openInNewTab ? '_blank' : '_self';
      link.textContent = tab.label;

      link.addEventListener('click', async (e) => {
        _closeGroupDropdown(dropdown, chevronBtn);
        if (tab.openInNewTab) {
          return; // Let the browser open the new tab naturally
        }
        e.preventDefault();
        const targetUrl = tab.getUrl(currentHostname);
        _navigateToTab(targetUrl);
      });

      itemLi.appendChild(link);
      ul.appendChild(itemLi);
    }

    dropdown.appendChild(ul);

    // Toggle handler shared by label and chevron
    const toggleDropdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('sfut-group-dropdown--open');

      // Close any other open group dropdowns first
      document.querySelectorAll('.sfut-group-dropdown--open').forEach(d => {
        const parentLi = d.closest('.sfut-group-tab');
        const otherChevron = parentLi && parentLi.querySelector('.sfut-group-chevron');
        d.classList.remove('sfut-group-dropdown--open');
        if (otherChevron) otherChevron.setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        dropdown.classList.add('sfut-group-dropdown--open');
        chevronBtn.setAttribute('aria-expanded', 'true');
      }
    };

    a.addEventListener('click', toggleDropdown);
    chevronBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(e);
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!li.contains(e.target)) {
        _closeGroupDropdown(dropdown, chevronBtn);
      }
    }, { capture: true });

    li.appendChild(a);
    li.appendChild(chevronWrapper);
    li.appendChild(dropdown);
    tabBar.appendChild(li);
  }

  function _closeGroupDropdown(dropdown, chevronBtn) {
    dropdown.classList.remove('sfut-group-dropdown--open');
    if (chevronBtn) chevronBtn.setAttribute('aria-expanded', 'false');
  }

  function _removeTabs() {
    const tabs = document.querySelectorAll(`.${TAB_CLASS}`);
    tabs.forEach((tab) => tab.remove());
    console.log('[SFUT] Setup Tabs removed.');
  }

  function _isActiveTab(tabId) {
    const url = window.location.href;

    switch (tabId) {
      case 'sfut_tab_flows':
        return url.includes('/lightning/setup/Flows/');
      case 'sfut_tab_flow_trigger_explorer':
        return url.includes('/interaction_explorer/flowExplorer');
      case 'sfut_tab_process_automation_settings':
        return url.includes('/lightning/setup/WorkflowSettings/');
      case 'sfut_tab_automation_home':
        return url.includes('/lightning/app/');
      default:
        return false;
    }
  }

  function _navigateToTab(url) {
    if (window.$A && window.$A.get) {
      try {
        const event = window.$A.get('e.force:navigateToURL');
        if (event) {
          event.setParams({ url });
          event.fire();
          return;
        }
      } catch (e) {
        // Fall through
      }
    }

    window.location.href = url;
  }

  function _getSetupHostname(hostname) {
    if (hostname.includes('.salesforce-setup.com')) {
      return hostname;
    }

    const parts = hostname.split('.');
    const orgIdentifier = parts[0];
    const environment = parts[1];

    return `${orgIdentifier}.${environment}.my.salesforce-setup.com`;
  }

  function _getLightningHostname(hostname) {
    if (hostname.includes('.lightning.force.com')) {
      return hostname;
    }

    const parts = hostname.split('.');
    const orgIdentifier = parts[0];
    const environment = parts[1];

    return `${orgIdentifier}.${environment}.lightning.force.com`;
  }

  function _showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'sfut-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('sfut-toast-visible');
    });

    setTimeout(() => {
      toast.classList.remove('sfut-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  return {
    init,
    onActivate
  };

})();

SFFlowUtilityToolkit.registerFeature('setup-tabs', SetupTabsFeature);