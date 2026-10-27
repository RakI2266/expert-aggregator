/* =====================================================
   Expert Letters - MVP v2.1
   localStorage demo
   ===================================================== */

const STORAGE_KEY = 'expert_letters_v2_1';

const COURTS = [
  'Арбитражный суд г. Москвы',
  'Арбитражный суд Московской области',
  'Арбитражный суд Санкт-Петербурга и Ленинградской области',
  'Арбитражный суд Свердловской области',
  'Арбитражный суд Новосибирской области',
  'Арбитражный суд Краснодарского края',
  'Арбитражный суд Республики Татарстан',
  'Арбитражный суд Ростовской области',
  'Арбитражный суд Челябинской области',
  'Арбитражный суд Нижегородской области'
];

const EXPERTISE_TYPES = [
  'Судебная строительно-техническая экспертиза',
  'Досудебная строительно-техническая экспертиза',
  'Экспертиза качества и объёмов СМР',
  'Обследование зданий и сооружений',
  'Экспертиза проектной и сметной документации',
  'Стоимость строительства и устранение дефектов',
  'Земельно-строительные исследования',
  'Градостроительно-земельные исследования',
  'Экспертиза инженерных сетей и коммуникаций',
  'Экспертиза пожарной безопасности',
  'Экспертиза при приёмке квартир и строительных дефектов'
];

const CLOSE_REASONS = [
  { id: 'expert_selected', label: 'Эксперт выбран' },
  { id: 'no_suitable', label: 'Подходящего предложения нет' },
  { id: 'resolved_other', label: 'Вопрос решён другим способом' },
  { id: 'not_relevant', label: 'Заявка больше не актуальна' },
  { id: 'other', label: 'Другое' }
];

const LAWYER_PLANS = {
  trial: { id: 'trial', name: 'Trial', price: 0, limitLimit: 3, days: 14 },
  p5:    { id: 'p5', name: '5 заявок', price: 1500, reqLimit: 5, days: 30 },
  p10:   { id: 'p10', name: '10 заявок', price: 2000, reqLimit: 10, days: 30 },
  unlimited: { id: 'unlimited', name: 'Безлимит', price: 3000, reqLimit: null, days: 30 }
};

const DEFAULT_EXPERTISE_TYPE = EXPERTISE_TYPES[0];
/** Старые значения вида экспертизы → значения справочника */
const EXPERTISE_ALIASES = {
  'Строительно-техническая': 'Судебная строительно-техническая экспертиза',
  'Строительно-техническая экспертиза': 'Судебная строительно-техническая экспертиза'
};
function normalizeExpertiseType(t) {
  if (!t) return DEFAULT_EXPERTISE_TYPE;
  if (EXPERTISE_TYPES.includes(t)) return t;
  return EXPERTISE_ALIASES[t] || t;
}

/** Регион эксперта → суды (для фильтра «Мои суды», если суды не выбраны в настройках) */
const REGION_COURTS = {
  'Москва': ['Арбитражный суд г. Москвы'],
  'Московская область': ['Арбитражный суд Московской области'],
  'Санкт-Петербург': ['Арбитражный суд Санкт-Петербурга и Ленинградской области'],
  'Ленинградская область': ['Арбитражный суд Санкт-Петербурга и Ленинградской области']
};
function getExpertDefaultCourts(user) {
  if (!user) return [];
  if (Array.isArray(user.preferredCourts) && user.preferredCourts.length) return user.preferredCourts.slice();
  const out = [];
  (user.regions || []).forEach(r => (REGION_COURTS[r] || []).forEach(c => { if (!out.includes(c)) out.push(c); }));
  return out;
}

// ---------- Security: экранирование HTML ----------
/** Экранирует любой пользовательский текст перед вставкой в innerHTML/атрибуты. */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"'`]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;'
  }[c]));
}

// ---------- Даты: всё по локальному времени пользователя (МСК), а не по UTC ----------
function pad2(n) { return String(n).padStart(2, '0'); }
/** 'YYYY-MM-DD' в локальном часовом поясе */
function localDateStr(d) {
  d = d ? new Date(d) : new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function todayStr() { return localDateStr(new Date()); }
function addDaysStr(n, from) {
  const d = from ? new Date(from) : new Date();
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}
/** Разница в днях между сегодня и датой 'YYYY-MM-DD' (локально) */
function daysUntilDate(dateStr) {
  if (!dateStr) return null;
  const t = new Date(todayStr() + 'T12:00:00');
  const e = new Date(String(dateStr).slice(0, 10) + 'T12:00:00');
  return Math.round((e - t) / 86400000);
}

// ---------- Статусы заявки (единая точка правды) ----------
/** 'accepting' - идёт приём; 'expired' - срок вышел, но юрист ещё не закрыл; 'closed' - закрыта */
function effectiveStatus(req) {
  if (!req) return 'closed';
  if (req.status === 'closed') return 'closed';
  if (req.acceptUntil && req.acceptUntil < todayStr()) return 'expired';
  return 'accepting';
}
function isAccepting(req) { return effectiveStatus(req) === 'accepting'; }

// ---------- Storage ----------
const SCHEMA_VERSION = 4;
function emptyCompany(role) {
  return {
    solo: role === 'lawyer',
    name: '',
    inn: '',
    kpp: '',
    ogrn: '',
    address: '',
    logo: '' // data URL
  };
}
function ensureOrgFields(u) {
  if (!u || typeof u !== 'object') return u;
  if (!u.teamRole) u.teamRole = 'admin';
  if (typeof u.seeAll !== 'boolean') u.seeAll = true;
  if (!Array.isArray(u.employees)) u.employees = [];
  if (!u.company || typeof u.company !== 'object') {
    u.company = emptyCompany(u.role);
    if (u.role === 'expert') {
      u.company.solo = false;
      u.company.name = u.orgName || u.name || '';
    } else if (u.orgName) {
      u.company.solo = false;
      u.company.name = u.orgName;
    }
  }
  if (u.role === 'expert' && !u.company.name && (u.orgName || u.name)) {
    u.company.name = u.orgName || u.name;
  }
  return u;
}
function migrateState(s) {
  if (!Array.isArray(s.threads)) s.threads = [];
  if (!Array.isArray(s.notifications)) s.notifications = [];
  if (!Array.isArray(s.requests)) s.requests = [];
  (s.requests || []).forEach(r => {
    r.expertiseType = normalizeExpertiseType(r.expertiseType);
    if (!Array.isArray(r.answers)) r.answers = [];
    if (!Array.isArray(r.editHistory)) r.editHistory = [];
  });
  if (!s.users || typeof s.users !== 'object') s.users = {};
  Object.keys(s.users).forEach(id => { ensureOrgFields(s.users[id]); });
  if (s.currentUser) ensureOrgFields(s.currentUser);
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}

function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  if (raw) {
    try {
      return migrateState(JSON.parse(raw));
    } catch (e) {
      // Повреждённые данные не затираем молча - сохраняем копию
      try { localStorage.setItem(STORAGE_KEY + '_corrupted_' + Date.now(), raw); } catch (e2) {}
    }
  }
  return migrateState(getInitialState());
}

/** Возвращает true, если сохранилось. При переполнении хранилища - понятная ошибка вместо тихой потери данных. */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    if (typeof document !== 'undefined') {
      toast('Не удалось сохранить: хранилище браузера переполнено. Сбросьте демо-данные на странице входа.', 'error');
    }
    return false;
  }
}

function getInitialState() {
  const now = new Date();
  // Демо-даты всегда согласованы с правилом «срок приёма не позже даты суда»
  const acceptUntil1 = addDaysStr(7);
  const hearing1 = addDaysStr(12);
  const acceptUntil2 = addDaysStr(5);
  const hearing2 = addDaysStr(9);

  return {
    currentUser: null,
    users: {
      lawyer1: {
        id: 'lawyer1',
        role: 'lawyer',
        name: 'Иванов Алексей Петрович',
        email: 'lawyer@demo.ru',
        phone: '+7 (999) 111-22-33',
        planId: 'trial',
        planStartedAt: null, // set on first login / migrate
        requestsUsed: 0,
        notifSettings: {
          inApp: true,
          email: true,
          telegram: false,
          telegramConnected: false,
          telegramId: '',
          courtDays: [7, 3, 0],
          events: {
            newAnswer: true,
            requestClosed: true,
            answerUpdated: true,
            courtReminder: true
          }
        }
      },
      expert1: {
        id: 'expert1',
        role: 'expert',
        name: 'ООО «ЭкспертСтрой»',
        orgName: 'ООО «ЭкспертСтрой»',
        email: 'expert@demo.ru',
        contact: 'Смирнова Е.В.',
        phone: '+7 (999) 222-33-44',
        regions: ['Москва', 'Московская область'],
        status: 'confirmed',
        favorites: [],
        hidden: [],
        notifSettings: {
          inApp: true,
          email: true,
          telegram: false,
          telegramConnected: false,
          telegramId: '',
          courtDays: [7, 3, 0],
          events: {
            // важные
            requestChanged: true,
            requestClosed: true,
            courtReminder: true,
            // информационные
            newRequest: true,
            newRequestPreferred: false
          }
        }
      },
      expert2: {
        id: 'expert2',
        role: 'expert',
        name: 'АО «ТехноЭкспертиза»',
        orgName: 'АО «ТехноЭкспертиза»',
        email: 'tech@demo.ru',
        contact: 'Козлов И.А.',
        phone: '+7 (999) 333-44-55',
        regions: ['Москва', 'Санкт-Петербург'],
        status: 'confirmed',
        favorites: [],
        hidden: [],
        notifSettings: {
          inApp: true,
          email: true,
          telegram: false,
          telegramConnected: false,
          telegramId: '',
          courtDays: [7, 3, 0],
          events: {
            // важные
            requestChanged: true,
            requestClosed: true,
            courtReminder: true,
            // информационные
            newRequest: true,
            newRequestPreferred: false
          }
        }
      }
    },
    requests: [
      {
        id: 'req-001',
        lawyerId: 'lawyer1',
        caseNumber: 'А40-123456/2026',
        court: 'Арбитражный суд г. Москвы',
        expertiseType: 'Судебная строительно-техническая экспертиза',
        hearingDate: hearing1,
        hearingTime: '',
        acceptUntil: acceptUntil1,
        additionalInfo: 'Необходимо оценить качество выполненных строительно-монтажных работ.',
        attachments: [],
        questions: [
          'Соответствует ли качество выполненных работ проектной документации и строительным нормам?',
          'Какова стоимость устранения выявленных недостатков?',
          'Имеются ли отклонения от проектной документации?'
        ],
        status: 'accepting',
        publishedAt: now.toISOString(),
        closedAt: null,
        lastEditedAt: null,
        editHistory: [],
        answers: []
      },
      {
        id: 'req-002',
        lawyerId: 'lawyer1',
        caseNumber: '41-36796/2026',
        court: 'Арбитражный суд г. Москвы',
        expertiseType: 'Экспертиза качества и объёмов СМР',
        hearingDate: hearing2,
        hearingTime: '10:00',
        acceptUntil: acceptUntil2,
        additionalInfo: 'Объект - нежилое здание, ~1 200 м². Требуется выезд на осмотр.',
        attachments: [],
        questions: [
          'Соответствуют ли объёмы выполненных работ актам КС-2?',
          'Имеются ли недостатки выполненных работ и каковы причины их возникновения?',
          'Какова стоимость устранения недостатков?'
        ],
        status: 'accepting',
        publishedAt: new Date(now.getTime() - 3600000).toISOString(),
        closedAt: null,
        lastEditedAt: null,
        editHistory: [],
        answers: [
          {
            id: 'ans-demo1',
            organizationId: 'expert1',
            organizationName: 'ООО «ЭкспертСтрой»',
            expertName: 'Иванов Иван Иванович',
            price: 260000,
            termDays: 15,
            additionalInfo: 'Выезд на объект в течение 3 рабочих дней после определения суда.',
            fileName: 'Письмо_ЭкспертСтрой_41-36796.pdf',
            submittedAt: new Date(now.getTime() - 3000000).toISOString(),
            status: 'sent',
            withdrawn: false,
            versions: []
          },
          {
            id: 'ans-demo2',
            organizationId: 'expert2',
            organizationName: 'АО «ТехноЭкспертиза»',
            expertName: 'Козлов Игорь Андреевич',
            price: 310000,
            termDays: 12,
            additionalInfo: 'Эксперт со стажем 15 лет, опыт по аналогичным делам.',
            fileName: 'ТехноЭкспертиза_предложение.pdf',
            submittedAt: new Date(now.getTime() - 2400000).toISOString(),
            status: 'sent',
            withdrawn: false,
            versions: []
          }
        ]
      }
    ],
    notifications: [],
    threads: [],
    schemaVersion: SCHEMA_VERSION
  };
}

function uid(prefix = 'id') {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------- Auth ----------
function loginAs(role) {
  const state = loadState();
  if (role === 'lawyer') {
    ensureLawyerBilling(state.users.lawyer1);
    state.currentUser = { ...state.users.lawyer1 };
  } else {
    state.currentUser = { ...state.users.expert1 };
  }
  saveState(state);
  location.href = role === 'lawyer' ? 'lawyer/dashboard.html' : 'expert/feed.html';
}

function logout() {
  const state = loadState();
  state.currentUser = null;
  saveState(state);
  location.href = '../index.html';
}

function requireAuth(role) {
  const state = loadState();
  if (!state.currentUser || (role && state.currentUser.role !== role)) {
    location.href = '../index.html';
    return null;
  }
  return state;
}

function syncUser(state) {
  if (!state.currentUser) return;
  const u = state.users[state.currentUser.id];
  if (u) state.currentUser = { ...u };
}


function ensureLawyerBilling(u) {
  if (!u || u.role !== 'lawyer') return u;
  if (!u.planId) u.planId = 'trial';
  if (!u.planStartedAt) {
    u.planStartedAt = new Date().toISOString();
  }
  if (typeof u.requestsUsed !== 'number') {
    // count existing requests by this lawyer
    try {
      const state = loadState();
      u.requestsUsed = (state.requests || []).filter(r => r.lawyerId === u.id).length;
    } catch (e) {
      u.requestsUsed = 0;
    }
  }
  return u;
}

function getLawyerPlan(user) {
  const u = ensureLawyerBilling(user || (loadState().currentUser));
  const plan = LAWYER_PLANS[u.planId] || LAWYER_PLANS.trial;
  const started = new Date(u.planStartedAt);
  const ends = new Date(started);
  ends.setDate(ends.getDate() + (plan.days || 14));
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((ends - now) / 86400000));
  const expired = now > ends;
  const limit = plan.reqLimit;
  const used = u.requestsUsed || 0;
  const remaining = limit == null ? null : Math.max(0, limit - used);
  const canCreate = !expired && (limit == null || used < limit);
  return {
    plan,
    used,
    remaining,
    limit,
    daysLeft,
    endsAt: ends.toISOString(),
    expired,
    canCreate
  };
}

function setLawyerPlan(planId) {
  const state = loadState();
  const u = state.users[state.currentUser.id];
  if (!u || u.role !== 'lawyer') return null;
  if (!LAWYER_PLANS[planId]) return null;
  u.planId = planId;
  u.planStartedAt = new Date().toISOString();
  u.requestsUsed = 0;
  ensureLawyerBilling(u);
  syncUser(state);
  saveState(state);
  return getLawyerPlan(u);
}

function updateProfile(data) {
  const state = loadState();
  const u = state.users[state.currentUser.id];
  if (!u) return;
  Object.assign(u, data);
  syncUser(state);
  saveState(state);
}

// ---------- Requests (Lawyer) ----------
function getRequestsForLawyer(lawyerId) {
  const state = loadState();
  return state.requests
    .filter(r => r.lawyerId === lawyerId)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function getRequest(id) {
  const state = loadState();
  return state.requests.find(r => r.id === id) || null;
}

function createRequest(data) {
  const state = loadState();
  const u = state.users[state.currentUser.id];
  ensureLawyerBilling(u);
  const planInfo = getLawyerPlan(u);
  if (!planInfo.canCreate) {
    return { error: planInfo.expired
      ? 'Срок Trial/тарифа истёк. Выберите тариф, чтобы публиковать заявки.'
      : 'Лимит заявок по тарифу исчерпан. Выберите другой тариф.' };
  }

  const req = {
    id: uid('req'),
    lawyerId: state.currentUser.id,
    caseNumber: data.caseNumber,
    court: data.court,
    expertiseType: normalizeExpertiseType(data.expertiseType),
    hearingDate: data.hearingDate || '',
    hearingTime: data.hearingTime || '',
    acceptUntil: data.acceptUntil,
    additionalInfo: data.additionalInfo || '',
    attachments: data.attachments || [],
    questions: (data.questions || []).filter(q => q.trim()),
    status: 'accepting',
    publishedAt: new Date().toISOString(),
    closedAt: null,
    closeReason: null,
    closeReasonNote: '',
    selectedAnswerId: null,
    lastEditedAt: null,
    editHistory: [],
    answers: []
  };
  state.requests.unshift(req);
  u.requestsUsed = (u.requestsUsed || 0) + 1;
  syncUser(state);

  pushNotification(state, {
    type: 'new_request',
    title: 'Новая заявка',
    body: 'Появилась заявка ' + req.caseNumber,
    forRole: 'expert',
    requestId: req.id,
    priority: 'info'
  });

  saveState(state);
  return req;
}

function requestSnapshot(r) {
  return {
    caseNumber: r.caseNumber,
    court: r.court,
    expertiseType: r.expertiseType,
    hearingDate: r.hearingDate || '',
    hearingTime: r.hearingTime || '',
    acceptUntil: r.acceptUntil,
    additionalInfo: r.additionalInfo || '',
    attachments: [...(r.attachments || [])],
    questions: (r.questions || []).map(q => String(q)).filter(q => q.trim())
  };
}

/** Кого уведомим об изменении заявки: ответившие + добавившие в избранное */
function getRequestWatchers(state, req) {
  const answered = new Set(req.answers.filter(a => !a.withdrawn).map(a => a.organizationId));
  return Object.values(state.users).filter(u =>
    u.role === 'expert' && (answered.has(u.id) || (u.favorites || []).includes(req.id))
  );
}

/** Предпросмотр изменений перед сохранением: что изменится и сколько экспертов получат уведомление */
function previewRequestDiff(requestId, data) {
  const state = loadState();
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return { changes: [], recipients: 0 };
  const after = requestSnapshot(Object.assign({}, req, data, { expertiseType: normalizeExpertiseType(data.expertiseType || req.expertiseType) }));
  return {
    changes: computeRequestDiff(requestSnapshot(req), after),
    recipients: getRequestWatchers(state, req).length
  };
}

function updateRequest(requestId, data) {
  const state = loadState();
  const req = state.requests.find(r => r.id === requestId);
  if (!req || req.status === 'closed') return null;
  if (req.lawyerId !== state.currentUser.id) return null;

  const before = {
    caseNumber: req.caseNumber,
    court: req.court,
    expertiseType: req.expertiseType,
    hearingDate: req.hearingDate,
    hearingTime: req.hearingTime,
    acceptUntil: req.acceptUntil,
    additionalInfo: req.additionalInfo,
    attachments: [...(req.attachments || [])],
    questions: [...req.questions]
  };

  const prevEditedAt = req.lastEditedAt;
  const snapshot = Object.assign({}, before, { editedAt: new Date().toISOString() });
  req.editHistory.push(snapshot);

  req.caseNumber = data.caseNumber;
  req.court = data.court;
  req.expertiseType = normalizeExpertiseType(data.expertiseType || req.expertiseType);
  req.hearingDate = data.hearingDate || '';
  req.hearingTime = data.hearingTime || '';
  req.acceptUntil = data.acceptUntil;
  req.additionalInfo = data.additionalInfo || '';
  req.attachments = data.attachments || [];
  req.questions = (data.questions || []).filter(q => q.trim());
  req.lastEditedAt = new Date().toISOString();

  const after = {
    caseNumber: req.caseNumber,
    court: req.court,
    expertiseType: req.expertiseType,
    hearingDate: req.hearingDate,
    hearingTime: req.hearingTime,
    acceptUntil: req.acceptUntil,
    additionalInfo: req.additionalInfo,
    attachments: [...(req.attachments || [])],
    questions: [...req.questions]
  };
  const changes = computeRequestDiff(before, after);
  const changeLines = changes.map(c => c.label).join('; ');

  // Без изменений - не создаём версию и не тревожим экспертов
  if (!changes.length) { req.editHistory.pop(); req.lastEditedAt = prevEditedAt; saveState(state); return req; }
  getRequestWatchers(state, req).forEach(u => {
    {
      pushNotification(state, {
        type: 'request_changed',
        title: 'Заявка изменена',
        body: 'Заявка ' + req.caseNumber + ': ' + (changeLines || 'обновлены данные') + '. Можно обновить предложение.',
        forRole: 'expert',
        forUserId: u.id,
        requestId: req.id,
        priority: 'urgent',
        changes: changes
      });
    }
  });

  saveState(state);
  return req;
}

const REOPEN_WINDOW_HOURS = 24;

/**
 * Закрыть приём ответов.
 * reasonId обязателен; для 'expert_selected' обязателен selectedAnswerId (активный ответ этой заявки).
 * Уведомления получают только эксперты, которые откликнулись (каждый - свой результат),
 * и те, кто держал заявку в избранном.
 */
function closeAcceptance(requestId, reasonId, reasonNote, selectedAnswerId) {
  const state = loadState();
  const req = state.requests.find(r => r.id === requestId);
  if (!req || req.lawyerId !== state.currentUser.id) return { error: 'Нет доступа' };
  if (req.status === 'closed') return { error: 'Приём уже закрыт' };
  if (!reasonId || !CLOSE_REASONS.some(r => r.id === reasonId)) return { error: 'Выберите причину закрытия' };
  let selected = null;
  if (reasonId === 'expert_selected') {
    selected = req.answers.find(a => a.id === selectedAnswerId && !a.withdrawn);
    if (!selected) return { error: 'Выберите, какой эксперт выбран' };
  }
  if (reasonId === 'other' && !String(reasonNote || '').trim()) return { error: 'Укажите причину' };

  req.status = 'closed';
  req.closedAt = new Date().toISOString();
  req.closeReason = reasonId;
  req.closeReasonNote = reasonNote || '';
  req.selectedAnswerId = selected ? selected.id : null;

  const reasonLabel = closeReasonLabel(reasonId);
  const notified = new Set();
  req.answers.filter(a => !a.withdrawn).forEach(a => {
    notified.add(a.organizationId);
    const isWinner = selected && a.id === selected.id;
    pushNotification(state, {
      type: isWinner ? 'answer_selected' : 'request_closed',
      title: isWinner ? 'Вас выбрали' : (selected ? 'Выбран другой исполнитель' : 'Приём ответов закрыт'),
      body: 'Заявка ' + req.caseNumber + ': ' + (isWinner
        ? 'юрист выбрал ваше предложение.'
        : (selected ? 'юрист выбрал другое предложение.' : 'приём ответов завершён (' + reasonLabel + ').')),
      forRole: 'expert',
      forUserId: a.organizationId,
      requestId: req.id,
      priority: 'urgent'
    });
  });
  Object.values(state.users).forEach(u => {
    if (u.role !== 'expert' || notified.has(u.id) || !(u.favorites || []).includes(req.id)) return;
    pushNotification(state, {
      type: 'request_closed',
      title: 'Приём ответов закрыт',
      body: 'Заявка ' + req.caseNumber + ' из избранного больше не принимает ответы.',
      forRole: 'expert',
      forUserId: u.id,
      requestId: req.id,
      priority: 'info'
    });
  });

  saveState(state);
  return { request: req };
}

/** Можно ли возобновить приём: в течение REOPEN_WINDOW_HOURS после закрытия */
function canReopenAcceptance(req) {
  if (!req || req.status !== 'closed' || !req.closedAt) return false;
  return (Date.now() - new Date(req.closedAt).getTime()) <= REOPEN_WINDOW_HOURS * 3600000;
}

/** Возобновить приём. Если срок уже прошёл - нужна новая дата newAcceptUntil. */
function reopenAcceptance(requestId, newAcceptUntil) {
  const state = loadState();
  const req = state.requests.find(r => r.id === requestId);
  if (!req || req.lawyerId !== state.currentUser.id) return { error: 'Нет доступа' };
  if (!canReopenAcceptance(req)) return { error: 'Возобновить можно в течение ' + REOPEN_WINDOW_HOURS + ' ч после закрытия' };
  const until = newAcceptUntil || req.acceptUntil;
  if (!until || until < todayStr()) return { error: 'Срок приёма истёк - укажите новую дату', needDate: true };
  if (req.hearingDate && until > req.hearingDate) return { error: 'Дата приёма не может быть позже даты суда', needDate: true };
  req.status = 'accepting';
  req.acceptUntil = until;
  req.closedAt = null;
  req.closeReason = null;
  req.closeReasonNote = '';
  req.selectedAnswerId = null;
  req.answers.filter(a => !a.withdrawn).forEach(a => pushNotification(state, {
    type: 'request_reopened',
    title: 'Приём ответов возобновлён',
    body: 'Заявка ' + req.caseNumber + ' снова принимает ответы до ' + formatDate(until) + '.',
    forRole: 'expert',
    forUserId: a.organizationId,
    requestId: req.id,
    priority: 'urgent'
  }));
  saveState(state);
  return { request: req };
}

/** Шорт-лист юриста (виден только юристу) */
function toggleShortlist(requestId, answerId) {
  const state = loadState();
  const req = state.requests.find(r => r.id === requestId);
  if (!req || req.lawyerId !== state.currentUser.id) return null;
  const a = req.answers.find(x => x.id === answerId);
  if (!a) return null;
  a.shortlisted = !a.shortlisted;
  saveState(state);
  return a.shortlisted;
}

/** Результат для эксперта по его ответу */
function getAnswerOutcome(req, answer) {
  if (!req || !answer) return 'pending';
  if (answer.withdrawn) return 'withdrawn';
  if (req.status === 'closed') {
    if (req.selectedAnswerId) return req.selectedAnswerId === answer.id ? 'selected' : 'not_selected';
    return 'closed_no_choice';
  }
  if (effectiveStatus(req) === 'expired') return 'awaiting_decision';
  return 'pending';
}
const OUTCOME_LABELS = {
  pending: 'Приём ответов идёт',
  awaiting_decision: 'Юрист выбирает',
  selected: 'Вас выбрали',
  not_selected: 'Выбран другой исполнитель',
  closed_no_choice: 'Закрыта без выбора',
  withdrawn: 'Отозван'
};
function outcomeBadge(outcome) {
  const cls = {
    pending: 'badge-waiting', awaiting_decision: 'badge-expired', selected: 'badge-selected',
    not_selected: 'badge-rejected', closed_no_choice: 'badge-closed', withdrawn: 'badge-withdrawn'
  }[outcome] || 'badge-waiting';
  return '<span class="badge ' + cls + '">' + esc(OUTCOME_LABELS[outcome] || outcome) + '</span>';
}

function countActiveAnswers(req) {
  return (req && req.answers || []).filter(a => !a.withdrawn).length;
}

function markAnswersViewed(requestId) {
  const state = loadState();
  const req = state.requests.find(r => r.id === requestId);
  if (!req || req.lawyerId !== state.currentUser.id) return;
  let changed = false;
  req.answers.forEach(a => {
    if (!a.withdrawn && a.status === 'sent') {
      a.status = 'viewed';
      a.viewedAt = new Date().toISOString();
      changed = true;
    }
  });
  if (changed) saveState(state);
}

/** ID ответов, которые юрист ещё не видел (вызывать ДО markAnswersViewed, чтобы показать метку «Новый») */
function getUnseenAnswerIds(req) {
  return (req && req.answers || []).filter(a => !a.withdrawn && a.status === 'sent').map(a => a.id);
}

/** Active (non-withdrawn) answers for lawyer view */
function getActiveAnswers(req) {
  return (req.answers || []).filter(a => !a.withdrawn);
}

// ---------- Expert ----------
function getOpenRequestsForExpert() {
  const state = loadState();
  const user = state.currentUser;
  const hidden = user.hidden || [];
  return state.requests
    .filter(r => isAccepting(r) && !hidden.includes(r.id))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function getMyAnswers(expertId, includeWithdrawn) {
  const state = loadState();
  const result = [];
  state.requests.forEach(req => {
    req.answers.forEach(ans => {
      if (ans.organizationId === expertId && (includeWithdrawn || !ans.withdrawn)) {
        result.push({ request: req, answer: ans });
      }
    });
  });
  result.sort((a, b) => new Date(b.answer.submittedAt) - new Date(a.answer.submittedAt));
  return result;
}

function hasActiveAnswer(requestId, expertId) {
  const req = getRequest(requestId);
  if (!req) return false;
  return req.answers.some(a => a.organizationId === expertId && !a.withdrawn);
}

/** Can edit answer only if lawyer changed the request after this answer was submitted */
function canEditAnswer(request, answer) {
  if (!request || !answer || answer.withdrawn) return false;
  if (!isAccepting(request)) return false;
  if (!request.lastEditedAt) return false;
  return new Date(request.lastEditedAt) > new Date(answer.submittedAt);
}

function submitAnswer(requestId, data) {
  const state = loadState();
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return { error: 'Заявка не найдена' };
  const st = effectiveStatus(req);
  if (st === 'closed') return { error: 'Приём ответов по заявке закрыт' };
  if (st === 'expired') return { error: 'Срок приёма ответов истёк' };

  // Already has active answer?
  const existing = req.answers.find(a => a.organizationId === state.currentUser.id && !a.withdrawn);
  if (existing) return { error: 'Вы уже отправили ответ по этой заявке' };
  const errs = validateAnswerData(data);
  if (errs.length) return { error: errs[0].message, errors: errs };

  const answer = {
    id: uid('ans'),
    organizationId: state.currentUser.id,
    organizationName: state.currentUser.orgName || state.currentUser.name,
    expertName: data.expertName,
    price: Number(data.price),
    termDays: Number(data.termDays),
    additionalInfo: data.additionalInfo || '',
    fileName: data.fileName,
    fileSize: data.fileSize || 0,
    submittedAt: new Date().toISOString(),
    status: 'sent',
    withdrawn: false,
    versions: []
  };

  req.answers.push(answer);

  const u = state.users[state.currentUser.id];
  if (u && u.favorites) {
    u.favorites = u.favorites.filter(id => id !== requestId);
    syncUser(state);
  }

  pushNotification(state, {
    type: 'new_answer',
    title: 'Новый ответ по заявке',
    body: `По заявке ${req.caseNumber} получен ответ от ${answer.organizationName}`,
    forRole: 'lawyer',
    forUserId: req.lawyerId,
    requestId: req.id
  });

  saveState(state);
  return answer;
}

function updateAnswer(requestId, answerId, data) {
  const state = loadState();
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return { error: 'Заявка не найдена' };
  if (!isAccepting(req)) return { error: effectiveStatus(req) === 'expired' ? 'Срок приёма ответов истёк' : 'Приём ответов закрыт' };
  const ans = req.answers.find(a => a.id === answerId);
  if (!ans || ans.organizationId !== state.currentUser.id || ans.withdrawn) return { error: 'Ответ не найден' };

  // Only allowed if request was edited after answer
  if (!canEditAnswer(req, ans)) return { error: 'Изменить ответ можно только после изменения заявки юристом' };
  const errs = validateAnswerData(Object.assign({ fileName: data.fileName || ans.fileName }, data));
  if (errs.length) return { error: errs[0].message, errors: errs };

  ans.versions = ans.versions || [];
  ans.versions.push({
    expertName: ans.expertName,
    price: ans.price,
    termDays: ans.termDays,
    additionalInfo: ans.additionalInfo,
    fileName: ans.fileName,
    submittedAt: ans.submittedAt,
    savedAt: new Date().toISOString()
  });

  ans.expertName = data.expertName;
  ans.price = Number(data.price);
  ans.termDays = Number(data.termDays);
  ans.additionalInfo = data.additionalInfo || '';
  if (data.fileName) ans.fileName = data.fileName;
  ans.submittedAt = new Date().toISOString();
  ans.status = 'sent';

  pushNotification(state, {
    type: 'answer_updated',
    title: 'Ответ обновлён',
    body: `По заявке ${req.caseNumber} эксперт обновил предложение`,
    forRole: 'lawyer',
    forUserId: req.lawyerId,
    requestId: req.id
  });

  saveState(state);
  return ans;
}

function withdrawAnswer(requestId, answerId) {
  const state = loadState();
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return false;
  // После окончания приёма (закрыта или срок истёк) отзыв невозможен - юрист уже выбирает среди ответов
  if (!isAccepting(req)) return false;
  const ans = req.answers.find(a => a.id === answerId);
  if (!ans || ans.organizationId !== state.currentUser.id || ans.withdrawn) return false;

  ans.withdrawn = true;
  ans.withdrawnAt = new Date().toISOString();

  pushNotification(state, {
    type: 'answer_withdrawn',
    title: 'Ответ отозван',
    body: `Эксперт отозвал предложение по заявке ${req.caseNumber}`,
    forRole: 'lawyer',
    forUserId: req.lawyerId,
    requestId: req.id
  });

  saveState(state);
  return true;
}

// ---------- Favorites & Hide ----------
function toggleFavorite(requestId) {
  const state = loadState();
  if (!state.currentUser || !state.currentUser.id) return false;
  const u = state.users[state.currentUser.id];
  if (!u || u.role !== 'expert') return false;
  if (!Array.isArray(u.favorites)) u.favorites = [];
  const idx = u.favorites.indexOf(requestId);
  if (idx >= 0) {
    u.favorites.splice(idx, 1);
  } else {
    if (hasActiveAnswer(requestId, u.id)) {
      toast('Заявка уже в «Мои ответы» - избранное недоступно', 'error');
      return false;
    }
    u.favorites.push(requestId);
  }
  state.users[state.currentUser.id] = u;
  syncUser(state);
  saveState(state);
  return u.favorites.includes(requestId);
}

function isFavorite(requestId) {
  const state = loadState();
  const u = state.users[state.currentUser.id];
  return u && (u.favorites || []).includes(requestId);
}

function hideRequest(requestId) {
  const state = loadState();
  const u = state.users[state.currentUser.id];
  if (!u || u.role !== 'expert') return;
  u.hidden = u.hidden || [];
  if (!u.hidden.includes(requestId)) u.hidden.push(requestId);
  syncUser(state);
  saveState(state);
}

function unhideRequest(requestId) {
  const state = loadState();
  const u = state.users[state.currentUser.id];
  if (!u) return;
  u.hidden = (u.hidden || []).filter(id => id !== requestId);
  syncUser(state);
  saveState(state);
}

function getFavorites() {
  const state = loadState();
  if (!state.currentUser || !state.currentUser.id) return [];
  const u = state.users[state.currentUser.id];
  if (!u) return [];
  let favIds = Array.isArray(u.favorites) ? u.favorites.slice() : [];
  // Убрать из избранного только заявки с активным ответом
  const cleaned = favIds.filter(id => !hasActiveAnswer(id, u.id));
  if (cleaned.length !== favIds.length) {
    u.favorites = cleaned;
    state.users[state.currentUser.id] = u;
    syncUser(state);
    saveState(state);
    favIds = cleaned;
  }
  return state.requests
    .filter(r => favIds.includes(r.id))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function getHiddenRequests() {
  const state = loadState();
  const u = state.users[state.currentUser.id];
  const hiddenIds = u.hidden || [];
  return state.requests.filter(r => hiddenIds.includes(r.id));
}

// ---------- Notifications & Settings ----------
function pushNotification(state, n) {
  state.notifications = state.notifications || [];
  state.notifications.unshift({
    id: uid('ntf'),
    createdAt: new Date().toISOString(),
    read: false,
    ...n
  });
}

function getNotificationsForUser() {
  const state = loadState();
  const user = state.currentUser;
  if (!user) return [];
  return (state.notifications || []).filter(n => {
    if (n.forUserId && n.forUserId !== user.id) return false;
    if (n.forRole && n.forRole !== user.role) return false;
    return true;
  }).map(n => Object.assign({}, n, {
    // «прочитано» хранится отдельно для каждого получателя (рассылки на всех экспертов)
    read: n.forUserId ? !!n.read : !!(n.readBy && n.readBy[user.id])
  }));
}

function markNotificationsRead(ids) {
  const state = loadState();
  const user = state.currentUser;
  if (!user) return;
  const set = ids ? new Set(ids) : null;
  (state.notifications || []).forEach(n => {
    if (set && !set.has(n.id)) return;
    if (n.forUserId && n.forUserId !== user.id) return;
    if (n.forRole && n.forRole !== user.role) return;
    if (n.forUserId) n.read = true;
    else { n.readBy = n.readBy || {}; n.readBy[user.id] = new Date().toISOString(); }
  });
  saveState(state);
}

/**
 * Напоминания о сроках (генерируются при открытии кабинета, без дублей - по ключу).
 * Юрист: завтра/сегодня заканчивается приём; срок истёк - выберите эксперта; заседание через N дней.
 * Эксперт: заявка из избранного закрывается завтра/сегодня; заседание по делу, где он ответил.
 */
function generateReminders() {
  const state = loadState();
  const user = state.currentUser;
  if (!user) return;
  const u = state.users[user.id] || user;
  const ns = u.notifSettings || {};
  const ev = ns.events || {};
  const courtDays = Array.isArray(ns.courtDays) ? ns.courtDays : [7, 3, 0];
  const existing = new Set((state.notifications || []).filter(n => n.key).map(n => n.key));
  let added = 0;
  function add(key, n) {
    if (existing.has(key)) return;
    existing.add(key);
    pushNotification(state, Object.assign({ key, forRole: user.role, forUserId: user.id }, n));
    added++;
  }
  const today = todayStr();
  state.requests.forEach(req => {
    const st = effectiveStatus(req);
    const dLeft = daysUntilDate(req.acceptUntil);
    const dHear = req.hearingDate ? daysUntilDate(req.hearingDate) : null;
    if (user.role === 'lawyer') {
      if (req.lawyerId !== user.id) return;
      if (st === 'accepting' && (dLeft === 0 || dLeft === 1)) {
        add('deadline:' + req.id + ':' + req.acceptUntil + ':' + dLeft, {
          type: 'deadline_soon', priority: 'urgent', requestId: req.id,
          title: dLeft === 0 ? 'Приём ответов заканчивается сегодня' : 'Приём ответов заканчивается завтра',
          body: 'Заявка ' + req.caseNumber + ': получено ответов - ' + countActiveAnswers(req) + '.'
        });
      }
      if (st === 'expired') {
        add('expired:' + req.id + ':' + req.acceptUntil, {
          type: 'choose_expert', priority: 'urgent', requestId: req.id,
          title: 'Срок приёма истёк - выберите эксперта',
          body: 'Заявка ' + req.caseNumber + ': ответов - ' + countActiveAnswers(req) + '. Выберите эксперта или закройте приём.'
        });
      }
      if (ev.courtReminder !== false && req.status !== 'closed' && dHear != null && courtDays.includes(dHear)) {
        add('court:' + req.id + ':' + req.hearingDate + ':' + dHear, {
          type: 'court_reminder', priority: dHear <= 3 ? 'urgent' : 'info', requestId: req.id,
          title: dHear === 0 ? 'Заседание сегодня' : 'Заседание через ' + dHear + ' дн.',
          body: 'Дело ' + req.caseNumber + ', ' + req.court + (req.hearingTime ? ', ' + req.hearingTime : '') + '.'
        });
      }
    } else if (user.role === 'expert') {
      const fav = (u.favorites || []).includes(req.id);
      const answered = req.answers.some(a => a.organizationId === user.id && !a.withdrawn);
      if (fav && !answered && st === 'accepting' && (dLeft === 0 || dLeft === 1)) {
        add('fav-deadline:' + req.id + ':' + req.acceptUntil + ':' + dLeft, {
          type: 'deadline_soon', priority: 'urgent', requestId: req.id,
          title: dLeft === 0 ? 'Сегодня последний день приёма' : 'Завтра заканчивается приём',
          body: 'Заявка ' + req.caseNumber + ' из избранного - вы ещё не ответили.'
        });
      }
      if (answered && ev.courtReminder !== false && dHear != null && courtDays.includes(dHear) && req.status !== 'closed') {
        add('court:' + req.id + ':' + req.hearingDate + ':' + dHear, {
          type: 'court_reminder', priority: 'info', requestId: req.id,
          title: dHear === 0 ? 'Заседание сегодня' : 'Заседание через ' + dHear + ' дн.',
          body: 'Дело ' + req.caseNumber + ' - вы отправили предложение.'
        });
      }
    }
  });
  if (added) saveState(state);
  return added;
}

/** Колокольчик уведомлений в .topbar-actions (общий для обеих ролей) */
function mountNotificationBell() {
  const bar = document.querySelector('.topbar-actions');
  if (!bar || document.getElementById('notifBell')) return;
  try { generateReminders(); } catch (e) {}
  const wrap = document.createElement('div');
  wrap.className = 'notif-wrap';
  wrap.innerHTML =
    '<button type="button" class="notif-bell" id="notifBell" aria-haspopup="true" aria-expanded="false" aria-controls="notifPanel" aria-label="Уведомления">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
      '<span class="notif-count" id="notifCount" hidden></span>' +
    '</button>' +
    '<div class="notif-panel" id="notifPanel" role="region" aria-label="Уведомления" hidden></div>';
  bar.insertBefore(wrap, bar.firstChild);
  const btn = wrap.querySelector('#notifBell');
  const panel = wrap.querySelector('#notifPanel');
  const role = (loadState().currentUser || {}).role;

  function render() {
    const list = getNotificationsForUser().slice(0, 30);
    const unread = list.filter(n => !n.read).length;
    const cnt = wrap.querySelector('#notifCount');
    cnt.hidden = !unread;
    cnt.textContent = unread > 9 ? '9+' : String(unread);
    btn.setAttribute('aria-label', 'Уведомления' + (unread ? ', непрочитанных: ' + unread : ''));
    panel.innerHTML =
      '<div class="notif-head"><strong>Уведомления</strong>' +
        (unread ? '<button type="button" class="notif-readall">Прочитать все</button>' : '') + '</div>' +
      (list.length ? '<ul class="notif-list">' + list.map(n =>
        '<li class="notif-item' + (n.read ? '' : ' unread') + (n.priority === 'urgent' ? ' urgent' : '') + '">' +
          '<a href="' + (n.requestId ? 'request.html?id=' + encodeURIComponent(n.requestId) : '#') + '" data-id="' + esc(n.id) + '">' +
            '<span class="notif-title">' + esc(n.title) + '</span>' +
            '<span class="notif-body">' + esc(n.body) + '</span>' +
            '<span class="notif-time">' + esc(formatDateTime(n.createdAt)) + '</span>' +
          '</a></li>').join('') + '</ul>'
        : '<div class="notif-empty">Пока нет уведомлений</div>');
  }
  function setOpen(open) {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) render();
  }
  btn.addEventListener('click', e => { e.stopPropagation(); setOpen(panel.hidden); });
  panel.addEventListener('click', e => {
    e.stopPropagation();
    if (e.target.closest('.notif-readall')) { markNotificationsRead(); render(); return; }
    const a = e.target.closest('a[data-id]');
    if (a) markNotificationsRead([a.dataset.id]);
  });
  document.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); } });
  render();
}

function saveNotifSettings(settings) {
  const state = loadState();
  const u = state.users[state.currentUser.id];
  if (!u) return;
  u.notifSettings = { ...(u.notifSettings || {}), ...settings };
  if (settings.events) {
    u.notifSettings.events = { ...(u.notifSettings.events || {}), ...settings.events };
  }
  syncUser(state);
  saveState(state);
}

function connectTelegram(telegramId) {
  const state = loadState();
  const u = state.users[state.currentUser.id];
  if (!u) return;
  u.notifSettings = u.notifSettings || {};
  u.notifSettings.telegramConnected = true;
  u.notifSettings.telegram = true;
  u.notifSettings.telegramId = telegramId || '@user';
  syncUser(state);
  saveState(state);
}

function disconnectTelegram() {
  const state = loadState();
  const u = state.users[state.currentUser.id];
  if (!u) return;
  u.notifSettings = u.notifSettings || {};
  u.notifSettings.telegramConnected = false;
  u.notifSettings.telegram = false;
  u.notifSettings.telegramId = '';
  syncUser(state);
  saveState(state);
}

// ---------- Status helpers ----------

function computeRequestDiff(before, after) {
  const changes = [];
  if (!before || !after) return changes;
  if (before.caseNumber !== after.caseNumber)
    changes.push({ field: 'caseNumber', label: 'изменён номер дела', before: before.caseNumber, after: after.caseNumber });
  if (before.court !== after.court)
    changes.push({ field: 'court', label: 'изменён суд', before: before.court, after: after.court });
  if (before.expertiseType !== after.expertiseType)
    changes.push({ field: 'expertiseType', label: 'изменён вид экспертизы', before: before.expertiseType, after: after.expertiseType });
  if (before.acceptUntil !== after.acceptUntil)
    changes.push({ field: 'acceptUntil', label: 'изменён срок приёма ответов', before: formatDate(before.acceptUntil), after: formatDate(after.acceptUntil) });
  if (before.hearingDate !== after.hearingDate || before.hearingTime !== after.hearingTime)
    changes.push({ field: 'hearing', label: 'изменена дата суда', before: formatHearing(before.hearingDate, before.hearingTime), after: formatHearing(after.hearingDate, after.hearingTime) });
  if ((before.additionalInfo || '') !== (after.additionalInfo || ''))
    changes.push({ field: 'additionalInfo', label: 'изменена доп. информация', before: before.additionalInfo || '-', after: after.additionalInfo || '-' });
  const bAtt = (before.attachments || []).join(', ') || 'нет';
  const aAtt = (after.attachments || []).join(', ') || 'нет';
  if (bAtt !== aAtt)
    changes.push({ field: 'attachments', label: 'изменены вложения', before: (before.attachments || []).length + ' файл(ов)', after: (after.attachments || []).length + ' файл(ов)' });
  const bQ = before.questions || [];
  const aQ = after.questions || [];
  if (JSON.stringify(bQ) !== JSON.stringify(aQ)) {
    if (bQ.length !== aQ.length) {
      changes.push({ field: 'questions', label: 'изменено число вопросов', before: String(bQ.length), after: String(aQ.length) });
    }
    const max = Math.max(bQ.length, aQ.length);
    for (let i = 0; i < max; i++) {
      if ((bQ[i] || '') !== (aQ[i] || '')) {
        changes.push({
          field: 'question_' + (i + 1),
          label: (bQ[i] && aQ[i]) ? ('изменён вопрос №' + (i + 1)) : (aQ[i] ? ('добавлен вопрос №' + (i + 1)) : ('удалён вопрос №' + (i + 1))),
          before: bQ[i] || '-',
          after: aQ[i] || '-'
        });
      }
    }
  }
  return changes;
}

/** Diff of last edit vs current (for expert UI) */
function getRequestChangeDiff(req) {
  if (!req || !req.editHistory || !req.editHistory.length) return [];
  const last = req.editHistory[req.editHistory.length - 1];
  const current = {
    caseNumber: req.caseNumber,
    court: req.court,
    expertiseType: req.expertiseType,
    hearingDate: req.hearingDate,
    hearingTime: req.hearingTime,
    acceptUntil: req.acceptUntil,
    additionalInfo: req.additionalInfo,
    attachments: req.attachments || [],
    questions: req.questions || []
  };
  return computeRequestDiff(last, current);
}

function validateRequestData(data) {
  const errors = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!data.caseNumber || !String(data.caseNumber).trim())
    errors.push({ field: 'caseNumber', message: 'Укажите номер дела' });
  if (!data.court || !String(data.court).trim())
    errors.push({ field: 'court', message: 'Укажите суд' });
  if (!data.acceptUntil)
    errors.push({ field: 'acceptUntil', message: 'Укажите срок приёма ответов' });
  else {
    const acc = new Date(data.acceptUntil + 'T12:00:00');
    acc.setHours(0, 0, 0, 0);
    if (acc < today)
      errors.push({ field: 'acceptUntil', message: 'Дата приёма предложений не может быть раньше сегодняшнего дня' });
    if (data.hearingDate && data.hearingDate < todayStr())
      errors.push({ field: 'hearingDate', message: 'Дата заседания уже прошла' });
    else if (data.hearingDate) {
      const hear = new Date(data.hearingDate + 'T12:00:00');
      hear.setHours(0, 0, 0, 0);
      if (acc > hear)
        errors.push({ field: 'acceptUntil', message: 'Дата приёма предложений не может быть позже даты суда' });
    }
  }
  if (data.additionalInfo && findForbiddenInText(data.additionalInfo).length)
    errors.push({ field: 'additionalInfo', message: CONTACTS_FORBIDDEN_MSG });
  const qs = (data.questions || []).map(q => String(q || '').trim()).filter(Boolean);
  if (qs.some(q => findForbiddenInText(q).length))
    errors.push({ field: 'questions', message: CONTACTS_FORBIDDEN_MSG });
  if (!qs.length)
    errors.push({ field: 'questions', message: 'Добавьте хотя бы один вопрос' });
  if (qs.length > 20)
    errors.push({ field: 'questions', message: 'Слишком много вопросов (максимум 20)' });
  const seen = new Set();
  qs.forEach((q, i) => {
    const key = q.toLowerCase();
    if (seen.has(key))
      errors.push({ field: 'questions', message: 'Дублирующийся вопрос: «' + q.slice(0, 60) + (q.length > 60 ? '…' : '') + '»' });
    seen.add(key);
  });
  (data.questions || []).forEach((q, i) => {
    if (q != null && String(q).trim() === '' && (data.questions || []).length > 1)
      errors.push({ field: 'questions', message: 'Вопрос №' + (i + 1) + ' пустой - заполните или удалите' });
  });
  return errors;
}

function validateAnswerData(data) {
  const errors = [];
  const price = Number(data.price);
  const term = Number(data.termDays);
  if (!data.expertName || !String(data.expertName).trim())
    errors.push({ field: 'expertName', message: 'Укажите ФИО эксперта' });
  if (!(price > 0))
    errors.push({ field: 'price', message: 'Стоимость должна быть больше нуля' });
  if (!(term > 0) || !Number.isInteger(term))
    errors.push({ field: 'termDays', message: 'Срок должен быть целым числом больше нуля' });
  if (term > 365)
    errors.push({ field: 'termDays', message: 'Срок слишком большой (максимум 365 дней)' });
  if (!data.fileName)
    errors.push({ field: 'file', message: 'Прикрепите информационное письмо в PDF' });
  else if (!/\.pdf$/i.test(data.fileName))
    errors.push({ field: 'file', message: 'Информационное письмо должно быть в формате PDF' });
  else if (findForbiddenInText(data.fileName.replace(/\.pdf$/i, '')).length)
    errors.push({ field: 'file', message: 'Имя файла не должно содержать контакты или ссылки' });
  if (data.additionalInfo && findForbiddenInText(data.additionalInfo).length)
    errors.push({ field: 'additionalInfo', message: CONTACTS_FORBIDDEN_MSG });
  return errors;
}

const PDF_MAX_MB = 20;
/** Проверка файла информационного письма (объект File из input). Возвращает текст ошибки или null. */
function validatePdfFile(file) {
  if (!file) return 'Прикрепите информационное письмо в PDF';
  const isPdfName = /\.pdf$/i.test(file.name || '');
  const isPdfType = !file.type || file.type === 'application/pdf';
  if (!isPdfName || !isPdfType) return 'Нужен файл PDF. Выбран: ' + (file.name || 'файл');
  if (file.size > PDF_MAX_MB * 1048576) return 'Файл больше ' + PDF_MAX_MB + ' МБ';
  if (file.size === 0) return 'Файл пустой';
  if (findForbiddenInText((file.name || '').replace(/\.pdf$/i, '')).length) return 'Имя файла не должно содержать контакты или ссылки';
  return null;
}

function closeReasonLabel(id) {
  const r = CLOSE_REASONS.find(x => x.id === id);
  return r ? r.label : (id || '-');
}

function appStatusLabel(status) {
  const map = {
    accepting: 'Приём предложений',
    expired: 'Срок истёк',
    closed: 'Закрыта'
  };
  return map[status] || status;
}

/** Принимает объект заявки (рекомендуется - учитывает истёкший срок) или строку статуса */
function appStatusBadge(reqOrStatus) {
  const s = typeof reqOrStatus === 'object' ? effectiveStatus(reqOrStatus) : (reqOrStatus === 'closed' ? 'closed' : (reqOrStatus === 'expired' ? 'expired' : 'accepting'));
  const cls = { accepting: 'badge-waiting', expired: 'badge-expired', closed: 'badge-closed' }[s];
  return '<span class="badge ' + cls + '">' + appStatusLabel(s) + '</span>';
}

function answerStatusLabel(status) {
  return status === 'viewed' ? 'Просмотрено' : 'Отправлено';
}

function answerStatusBadge(status) {
  const cls = status === 'viewed' ? 'badge-viewed' : 'badge-sent';
  return '<span class="badge ' + cls + '">' + answerStatusLabel(status) + '</span>';
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatHearing(date, time) {
  if (!date) return '-';
  return time ? `${formatDate(date)}, ${time}` : formatDate(date);
}

function daysLeft(acceptUntil) {
  if (!acceptUntil) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(acceptUntil.length === 10 ? acceptUntil + 'T12:00:00' : acceptUntil);
  end.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end - today) / 86400000);
  if (diff < 0) return 'срок истёк';
  if (diff === 0) return 'сегодня';
  return diff + ' дн.';
}

function formatPrice(n) {
  return new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
}

function answersCountBadge(count) {
  const n = Number(count) || 0;
  if (n === 0) return '<span class="answers-badge" style="background:#94A3B8">0</span>';
  const wide = n >= 10 ? ' wide' : '';
  return '<span class="answers-badge' + wide + '">' + n + '</span>';
}

/** toast(msg, type, { actionLabel, onAction, duration }) - опционально с кнопкой действия (например «Отменить») */
function toast(msg, type = 'info', opts) {
  opts = opts || {};
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  if (opts.actionLabel && typeof opts.onAction === 'function') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = opts.actionLabel;
    b.addEventListener('click', () => { el.classList.remove('show'); opts.onAction(); });
    el.appendChild(b);
  }
  el.className = 'toast toast-' + type + ' show';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), opts.duration || (opts.actionLabel ? 6000 : 3200));
}


// ---------- Chat (thread per request + expert org) ----------
const CHAT_MAX_TEXT = 4000;
const CHAT_EDIT_WINDOW_MS = 5 * 60 * 1000;
const CHAT_MAX_FILES = 5;
const CHAT_MAX_FILE_MB = 20;

const CONTACTS_FORBIDDEN_MSG = 'Контакты и ссылки передавать нельзя - общение только на платформе. Уберите выделенный фрагмент.';

/*
 * Фильтр контактов. Задача - сделать обход неудобным и заметным (полностью исключить нельзя).
 * Ловим: ссылки и домены (в т.ч. без http и кириллические), мессенджеры, @ник, email (в т.ч. «[at]», «собака»),
 * телефоны с любыми разделителями, телефон словами («восемь девять один…»).
 * Не ловим: суммы с «руб/₽», номера дел, ИНН/ОГРН/КПП/БИК, расчётные счета (20 цифр).
 */
const _TLD = '(?:ru|рф|su|com|net|org|info|biz|pro|me|io|co|online|site|store|shop|expert|moscow|москва|рус|tech|app|dev|xyz|club|ua|by|kz|uz|am|ge|de|eu|us|uk|tv|cc|ws|to|ly|gl|gg)';
const _FORBID_PATTERNS = [
  // явные ссылки
  /\b(?:https?:\/\/|www\.)\S+/gi,
  // домены без схемы: expert.ru, t.me/ivan, эксперт.рф, vk.com/id1
  new RegExp('(?<![\\p{L}\\p{N}@._-])[\\p{L}\\p{N}][\\p{L}\\p{N}-]*(?:\\.[\\p{L}\\p{N}-]+)*\\.' + _TLD + '(?![\\p{L}\\p{N}])(?:\\/\\S*)?', 'giu'),
  // «точка ру», «dot com»
  /[\p{L}\p{N}_-]{2,}\s*(?:\(|\[)?\s*(?:точка|dot)\s*(?:\)|\])?\s*(?:ру|рф|ком|ru|com|net|org)(?![\p{L}])/giu,
  // email, в т.ч. кириллический и обфусцированный
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu,
  /[\p{L}\p{N}._%+-]{2,}\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}|\s(?:at|собака|собачка)\s)\s*[\p{L}\p{N}.-]{2,}(?:\s*(?:\.|точка|dot)\s*[\p{L}]{2,})?/giu,
  // @ник (telegram/instagram)
  /(?<![\p{L}\p{N}._-])@[a-z0-9_]{3,}/gi,
  // мессенджеры и соцсети
  /(?<![\p{L}])(?:телеграм\p{L}*|телега|телеге|телегу|тг|tg|telegram|whats\s?app|вотсап\p{L}*|ватсап\p{L}*|вацап\p{L}*|viber|вайбер\p{L}*|skype|скайп\p{L}*|signal|сигнал[еу]?|вконтакте|вк|vk|instagram|инстаграм\p{L}*|инст[уа]?|max\s?мессенджер|мессенджер\p{L}*)(?![\p{L}])/giu
];

const _NUM_WORDS = 'ноль|нуль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать|шестнадцать|семнадцать|восемнадцать|девятнадцать|двадцать|тридцать|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяносто|сто|двести|триста|четыреста|пятьсот|шестьсот|семьсот|восемьсот|девятьсот|плюс';
const _PHONE_WORDS_RE = new RegExp('(?<![\\p{L}])(?:(?:' + _NUM_WORDS + ')[\\s,.-]+){6,}(?:' + _NUM_WORDS + ')(?![\\p{L}])', 'giu');

function _findPhones(text) {
  const out = [];
  // последовательности цифр с разделителями: пробел, дефис, скобки, точка, «+»
  const re = /\+?\d[\d\s().\-]{5,}\d/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, '');
    const n = digits.length;
    const looksPhone =
      (n === 11 && /^[78]9/.test(digits)) ||          // 8 916 …, +7 916 …
      (n === 11 && /^[78][3-8]\d{2}/.test(digits) && /[\s()\-+]/.test(raw)) || // городские 8 (495) …
      (n === 10 && /^9/.test(digits)) ||               // 916 123-45-67
      (n === 7 && /^\d{3}[\s-]\d{2}[\s-]\d{2}$/.test(raw.trim())); // 123-45-67
    if (!looksPhone) continue;
    const before = text.slice(Math.max(0, m.index - 14), m.index).toLowerCase();
    const after = text.slice(m.index + raw.length, m.index + raw.length + 8).toLowerCase();
    if (/^\s*(?:руб|р\.|₽|rub|коп|тыс|млн|млрд)/.test(after)) continue;       // сумма
    if (/(?:инн|огрн|огрнип|кпп|бик|р\/с|к\/с|сч[её]т|№|дело|дела|а\d{2}-)\s*[:№]?\s*$/.test(before)) continue; // реквизиты, номер дела
    out.push({ index: m.index, length: raw.length, value: raw });
  }
  return out;
}

function findForbiddenInText(text) {
  if (!text) return [];
  const t = String(text);
  let matches = [];
  _FORBID_PATTERNS.forEach(re => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      if (!m[0]) { re.lastIndex++; continue; }
      matches.push({ index: m.index, length: m[0].length, value: m[0] });
    }
  });
  _PHONE_WORDS_RE.lastIndex = 0;
  let w;
  while ((w = _PHONE_WORDS_RE.exec(t)) !== null) matches.push({ index: w.index, length: w[0].length, value: w[0] });
  matches = matches.concat(_findPhones(t));
  // убрать пересечения, оставить самые длинные
  matches.sort((a, b) => a.index - b.index || b.length - a.length);
  const merged = [];
  matches.forEach(m => {
    const last = merged[merged.length - 1];
    if (last && m.index < last.index + last.length) {
      const end = Math.max(last.index + last.length, m.index + m.length);
      last.length = end - last.index;
      last.value = t.slice(last.index, end);
    } else merged.push(Object.assign({}, m));
  });
  return merged;
}

function validateChatText(text) {
  const errors = [];
  const t = (text || '').trim();
  if (t.length > CHAT_MAX_TEXT) errors.push('Максимум ' + CHAT_MAX_TEXT + ' символов');
  const bad = findForbiddenInText(t);
  if (bad.length) errors.push(CONTACTS_FORBIDDEN_MSG);
  return { ok: errors.length === 0, errors, forbidden: bad };
}

function getThread(threadId) {
  const state = loadState();
  return (state.threads || []).find(th => th.id === threadId) || null;
}

function getThreadsForRequest(requestId) {
  const state = loadState();
  return (state.threads || []).filter(th => th.requestId === requestId)
    .sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt));
}

function getThreadForPair(requestId, organizationId) {
  const state = loadState();
  return (state.threads || []).find(th => th.requestId === requestId && th.organizationId === organizationId) || null;
}

/** Expert may open chat only after active answer; creates empty thread on first open if needed for UX - actually thread created on first message. */
function canExpertStartChat(requestId, organizationId) {
  return hasActiveAnswer(requestId, organizationId);
}

function isThreadWritable(thread, request) {
  if (!thread || !request) return false;
  if (request.status === 'closed') return false;
  return true;
}

function getOrCreateThread(requestId, organizationId) {
  const state = loadState();
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return { error: 'Заявка не найдена' };
  if (!hasActiveAnswer(requestId, organizationId)) {
    return { error: 'Чат доступен после отправки информационного письма' };
  }
  let th = (state.threads || []).find(t => t.requestId === requestId && t.organizationId === organizationId);
  if (!th) {
    const orgUser = state.users[organizationId];
    th = {
      id: uid('thr'),
      requestId,
      lawyerId: req.lawyerId,
      organizationId,
      organizationName: (orgUser && (orgUser.orgName || orgUser.name)) || organizationId,
      createdAt: new Date().toISOString(),
      lastMessageAt: null,
      messages: []
    };
    state.threads = state.threads || [];
    state.threads.push(th);
    saveState(state);
  }
  return { thread: th };
}

function sendChatMessage(threadId, { text, attachments, replyToMessageId }) {
  const state = loadState();
  const user = state.currentUser;
  if (!user) return { error: 'Нет авторизации' };
  const th = (state.threads || []).find(t => t.id === threadId);
  if (!th) return { error: 'Тред не найден' };
  const req = state.requests.find(r => r.id === th.requestId);
  if (!req) return { error: 'Заявка не найдена' };
  if (req.status === 'closed') return { error: 'Заявка закрыта - переписка только для чтения' };

  // Access: lawyer of request OR expert org of thread
  if (user.role === 'lawyer') {
    if (user.id !== th.lawyerId) return { error: 'Нет доступа' };
    // Lawyer cannot start: need at least one message from expert OR allow reply only if messages exist
    const hasExpertMsg = (th.messages || []).some(m => m.authorRole === 'expert' && !m.deleted);
    if (!hasExpertMsg) return { error: 'Дождитесь первого сообщения от эксперта' };
  } else if (user.role === 'expert') {
    if (user.id !== th.organizationId) return { error: 'Нет доступа' };
    if (!hasActiveAnswer(th.requestId, user.id)) return { error: 'Нужен активный отклик' };
  } else {
    return { error: 'Нет доступа' };
  }

  const body = (text || '').trim();
  const files = Array.isArray(attachments) ? attachments.slice(0, CHAT_MAX_FILES) : [];
  if (!body && !files.length) return { error: 'Введите текст или прикрепите файл' };
  if (body) {
    const v = validateChatText(body);
    if (!v.ok) return { error: v.errors[0], forbidden: v.forbidden };
  }
  for (const f of files) {
    if (f.sizeMb && f.sizeMb > CHAT_MAX_FILE_MB) {
      return { error: 'Файл «' + f.fileName + '» больше ' + CHAT_MAX_FILE_MB + ' МБ' };
    }
    if (findForbiddenInText(String(f.fileName || '').replace(/\.[a-z0-9]{2,5}$/i, '')).length) {
      return { error: 'Имя файла «' + f.fileName + '» содержит контакты или ссылку - переименуйте файл' };
    }
  }

  if (replyToMessageId) {
    const ref = (th.messages || []).find(m => m.id === replyToMessageId);
    if (!ref) return { error: 'Сообщение для ответа не найдено' };
  }

  const msg = {
    id: uid('msg'),
    authorId: user.id,
    authorRole: user.role,
    authorName: user.role === 'expert' ? (user.orgName || user.name) : user.name,
    text: body,
    createdAt: new Date().toISOString(),
    editedAt: null,
    originalText: null,
    replyToMessageId: replyToMessageId || null,
    attachments: files.map(f => ({
      id: uid('att'),
      fileName: f.fileName,
      size: f.size || 0,
      sizeMb: f.sizeMb || 0,
      mime: f.mime || ''
    })),
    status: 'sent',
    readBy: { [user.id]: new Date().toISOString() }
  };
  th.messages = th.messages || [];
  th.messages.push(msg);
  th.lastMessageAt = msg.createdAt;

  // Notify counterpart - first unread style handled by client; always push in-app
  const forUserId = user.role === 'expert' ? th.lawyerId : th.organizationId;
  const forRole = user.role === 'expert' ? 'lawyer' : 'expert';
  const alreadyUnread = (state.notifications || []).some(n =>
    n.type === 'chat_message' && n.threadId === th.id && n.forUserId === forUserId && !n.read
  );
  // email-like: only first unread notification per thread (still one in-app ntf if none unread)
  if (!alreadyUnread) {
    pushNotification(state, {
      type: 'chat_message',
      title: 'Новое сообщение по заявке',
      body: 'Сообщение по заявке ' + req.caseNumber,
      forRole,
      forUserId,
      requestId: req.id,
      threadId: th.id,
      messageId: msg.id,
      priority: 'urgent'
    });
  }

  saveState(state);
  return { message: msg, thread: th };
}

function editChatMessage(threadId, messageId, newText) {
  const state = loadState();
  const user = state.currentUser;
  if (!user) return { error: 'Нет авторизации' };
  const th = (state.threads || []).find(t => t.id === threadId);
  if (!th) return { error: 'Тред не найден' };
  const req = state.requests.find(r => r.id === th.requestId);
  if (!req || req.status === 'closed') return { error: 'Редактирование недоступно' };
  const msg = (th.messages || []).find(m => m.id === messageId);
  if (!msg) return { error: 'Сообщение не найдено' };
  if (msg.authorId !== user.id) return { error: 'Можно изменять только свои сообщения' };
  const age = Date.now() - new Date(msg.createdAt).getTime();
  if (age > CHAT_EDIT_WINDOW_MS) return { error: 'Редактирование доступно 5 минут после отправки' };
  const body = (newText || '').trim();
  if (!body && !(msg.attachments && msg.attachments.length)) return { error: 'Текст не может быть пустым' };
  if (body) {
    const v = validateChatText(body);
    if (!v.ok) return { error: v.errors[0], forbidden: v.forbidden };
  }
  if (msg.originalText == null) msg.originalText = msg.text;
  msg.text = body;
  msg.editedAt = new Date().toISOString();
  saveState(state);
  return { message: msg };
}

function markThreadRead(threadId) {
  const state = loadState();
  const user = state.currentUser;
  if (!user) return;
  const th = (state.threads || []).find(t => t.id === threadId);
  if (!th) return;
  let changed = false;
  (th.messages || []).forEach(m => {
    if (m.authorId === user.id) return;
    m.readBy = m.readBy || {};
    if (!m.readBy[user.id]) {
      m.readBy[user.id] = new Date().toISOString();
      m.status = 'read';
      changed = true;
    }
  });
  // mark related notifications read
  (state.notifications || []).forEach(n => {
    if (n.threadId === threadId && n.forUserId === user.id && !n.read) {
      n.read = true;
      changed = true;
    }
  });
  if (changed) saveState(state);
}

function countUnreadInThread(thread, userId) {
  if (!thread || !userId) return 0;
  return (thread.messages || []).filter(m => m.authorId !== userId && !(m.readBy && m.readBy[userId])).length;
}

function getUnreadChatCountForUser() {
  const state = loadState();
  const user = state.currentUser;
  if (!user) return 0;
  let n = 0;
  (state.threads || []).forEach(th => {
    if (user.role === 'lawyer' && th.lawyerId !== user.id) return;
    if (user.role === 'expert' && th.organizationId !== user.id) return;
    n += countUnreadInThread(th, user.id);
  });
  return n;
}

function getUnreadChatCountForRequest(requestId) {
  const state = loadState();
  const user = state.currentUser;
  if (!user) return 0;
  let n = 0;
  getThreadsForRequest(requestId).forEach(th => {
    if (user.role === 'lawyer' && th.lawyerId !== user.id) return;
    if (user.role === 'expert' && th.organizationId !== user.id) return;
    n += countUnreadInThread(th, user.id);
  });
  return n;
}

function formatFileSize(bytes, sizeMb) {
  if (sizeMb) return sizeMb + ' МБ';
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1048576).toFixed(1) + ' МБ';
}

function formatMsgTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const time = pad(d.getHours()) + ':' + pad(d.getMinutes());
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return time;
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + time;
}

function canEditMessageNow(msg, userId) {
  if (!msg || msg.authorId !== userId) return false;
  return (Date.now() - new Date(msg.createdAt).getTime()) <= CHAT_EDIT_WINDOW_MS;
}


function resetDemo() {
  try {
    Object.keys(localStorage).forEach(k => {
      if (k === STORAGE_KEY || k.startsWith('el_')) localStorage.removeItem(k);
    });
  } catch (e) {}
  location.reload();
}

// ---------- Компания и сотрудники (MVP) ----------
function uidEmp() {
  return 'emp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function getActiveUserRecord(state) {
  if (!state || !state.currentUser) return null;
  ensureOrgFields(state.currentUser);
  const u = state.users[state.currentUser.id];
  if (u) ensureOrgFields(u);
  return u || state.currentUser;
}

function syncCurrentUser(state, u) {
  if (!state || !u) return;
  state.users[u.id] = u;
  if (state.currentUser && state.currentUser.id === u.id) {
    state.currentUser = Object.assign({}, u);
  }
}

function getCompanyProfile(state) {
  const u = getActiveUserRecord(state);
  return u ? (u.company || emptyCompany(u.role)) : emptyCompany('lawyer');
}

function saveCompanyProfile(fields) {
  const state = loadState();
  const u = getActiveUserRecord(state);
  if (!u) return { error: 'Нет пользователя' };
  if (u.teamRole === 'employee') return { error: 'Только администратор может менять компанию' };
  const c = Object.assign({}, u.company || emptyCompany(u.role), fields || {});
  if (typeof c.solo === 'string') c.solo = c.solo === 'true' || c.solo === true;
  u.company = c;
  if (c.name) {
    if (u.role === 'expert') u.orgName = c.name;
  }
  syncCurrentUser(state, u);
  saveState(state);
  return { ok: true, company: c };
}

function listEmployees(state, opts) {
  const u = getActiveUserRecord(state || loadState());
  if (!u) return [];
  const all = Array.isArray(u.employees) ? u.employees.slice() : [];
  const includeDeleted = opts && opts.includeDeleted;
  if (includeDeleted) return all;
  // Удалённых не показываем в UI, но запись остаётся — действия на платформе не трогаем
  return all.filter(e => e && e.status !== 'deleted');
}

function addEmployee(payload) {
  const state = loadState();
  const u = getActiveUserRecord(state);
  if (!u) return { error: 'Нет пользователя' };
  if (u.teamRole === 'employee') return { error: 'Только администратор может добавлять сотрудников' };
  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  if (!name) return { error: 'Укажите ФИО' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Укажите корректный email' };
  const role = payload.role === 'admin' ? 'admin' : 'employee';
  const seeAll = role === 'admin' ? true : !!payload.seeAll;
  const method = payload.method === 'email' ? 'email' : 'manual';
  if (!Array.isArray(u.employees)) u.employees = [];
  // Не считаем удалённых — можно добавить снова того же email
  if (u.employees.some(e => e.status !== 'deleted' && (e.email || '').toLowerCase() === email)) {
    return { error: 'Сотрудник с таким email уже есть' };
  }
  const emp = {
    id: uidEmp(),
    name: name,
    email: email,
    role: role,
    seeAll: seeAll,
    method: method,
    status: method === 'email' ? 'invited' : 'active',
    inviteNote: method === 'email'
      ? 'Приглашение создано (имитация). Ссылка: #invite/' + email
      : 'Добавлен вручную',
    createdAt: new Date().toISOString(),
    deletedAt: null,
    blockedAt: null
  };
  u.employees.push(emp);
  syncCurrentUser(state, u);
  saveState(state);
  return { ok: true, employee: emp };
}

function updateEmployee(empId, patch) {
  const state = loadState();
  const u = getActiveUserRecord(state);
  if (!u) return { error: 'Нет пользователя' };
  if (u.teamRole === 'employee') return { error: 'Только администратор' };
  const emp = (u.employees || []).find(e => e.id === empId);
  if (!emp) return { error: 'Сотрудник не найден' };
  if (patch.name != null) emp.name = String(patch.name).trim();
  if (patch.email != null) emp.email = String(patch.email).trim().toLowerCase();
  if (patch.role === 'admin' || patch.role === 'employee') emp.role = patch.role;
  if (typeof patch.seeAll === 'boolean') emp.seeAll = emp.role === 'admin' ? true : patch.seeAll;
  if (emp.role === 'admin') emp.seeAll = true;
  if (patch.status === 'active' || patch.status === 'blocked' || patch.status === 'invited' || patch.status === 'deleted') {
    emp.status = patch.status;
  }
  syncCurrentUser(state, u);
  saveState(state);
  return { ok: true, employee: emp };
}

/** Мягкое удаление: запись остаётся, статус deleted. История действий на платформе не удаляется. */
function removeEmployee(empId) {
  const state = loadState();
  const u = getActiveUserRecord(state);
  if (!u) return { error: 'Нет пользователя' };
  if (u.teamRole === 'employee') return { error: 'Только администратор' };
  const emp = (u.employees || []).find(e => e.id === empId);
  if (!emp) return { error: 'Сотрудник не найден' };
  emp.status = 'deleted';
  emp.deletedAt = new Date().toISOString();
  syncCurrentUser(state, u);
  saveState(state);
  return { ok: true, employee: emp };
}

/** Блокировка / разблокировка без удаления истории */
function setEmployeeBlocked(empId, blocked) {
  const state = loadState();
  const u = getActiveUserRecord(state);
  if (!u) return { error: 'Нет пользователя' };
  if (u.teamRole === 'employee') return { error: 'Только администратор' };
  const emp = (u.employees || []).find(e => e.id === empId);
  if (!emp || emp.status === 'deleted') return { error: 'Сотрудник не найден' };
  if (blocked) {
    emp.status = 'blocked';
    emp.blockedAt = new Date().toISOString();
  } else {
    emp.status = emp.method === 'email' && !emp.activatedAt ? 'invited' : 'active';
    emp.blockedAt = null;
  }
  syncCurrentUser(state, u);
  saveState(state);
  return { ok: true, employee: emp };
}

function isOrgAdmin(user) {
  if (!user) return false;
  ensureOrgFields(user);
  return user.teamRole !== 'employee';
}
