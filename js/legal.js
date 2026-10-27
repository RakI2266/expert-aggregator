/* =====================================================
   Expert Letters — юридические данные.
   Заполните пустые значения ОДИН раз — они подставятся на все страницы
   (документы, подвал сайта). Пока значение пустое, на странице видна
   жёлтая метка «[email]» и т.п.
   ===================================================== */
var LEGAL = {
  operator: 'Индивидуальный предприниматель Рак Илья Александрович',
  operatorShort: 'ИП Рак Илья Александрович',
  inn: '772407077928',
  ogrnip: '322774600594779',
  // ↓↓↓ заполните перед запуском
  email: '',          // почта для обращений по ПДн, например privacy@expertletters.ru
  domain: '',         // адрес сайта, например expertletters.ru
  date: '',           // дата редакции документов, например 15.10.2026
  address: '',        // адрес для корреспонденции
  hosting: '',        // хостинг-провайдер, например ООО «Яндекс.Облако»
  mailService: '',    // сервис отправки писем
  taxRegime: '',      // налоговый режим, например упрощённой системы налогообложения
  // служебные пометки из черновика ([Проверить…], [Решить…]) видны, пока true
  showDraftNotes: true
};

(function () {
  function fill() {
    document.querySelectorAll('[data-legal]').forEach(function (el) {
      var key = el.getAttribute('data-legal');
      var v = LEGAL[key];
      if (v) { el.textContent = v; el.classList.remove('ph-empty'); }
      else { el.textContent = '[' + (el.getAttribute('data-label') || key) + ']'; el.classList.add('ph-empty'); }
    });
    document.querySelectorAll('a[data-legal-mail]').forEach(function (a) {
      if (LEGAL.email) a.href = 'mailto:' + LEGAL.email; else a.removeAttribute('href');
    });
    if (!LEGAL.showDraftNotes) document.querySelectorAll('.legal-note').forEach(function (n) { n.remove(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill); else fill();
})();
