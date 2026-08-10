import { describe, expect, it } from 'vitest'
import { applyMessageReviewRules } from '../../scripts/message-review-rules.mjs'

describe('message review rules', () => {
  it('fixes Traditional Chinese Albion and Taiwan gaming terminology', () => {
    expect(applyMessageReviewRules(
      'zh-Hant',
      'Officers configure party regear claims from guild stock.',
      '官員配置派對regear索賠並發行公會股票。',
    )).toBe('幹部設定隊伍regear申請並發放公會庫存。')
    expect(applyMessageReviewRules(
      'zh-Hant',
      'Open the siphon ledger and pay silver to members.',
      '開啟虹吸管分類賬，並向會員支付白銀。',
    )).toBe('開啟虹吸能量帳本，並向成員支付銀幣。')
    expect(applyMessageReviewRules(
      'zh-Hant',
      'Apply the build configuration on the public profile.',
      '在公共配置檔案上應用構建配置。',
    )).toBe('在公開個人檔案上套用配裝設定。')
    expect(applyMessageReviewRules(
      'zh-Hant',
      'Click to access the site-wide channel list.',
      '單擊以訪問站點全域性渠道列表。',
    )).toBe('點擊以存取網站全域頻道清單。')
  })

  it('fixes Spanish gaming-domain homonyms', () => {
    expect(applyMessageReviewRules(
      'es-ES',
      'Apply a party build to this slot.',
      'Aplicar una construcción de fiesta a la ranura.',
    )).toBe('Aplicar un build de grupo al slot.')
    expect(applyMessageReviewRules(
      'es-ES',
      'Issue this regear claim from guild stock.',
      'Emitir esta reclamación de regear de las acciones del gremio.',
    )).toBe('Entregar esta solicitud de regear del stock del gremio.')
    expect(applyMessageReviewRules(
      'es-ES',
      'Save this loadout to the craft queue.',
      'Guardar esta carga en la cola de artesanía.',
    )).toBe('Guardar este equipamiento en la cola de fabricación.')
    expect(applyMessageReviewRules(
      'es-ES',
      'Per-claim cap',
      'Capa por reclamación',
    )).toBe('Límite por solicitud')
  })

  it('fixes Brazilian and European Portuguese gaming-domain homonyms', () => {
    expect(applyMessageReviewRules(
      'pt-BR',
      'Party build slots and a per-claim cap',
      'Slots de construção da festa e uma tampa por reivindicação',
    )).toBe('Slots de build do grupo e um limite por solicitação')
    expect(applyMessageReviewRules(
      'pt-BR',
      'Issue a craft task from stock',
      'Emitir uma tarefa de artesanato do estoque',
    )).toBe('Emitir uma tarefa de fabricação do estoque')
    expect(applyMessageReviewRules(
      'pt-PT',
      'Claim a craft task',
      'Reivindicar uma tarefa de artesanato',
    )).toBe('Pedir uma tarefa de fabrico')
  })

  it('fixes Polish gaming-domain homonyms', () => {
    expect(applyMessageReviewRules(
      'pl',
      'Party slots and claim cap',
      'Gniazda imprezy i czapka roszczenia',
    )).toBe('Sloty grupy i limit wniosku')
    expect(applyMessageReviewRules(
      'pl',
      'Issue a build from stock',
      'Wydaj budowę z akcji',
    )).toBe('Wydaj build z zapasów')
    expect(applyMessageReviewRules(
      'pl',
      'Officers review craft applications',
      'Urzędnicy przeglądają aplikacje rzemiosła',
    )).toBe('Oficerowie przeglądają zgłoszenia craftingu')
  })

  it('fixes Russian Albion community terminology and gaming-domain homonyms', () => {
    expect(applyMessageReviewRules(
      'ru',
      'Officers review party applications and regear claims.',
      'Сотрудники рассматривают приложения вечеринки и претензии regear.',
    )).toBe('Офицеры рассматривают заявки группы и заявки regear.')
    expect(applyMessageReviewRules(
      'ru',
      'Issue crafted gear from guild stock.',
      'Выпуск акций для ремесленного снаряжения гильдии.',
    )).toBe('Выдача со склада для крафтового снаряжения гильдии.')
    expect(applyMessageReviewRules(
      'ru',
      'Claim cap',
      'Крышка претензии',
    )).toBe('Лимит заявки')
  })

  it('fixes Italian gaming-domain homonyms', () => {
    expect(applyMessageReviewRules(
      'it',
      'Officers review party applications and regear claims.',
      'I funzionari esaminano le applicazioni della festa e i reclami regear.',
    )).toBe('Gli ufficiali esaminano le iscrizioni del gruppo e le richieste regear.')
    expect(applyMessageReviewRules(
      'it',
      'Issue a craft build from guild stock.',
      'Emissione di azioni per una costruzione artigianale della gilda.',
    )).toBe('Uscita dal magazzino per una build di crafting della gilda.')
    expect(applyMessageReviewRules('it', 'Claim cap', 'Cappo di reclamo')).toBe(
      'Limite di richiesta',
    )
  })

  it('fixes Indonesian gaming-domain homonyms while keeping community loanwords', () => {
    expect(applyMessageReviewRules(
      'id',
      'Party applications use slots.',
      'Aplikasi pesta menggunakan celah.',
    )).toBe('Pendaftaran party menggunakan slot.')
    expect(applyMessageReviewRules(
      'id',
      'Crafters issue gear from guild stock.',
      'Pengrajin mengeluarkan gear dari saham guild.',
    )).toBe('Crafter mengeluarkan gear dari stok guild.')
    expect(applyMessageReviewRules('id', 'Claim cap', 'Topi klaim')).toBe('Batas klaim')
  })

  it('fixes Turkish gaming-domain homonyms', () => {
    expect(applyMessageReviewRules(
      'tr',
      'Officers review slot applications and claims.',
      'Memurlar yuva uygulamalarını ve iddiaları inceler.',
    )).toBe('Yetkililer slot başvurularını ve talepleri inceler.')
    expect(applyMessageReviewRules(
      'tr',
      'Crafters issue builds from guild stock.',
      'Zanaatçılar yapıları lonca hissesinden verir.',
    )).toBe('Crafterlar buildleri lonca stokundan verir.')
    expect(applyMessageReviewRules('tr', 'Claim cap', 'İddia kapağı')).toBe('Talep limiti')
  })

  it('fixes Arabic gaming-domain homonyms for the RTL catalog', () => {
    expect(applyMessageReviewRules(
      'ar',
      'Party applications use slots and claims.',
      'تستخدم تطبيقات الحفلة الفتحات والمطالبات.',
    )).toBe('تستخدم طلبات المجموعة الخانات والطلبات.')
    expect(applyMessageReviewRules(
      'ar',
      'Crafters issue gear from guild stock.',
      'يصدر الحرفيون المعدات من أسهم النقابة.',
    )).toBe('يصدر الصانعون المعدات من مخزون النقابة.')
    expect(applyMessageReviewRules('ar', 'Claim cap', 'غطاء المطالبة')).toBe('حد الطلب')
  })

  it('fixes French gaming-domain homonyms only when the English source matches', () => {
    expect(applyMessageReviewRules('fr', 'Add a party slot', 'Ajouter une machine à sous à la fête')).toBe(
      'Ajouter un emplacement au groupe',
    )
    expect(applyMessageReviewRules('fr', 'Invite the Discord bot', 'Inviter le robot Discord')).toBe(
      'Inviter le bot Discord',
    )
    expect(applyMessageReviewRules('fr', 'Issue this claim from stock', "Émission d'actions pour cette réclamation")).toBe(
      'sortie du stock pour cette demande',
    )
    expect(applyMessageReviewRules('fr', 'Regear claim cap', 'Regear réclamation bouchon')).toBe(
      'Demande de regear plafond',
    )
    expect(applyMessageReviewRules('fr', 'Discord login', 'Discord connexion')).toBe(
      'connexion Discord',
    )
  })

  it('fixes German gaming-domain homonyms only when the English source matches', () => {
    expect(applyMessageReviewRules('de', 'Party applications', 'Parteien und Anwendungen')).toBe(
      'Partys und Bewerbungen',
    )
    expect(applyMessageReviewRules('de', 'Current stock', 'Aktien')).toBe('Bestand')
    expect(applyMessageReviewRules('de', 'Applied build', 'Angewandte Konstruktion')).toBe(
      'Angewandte Build',
    )
    expect(applyMessageReviewRules('de', 'Kills', 'Tötet')).toBe('Kills')
    expect(applyMessageReviewRules('de', '{count} kills', '{count} tötet')).toBe('{count} Kills')
    expect(applyMessageReviewRules('de', 'Craft queue', 'Bastelwarteschlange')).toBe(
      'Crafting-Warteschlange',
    )
    expect(applyMessageReviewRules('de', 'Wins and losses', 'Gewinne und Verladungen')).toBe(
      'Gewinne und Niederlagen',
    )
    expect(applyMessageReviewRules('de', 'Political parties', 'Politische Parteien')).toBe(
      'Politische Partys',
    )
  })

  it('does not rewrite unrelated translated words', () => {
    expect(applyMessageReviewRules('de', 'Open the app', 'Öffnen Sie die Anwendungen')).toBe(
      'Öffnen Sie die Anwendungen',
    )
    expect(applyMessageReviewRules('de', 'Share price', 'Aktien')).toBe('Aktien')
  })
})
