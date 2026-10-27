# Expert Letters — Premium UI

Премиальный прототип: лендинг + кабинеты юриста и эксперта.

## Открыть

```bash
cd expert-letters-premium
python3 -m http.server 8080
```

- Лендинг: http://localhost:8080/landing.html
- Вход: http://localhost:8080/index.html

## Что обновлено (premium pass)

### Дизайн-система
- Единый primary `#2563EB` / `#1E40AF` на лендинге и в кабинете
- Обновлённые радиусы, тени, кнопки, badge
- Тёмный sidebar `#0F172A`

### Лендинг
- Короткий hero-текст, note про 14 дней
- Features: чёткие line-иконки вместо мелких 3D
- Тарифы: чеклисты «что входит»
- Мобильное меню (burger)
- 3D сохранён в hero и шагах

### Кабинет
- Семантические иконки навигации (inbox / star / send / eye-off / briefcase / file-plus)
- Счётчики в sidebar (Избранное, Мои ответы)
- Улучшенные empty states
- Форма создания заявки: 3 секции + подсказка +14 дней

Данные: localStorage `expert_letters_v2_1`.
