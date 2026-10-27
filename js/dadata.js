/**
 * DaData: организация по ИНН / ОГРН (findById/party)
 * Ключ: window.EL_CONFIG.dadataKey из config.local.js
 */
(function (global) {
  'use strict';

  var ENDPOINT = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party';

  function getKey() {
    if (global.EL_CONFIG && global.EL_CONFIG.dadataKey) return String(global.EL_CONFIG.dadataKey).trim();
    if (global.DADATA_API_KEY) return String(global.DADATA_API_KEY).trim();
    return '';
  }

  /**
   * @param {string} query ИНН, ИНН/КПП или ОГРН
   * @returns {Promise<object|null>} нормализованные поля компании или null
   */
  async function findPartyById(query) {
    var q = String(query || '').replace(/\s+/g, '').trim();
    if (!q) throw new Error('Укажите ИНН или ОГРН');
    var key = getKey();
    if (!key) throw new Error('Нет ключа DaData. Проверьте js/config.local.js');

    var res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Token ' + key
      },
      body: JSON.stringify({ query: q, branch_type: 'MAIN', count: 1 })
    });

    if (!res.ok) {
      var t = await res.text().catch(function () { return ''; });
      throw new Error('DaData: ' + res.status + (t ? ' — ' + t.slice(0, 120) : ''));
    }

    var data = await res.json();
    var item = data && data.suggestions && data.suggestions[0];
    if (!item || !item.data) return null;

    var d = item.data;
    var addr = d.address || {};
    return {
      name: (d.name && (d.name.short_with_opf || d.name.full_with_opf)) || item.value || '',
      fullName: (d.name && d.name.full_with_opf) || item.value || '',
      inn: d.inn || '',
      kpp: d.kpp || '',
      ogrn: d.ogrn || '',
      address: addr.value || addr.unrestricted_value || '',
      type: d.type || '',
      status: (d.state && d.state.status) || ''
    };
  }

  global.DaDataParty = {
    findById: findPartyById,
    hasKey: function () { return !!getKey(); }
  };
})(window);
