/**
 * Shared chat panel renderer for request pages.
 * Depends on app.js chat API.
 */
(function (global) {
  function escapeHtml(s) {
    if (typeof global.esc === 'function') return global.esc(s == null ? '' : s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/`/g, '&#96;');
  }

  var DOWNLOAD_STUB_MSG = 'Демо: скачивание файла появится в рабочей версии';

  /** Название организации для случая без треда - никогда не показываем сырой id */
  function orgNameFor(request, orgId, fallback) {
    if (fallback) return fallback;
    var a = ((request && request.answers) || []).find(function (x) { return x.organizationId === orgId; });
    return (a && a.organizationName) || 'Эксперт';
  }

  function highlightForbidden(text) {
    const bad = findForbiddenInText(text || '');
    if (!bad.length) return escapeHtml(text);
    let out = '';
    let last = 0;
    bad.forEach(function (b) {
      out += escapeHtml(text.slice(last, b.index));
      out += '<mark class="chat-forbid">' + escapeHtml(text.slice(b.index, b.index + b.length)) + '</mark>';
      last = b.index + b.length;
    });
    out += escapeHtml(text.slice(last));
    return out;
  }

  function statusTicks(msg, meId) {
    if (msg.authorId !== meId) return '';
    const read = msg.status === 'read' || (msg.readBy && Object.keys(msg.readBy).some(function (k) { return k !== meId; }));
    if (read) {
      return '<span class="chat-ticks read" title="Прочитано">✓✓</span>';
    }
    return '<span class="chat-ticks" title="Отправлено">✓</span>';
  }

  function findReply(messages, id) {
    if (!id) return null;
    return (messages || []).find(function (m) { return m.id === id; }) || null;
  }

  /**
   * @param {object} opts
   * @param {HTMLElement} opts.mount
   * @param {object} opts.request
   * @param {string} opts.organizationId - for expert: self; for lawyer: selected org
   * @param {string} [opts.organizationName]
   * @param {boolean} [opts.showThreadSwitcher] - lawyer multi-thread
   */
  function mountChat(opts) {
    const mount = opts.mount;
    let request = opts.request;
    const user = loadState().currentUser;
    if (!mount || !request || !user) return;

    let orgId = opts.organizationId;
    let replyToId = null;
    let editingId = null;
    let firstRender = true;

    function writable() {
      return request.status !== 'closed';
    }

    function render() {
      // Всегда берём свежую заявку (статус мог измениться без перезагрузки страницы)
      const fresh = getRequest(request.id);
      if (fresh) request = fresh;
      const threads = getThreadsForRequest(request.id).filter(function (th) {
        // Юрист видит только треды, в которых эксперт уже написал (юрист не пишет первым)
        if (user.role === 'lawyer') return th.lawyerId === user.id && (th.messages || []).some(function (m) { return m.authorRole === 'expert'; });
        return th.organizationId === user.id;
      });

      if (user.role === 'expert') {
        orgId = user.id;
      }

      // Lawyer without selection: pick first with messages or first
      if (user.role === 'lawyer' && !orgId && threads.length) {
        orgId = threads[0].organizationId;
      }

      let thread = orgId ? getThreadForPair(request.id, orgId) : null;
      if (thread) markThreadRead(thread.id);
      thread = orgId ? getThreadForPair(request.id, orgId) : null;

      const canStart = user.role === 'expert' && hasActiveAnswer(request.id, user.id);
      const hasExpertMsg = thread && (thread.messages || []).some(function (m) { return m.authorRole === 'expert'; });
      const canWrite = writable() && (
        (user.role === 'expert' && canStart) ||
        (user.role === 'lawyer' && hasExpertMsg)
      );

      const unreadReq = getUnreadChatCountForRequest(request.id);
      const orgName = (thread && thread.organizationName) || orgNameFor(request, orgId, user.role === 'expert' ? opts.organizationName : null);
      const peerLabel = user.role === 'lawyer' ? orgName : 'Юрист';

      let switcher = '';
      if (user.role === 'lawyer') {
        if (!threads.length) {
          switcher = '<div class="chat-empty-hint chat-empty-hint-sm">Пока нет переписки. Эксперт может написать вам после отправки письма.</div>';
        } else {
          switcher = '<div class="chat-threads" role="group" aria-label="Переписка с организациями">' + threads.map(function (th) {
            const u = countUnreadInThread(th, user.id);
            const isActive = th.organizationId === orgId;
            return '<button type="button" class="chat-thread-tab' + (isActive ? ' active' : '') + '" aria-pressed="' + (isActive ? 'true' : 'false') + '" data-org="' + escapeHtml(th.organizationId) + '">' +
              escapeHtml(th.organizationName || orgNameFor(request, th.organizationId)) +
              (u ? '<span class="chat-tab-badge" aria-label="непрочитанных: ' + u + '">' + u + '</span>' : '') +
              '</button>';
          }).join('') + '</div>';
        }
      }

      const messages = (thread && thread.messages) || [];
      let listHtml = '';
      if (!thread && user.role === 'expert' && canStart) {
        listHtml = '';
      } else if (!messages.length && thread) {
        listHtml = '';
      } else {
        listHtml = messages.map(function (m) {
          const mine = m.authorId === user.id;
          const reply = findReply(messages, m.replyToMessageId);
          const editBtn = canEditMessageNow(m, user.id) && writable()
            ? '<button type="button" class="chat-msg-act" data-edit="' + escapeHtml(m.id) + '">Изменить</button>'
            : '';
          const replyBtn = (canWrite && !mine)
            ? '<button type="button" class="chat-msg-act" data-reply="' + escapeHtml(m.id) + '">Ответить</button>'
            : '';
          return '<div class="chat-msg' + (mine ? ' mine' : '') + '" id="msg-' + escapeHtml(m.id) + '">' +
            (reply ? '<div class="chat-reply-quote">↳ ' + escapeHtml((reply.authorName || '') + ': ' + (reply.text || 'вложение').slice(0, 80)) + '</div>' : '') +
            '<div class="chat-bubble">' +
              (m.text ? '<div class="chat-text">' + escapeHtml(m.text) + '</div>' : '') +
              (m.attachments && m.attachments.length
                ? '<div class="chat-files">' + m.attachments.map(function (f) {
                    return '<div class="chat-file"><span class="chat-file-icon">📄</span><div><div class="chat-file-name">' +
                      escapeHtml(f.fileName) + '</div><div class="chat-file-meta">' +
                      escapeHtml(formatFileSize(f.size, f.sizeMb)) +
                      '</div></div><button type="button" class="btn-open" data-download="1" aria-label="Скачать ' + escapeHtml(f.fileName) + '">Скачать</button></div>';
                  }).join('') + '</div>'
                : '') +
              '<div class="chat-meta">' +
                '<span class="chat-time" title="' + escapeHtml(formatDateTime(m.createdAt)) + '">' + escapeHtml(formatMsgTime(m.createdAt)) + '</span>' +
                (m.editedAt ? '<span class="chat-edited">изменено</span>' : '') +
                statusTicks(m, user.id) +
              '</div>' +
            '</div>' +
            '<div class="chat-msg-actions">' + replyBtn + editBtn + '</div>' +
          '</div>';
        }).join('');
      }

      const readOnlyNote = !writable()
        ? '<div class="chat-readonly">Заявка закрыта - переписка только для просмотра</div>'
        : (user.role === 'lawyer' && orgId && !hasExpertMsg
          ? '<div class="chat-readonly">Переписки с ' + escapeHtml(orgName) + ' пока нет. Эксперт может написать вам после отправки письма.</div>'
          : (user.role === 'expert' && !canStart
            ? '<div class="chat-readonly">Чат доступен после отправки информационного письма</div>'
            : ''));

      let composer = '';
      if (canWrite) {
        const replyBar = replyToId
          ? (function () {
              const rm = findReply(messages, replyToId);
              return '<div class="chat-reply-bar">Ответ на: ' + escapeHtml(rm ? (rm.text || 'сообщение').slice(0, 60) : '') +
                ' <button type="button" class="chat-reply-cancel" id="chatCancelReply" aria-label="Отменить ответ">×</button></div>';
            })()
          : '';
        const editBar = editingId
          ? '<div class="chat-reply-bar">Редактирование <button type="button" class="chat-reply-cancel" id="chatCancelEdit" aria-label="Отменить редактирование">×</button></div>'
          : '';
        composer =
          replyBar + editBar +
          '<div class="chat-composer">' +
            '<div class="chat-composer-input">' +
              '<textarea id="chatText" rows="3" placeholder="Написать сообщение…" aria-label="Сообщение" aria-describedby="chatForbidHint" maxlength="' + CHAT_MAX_TEXT + '"></textarea>' +
              '<div class="chat-forbid-hint" id="chatForbidHint" role="alert" style="display:none"></div>' +
            '</div>' +
            '<div class="chat-composer-actions">' +
              '<label class="btn btn-secondary btn-sm chat-attach-btn">Добавить документы<input type="file" id="chatFiles" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip" hidden></label>' +
              '<button type="button" class="btn btn-primary btn-sm" id="chatSendBtn">' + (editingId ? 'Сохранить' : 'Отправить') + '</button>' +
            '</div>' +
            '<div class="chat-attach-list" id="chatAttachList"></div>' +
          '</div>';
      }

      mount.innerHTML =
        '<div class="chat-panel">' +
          '<div class="chat-header">' +
            '<div class="chat-header-main">' +
              '<div class="chat-header-title">Переписка</div>' +
              '<div class="chat-header-sub">' + escapeHtml(request.caseNumber) + ' · ' + escapeHtml(request.expertiseType || '') +
                (orgId ? ' · ' + escapeHtml(peerLabel) : '') +
                (unreadReq ? ' · <span class="chat-unread-label">новых: ' + unreadReq + '</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          switcher +
          '<div class="chat-messages" id="chatMessages">' + listHtml + '</div>' +
          readOnlyNote +
          composer +
        '</div>';

      // Wire events
      mount.querySelectorAll('[data-download]').forEach(function (btn) {
        btn.addEventListener('click', function () { toast(DOWNLOAD_STUB_MSG, 'info'); });
      });
      mount.querySelectorAll('.chat-thread-tab').forEach(function (btn) {
        btn.addEventListener('click', function () {
          orgId = btn.getAttribute('data-org');
          replyToId = null;
          editingId = null;
          render();
        });
      });

      mount.querySelectorAll('[data-reply]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          replyToId = btn.getAttribute('data-reply');
          editingId = null;
          render();
          const ta = document.getElementById('chatText');
          if (ta) ta.focus();
        });
      });

      mount.querySelectorAll('[data-edit]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          editingId = btn.getAttribute('data-edit');
          replyToId = null;
          const msg = messages.find(function (m) { return m.id === editingId; });
          render();
          const ta = document.getElementById('chatText');
          if (ta && msg) {
            ta.value = msg.text || '';
            ta.focus();
          }
        });
      });

      const cancelReply = document.getElementById('chatCancelReply');
      if (cancelReply) cancelReply.addEventListener('click', function () { replyToId = null; render(); });
      const cancelEdit = document.getElementById('chatCancelEdit');
      if (cancelEdit) cancelEdit.addEventListener('click', function () { editingId = null; render(); });

      const ta = document.getElementById('chatText');
      const hint = document.getElementById('chatForbidHint');
      if (ta) {
        ta.addEventListener('input', function () {
          const v = validateChatText(ta.value);
          if (!v.ok && v.forbidden && v.forbidden.length) {
            hint.style.display = 'block';
            hint.innerHTML = 'Контакты и ссылки передавать нельзя - общение только на платформе: ' + highlightForbidden(ta.value);
          } else if (!v.ok) {
            hint.style.display = 'block';
            hint.textContent = v.errors[0];
          } else {
            hint.style.display = 'none';
          }
        });
      }

      let pendingFiles = [];
      const fileInput = document.getElementById('chatFiles');
      const attachList = document.getElementById('chatAttachList');
      function renderAttach() {
        if (!attachList) return;
        attachList.innerHTML = pendingFiles.map(function (f, i) {
          return '<span class="file-chip">' + escapeHtml(f.fileName) +
            ' <button type="button" data-rm="' + i + '" aria-label="Убрать файл ' + escapeHtml(f.fileName) + '">&times;</button></span>';
        }).join('');
        attachList.querySelectorAll('[data-rm]').forEach(function (b) {
          b.addEventListener('click', function () {
            pendingFiles.splice(+b.getAttribute('data-rm'), 1);
            renderAttach();
          });
        });
      }
      if (fileInput) {
        fileInput.addEventListener('change', function () {
          const files = Array.from(fileInput.files || []);
          files.forEach(function (f) {
            if (pendingFiles.length >= CHAT_MAX_FILES) return;
            pendingFiles.push({
              fileName: f.name,
              size: f.size,
              sizeMb: +(f.size / 1048576).toFixed(2),
              mime: f.type
            });
          });
          fileInput.value = '';
          renderAttach();
        });
      }

      const sendBtn = document.getElementById('chatSendBtn');
      if (sendBtn) {
        sendBtn.addEventListener('click', function () {
          if (sendBtn.disabled) return;
          sendBtn.disabled = true;
          setTimeout(function () { if (document.body.contains(sendBtn)) sendBtn.disabled = false; }, 600);
          const text = (document.getElementById('chatText') || {}).value || '';
          if (editingId) {
            const res = editChatMessage(thread.id, editingId, text);
            if (res.error) { toast(res.error, 'error'); return; }
            editingId = null;
            toast('Сообщение изменено', 'success');
            render();
            return;
          }
          if (!thread) {
            const created = getOrCreateThread(request.id, orgId);
            if (created.error) { toast(created.error, 'error'); return; }
            thread = created.thread;
          }
          const res = sendChatMessage(thread.id, {
            text: text,
            attachments: pendingFiles,
            replyToMessageId: replyToId
          });
          if (res.error) { toast(res.error, 'error'); return; }
          replyToId = null;
          pendingFiles = [];
          toast('Отправлено', 'success');
          render();
          const box = document.getElementById('chatMessages');
          if (box) box.scrollTop = box.scrollHeight;
        });
      }

      const box = document.getElementById('chatMessages');
      if (box) box.scrollTop = box.scrollHeight;

      // deep-link highlight (только при первой отрисовке)
      const params = new URLSearchParams(location.search);
      const mid = firstRender ? params.get('msg') : null;
      firstRender = false;
      if (mid) {
        const el = document.getElementById('msg-' + mid);
        if (el) {
          el.classList.add('chat-msg-flash');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    render();
    return {
      refresh: render,
      setOrg: function (id) { orgId = id; replyToId = null; editingId = null; render(); },
      getOrg: function () { return orgId; }
    };
  }

  global.mountChat = mountChat;
})(window);
