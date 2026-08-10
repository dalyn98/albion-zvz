function replaceAll(text, replacements) {
  return replacements.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  )
}

function reviewGerman(source, translated) {
  let text = translated

  if (/\bofficers?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bdie Beamten\b/g, 'die Officer'],
      [/\bder Beamten\b/g, 'der Officer'],
      [/\bvon Beamten\b/g, 'von Officern'],
      [/\bmit Beamten\b/g, 'mit Officern'],
      [/\bBeamter\b/g, 'Officer'],
      [/\bBeamte\b/g, 'Officer'],
      [/\bBeamten\b/g, 'Officern'],
    ])
  }
  if (/\bpart(?:y|ies)\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bParteien\b/g, 'Partys'],
      [/\bPartei\b/g, 'Party'],
    ])
  }
  if (/\bapplications?\b/i.test(source)) {
    text = replaceAll(text, [[/\bAnwendungen\b/g, 'Bewerbungen']])
  }
  if (/\bstock\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bAktienausgabe\b/g, 'Ausgabe aus dem Bestand'],
      [/\bAktien\b/g, 'Bestand'],
    ])
  }
  if (/\bbuilds?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bAnatomie\b/g, 'Build'],
      [/\bKonstruktion\b/g, 'Build'],
    ])
  }
  if (/\bslots?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bSteckplätzen\b/g, 'Slots'],
      [/\bSteckplätze\b/g, 'Slots'],
      [/\bSteckplatzes\b/g, 'Slots'],
      [/\bSteckplatz\b/g, 'Slot'],
    ])
  }
  if (/\bloadouts?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bVerladungen\b/g, 'Loadouts'],
      [/\bVerladung\b/g, 'Loadout'],
    ])
  }
  if (/\bkills?\b/i.test(source)) {
    text = replaceAll(text, [[/\btötet\b/gi, 'Kills']])
  }
  if (/\bengagements?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bVerlobungs-/g, 'Kampf-'],
      [/\bVerlobungs/g, 'Kampf'],
      [/\bVerlobung\b/g, 'Kampf'],
    ])
  }
  if (/\braw feed\b/i.test(source)) {
    text = replaceAll(text, [[/\bRohfutter\b/g, 'Rohdaten']])
  }
  if (/\btie\b/i.test(source)) {
    text = replaceAll(text, [[/\bKrawatte\b/g, 'Unentschieden']])
  }
  if (/\bclose or pending\b/i.test(source)) {
    text = text.replace('geschlossen oder steht noch aus', 'ausgeglichen oder noch nicht bewertet')
  }
  if (/\blosses\b/i.test(source)) {
    text = replaceAll(text, [[/\bVerladungen\b/g, 'Niederlagen']])
  }
  if (/\bDiscord shares\b/i.test(source)) {
    text = replaceAll(text, [[/\bDiscord Aktien\b/g, 'Discord-Vorschauen']])
  }
  if (/\bguild-wide\b/i.test(source)) {
    text = text.replace(/\bguildweit/gi, 'gildenweit')
  }
  if (/\bcraft(?:ed|ing|er|ers)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bBastel-Anschlaufgabe\b/g, 'Crafting-Aufgabe'],
      [/\bBastel-Wanden-Aufgabe\b/g, 'Crafting-Aufgabe'],
      [/\bBastelbedarf\b/g, 'Crafting-Bedarf'],
      [/\bBastelbestellungen\b/g, 'Crafting-Aufträge'],
      [/\bBastelbestellung\b/g, 'Crafting-Auftrag'],
      [/\bBastelbonusstadt\b/g, 'Crafting-Bonusstadt'],
      [/\bBastelgegenstände\b/g, 'Crafting-Gegenstände'],
      [/\bBastelgegenstand\b/g, 'Crafting-Gegenstand'],
      [/\bBastellieferungen\b/g, 'Crafting-Lieferungen'],
      [/\bBastellieferung\b/g, 'Crafting-Lieferung'],
      [/\bBastelwarteschlangen\b/g, 'Crafting-Warteschlangen'],
      [/\bBastelwarteschlange\b/g, 'Crafting-Warteschlange'],
      [/\bBastelwerkzeuge\b/g, 'Crafting-Werkzeuge'],
      [/\bBastelaufgabendetails\b/g, 'Details der Crafting-Aufgabe'],
      [/\bBastelaufgaben\b/g, 'Crafting-Aufgaben'],
      [/\bBastelaufgabe\b/g, 'Crafting-Aufgabe'],
      [/\bBastelabholung\b/g, 'Crafting-Abholung'],
      [/\bBastelmodus\b/g, 'Crafting-Modus'],
      [/\bBastelplätze\b/g, 'Crafting-Slots'],
      [/\bBastelplatz\b/g, 'Crafting-Slot'],
      [/\bBastelanfragen\b/g, 'Crafting-Anfragen'],
      [/\bBastelanfrage\b/g, 'Crafting-Anfrage'],
      [/\bBasteln\b/g, 'Crafting'],
      [/\bbasteln\b/g, 'craften'],
      [/\bGebastelte\b/g, 'Hergestellte'],
      [/\bGebastelt\b/g, 'Hergestellt'],
      [/\bHandwerkskandidaten\b/g, 'Crafting-Kandidaten'],
      [/\bHandwerksumfang\b/g, 'Crafting-Umfang'],
      [/\bHandwerker\b/g, 'Crafter'],
      [/\bHandwerk regear\b/gi, 'Crafting-Regear'],
    ])
  }

  return text
}

function reviewFrench(source, translated) {
  let text = translated

  if (/\bpart(?:y|ies)\b/i.test(source)) {
    text = replaceAll(text, [
      [/\btoutes les fêtes\b/gi, 'tous les groupes'],
      [/\btoute la fête\b/gi, 'tout le groupe'],
      [/\bcette fête\b/gi, 'ce groupe'],
      [/\bune fête\b/gi, 'un groupe'],
      [/\bde la fête\b/gi, 'du groupe'],
      [/à la fête\b/gi, 'au groupe'],
      [/\bla fête\b/gi, 'le groupe'],
      [/\bles fêtes\b/gi, 'les groupes'],
      [/\bdes fêtes\b/gi, 'des groupes'],
      [/\bfêtes\b/gi, 'groupes'],
      [/\bfête\b/gi, 'groupe'],
      [/\bparties\b/gi, 'groupes'],
      [/\bpartie\b/gi, 'groupe'],
    ])
  }
  if (/\bbots?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\brobots\b/gi, 'bots'],
      [/\brobot\b/gi, 'bot'],
    ])
  }
  if (/\bslots?\b/i.test(source) && !/\btime slots?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bune machine à sous\b/gi, 'un emplacement'],
      [/\bmachines à sous\b/gi, 'emplacements'],
      [/\bmachine à sous\b/gi, 'emplacement'],
      [/\bcréneaux\b/gi, 'emplacements'],
      [/\bcréneau\b/gi, 'emplacement'],
    ])
  }
  if (/\bofficers?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bagents\b/gi, 'officiers'],
      [/\bagent\b/gi, 'officier'],
    ])
  }
  if (/\bbuilds?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bconstructions\b/gi, 'builds'],
      [/\bconstruction\b/gi, 'build'],
    ])
  }
  if (/\bloadouts?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bchargements\b/gi, 'stuffs'],
      [/\bchargement\b/gi, 'stuff'],
    ])
  }
  if (/\bclaim(?:s|ed|ing|ants?|ers?)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\brevendications\b/gi, 'demandes'],
      [/\brevendication\b/gi, 'demande'],
      [/\bréclamations\b/gi, 'demandes'],
      [/\bréclamation\b/gi, 'demande'],
    ])
  }
  if (/\bstock\b/i.test(source)) {
    text = replaceAll(text, [
      [/émission d['’]action(?:s)?\b/gi, 'sortie du stock'],
    ])
  }
  if (/\bcaps?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bcasquettes\b/gi, 'plafonds'],
      [/\bcasquette\b/gi, 'plafond'],
      [/\bbouchons\b/gi, 'plafonds'],
      [/\bbouchon\b/gi, 'plafond'],
      [/\bsolit\b/gi, 'plafond'],
    ])
  }
  if (/\b(?:point top-up|donation)\b/i.test(source)) {
    text = text.replace(/point de rempl\p{L}*/giu, 'don de points')
  }

  return replaceAll(text, [
    [/\bà le groupe\b/gi, 'au groupe'],
    [/\bDiscord connexion\b/gi, 'connexion Discord'],
    [/\bDiscord installation du bot\b/gi, 'installation du bot Discord'],
    [/\bDiscord messages?\b/gi, (match) => match.toLowerCase().endsWith('s') ? 'messages Discord' : 'message Discord'],
    [/\bDiscord rôles?\b/gi, (match) => match.toLowerCase().endsWith('s') ? 'rôles Discord' : 'rôle Discord'],
    [/\bKillboard décès\b/g, 'décès du Killboard'],
    [/\bKillboard informations\b/g, 'Informations du Killboard'],
    [/\bKillboard vérification\b/g, 'vérification du Killboard'],
    [/\bRegear histoire\b/gi, 'Historique des regears'],
    [/\bRegear bouchon\b/gi, 'Plafond de regear'],
    [/\bRegear limite\b/gi, 'Limite de regear'],
    [/\bRegear opérations\b/gi, 'Opérations de regear'],
    [/\bRegear paramètres\b/gi, 'Paramètres de regear'],
    [/\bRegear politiques\b/gi, 'Politiques de regear'],
    [/\bRegear demandes\b/gi, 'Demandes de regear'],
    [/\bRegear demande\b/gi, 'Demande de regear'],
    [/\bdemandes regear\b/gi, 'demandes de regear'],
    [/\bdemande regear\b/gi, 'demande de regear'],
  ])
}

function reviewTraditionalChinese(source, translated) {
  let text = replaceAll(translated, [
    [/許可權/g, '權限'],
    [/訪問者/g, '訪客'],
    [/訪問/g, '存取'],
    [/單擊/g, '點擊'],
    [/渠道/g, '頻道'],
    [/全域性/g, '全域'],
    [/站點/g, '網站'],
    [/分類賬/g, '帳本'],
    [/賬戶/g, '帳戶'],
    [/列表/g, '清單'],
    [/家庭公會/g, '主公會'],
    [/時間戳(?!記)/g, '時間戳記'],
    [/運營/g, '營運'],
    [/對映/g, '對應'],
    [/模態/g, '對話框'],
  ])

  if (/\bofficers?\b/i.test(source)) text = text.replace(/官員/g, '幹部')
  if (/\brecruit(?:ing|ment|ed|s)?\b/i.test(source)) text = text.replace(/招聘/g, '招募')
  if (/\bmembers?(?:hip)?\b/i.test(source)) text = text.replace(/會員/g, '成員')
  if (/\b(?:configure[ds]?|configuring|configuration|configured)\b/i.test(source)) {
    text = text.replace(/配置/g, '設定')
  }
  if (/\bprofiles?\b/i.test(source)) {
    text = replaceAll(text, [
      [/公共設定檔案/g, '公開個人檔案'],
      [/公共配置檔案/g, '公開個人檔案'],
      [/設定檔案/g, '個人檔案'],
      [/配置檔案/g, '個人檔案'],
    ])
  }
  if (/\bapplications?\b/i.test(source)) {
    text = replaceAll(text, [
      [/應用程式/g, '申請'],
      [/應用/g, '申請'],
    ])
  }
  if (/\b(?:apply|applied|applies|applying)\b/i.test(source)) text = text.replace(/應用/g, '套用')
  if (/\bpart(?:y|ies)\b/i.test(source)) text = text.replace(/派對/g, '隊伍')
  if (/\bclaim(?:s|ed|ing|ants?|ers?)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/索賠人/g, '申請者'],
      [/索賠/g, '申請'],
      [/新主張/g, '新申請'],
    ])
  }
  if (/\bstock\b/i.test(source)) {
    text = replaceAll(text, [
      [/發行(?=[^，。]{0,12}股票)/g, '發放'],
      [/發行股票/g, '發放庫存'],
      [/股票發行/g, '庫存發放'],
      [/股票問題/g, '庫存發放'],
      [/股票/g, '庫存'],
    ])
  }
  if (/\bcraft(?:ed|ing|er|ers)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/工藝人員/g, '製作者'],
      [/工藝/g, '製作'],
    ])
  }
  if (/\bsiphon(?:ed|s|ing)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/虹吸管/g, '虹吸能量'],
      [/虹吸器/g, '虹吸能量'],
    ])
  }
  if (/\bsilver\b/i.test(source)) {
    text = replaceAll(text, [
      [/白銀/g, '銀幣'],
      [/銀色/g, '銀幣'],
      [/作為銀(?!幣)/g, '以銀幣'],
    ])
  }
  if (/\bloadouts?\b/i.test(source)) {
    text = replaceAll(text, [
      [/裝備載入/g, '配裝'],
      [/裝載/g, '配裝'],
    ])
  }
  if (/\bbuilds?\b/i.test(source)) {
    text = replaceAll(text, [
      [/構建裝備/g, '製作裝備'],
      [/構建/g, '配裝'],
    ])
  }
  if (/\bartifacts?\b/i.test(source)) text = text.replace(/手工藝品/g, '神器')

  return text
}

function reviewSpanish(source, translated) {
  let text = translated

  if (/\bpart(?:y|ies)\b/i.test(source)) {
    text = replaceAll(text, [
      [/\btodas las fiestas\b/gi, 'todos los grupos'],
      [/\btoda la fiesta\b/gi, 'todo el grupo'],
      [/\bde la fiesta\b/gi, 'del grupo'],
      [/\ba la fiesta\b/gi, 'al grupo'],
      [/\blas fiestas\b/gi, 'los grupos'],
      [/\buna fiesta\b/gi, 'un grupo'],
      [/\bla fiesta\b/gi, 'el grupo'],
      [/\bfiestas\b/gi, 'grupos'],
      [/\bfiesta\b/gi, 'grupo'],
      [/\bpartidos\b/gi, 'grupos'],
      [/\bpartido\b/gi, 'grupo'],
    ])
  }
  if (/\bslots?\b/i.test(source) && !/\btime slots?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\ba la ranura\b/gi, 'al slot'],
      [/\blas ranuras\b/gi, 'los slots'],
      [/\buna ranura\b/gi, 'un slot'],
      [/\bla ranura\b/gi, 'el slot'],
      [/\branuras\b/gi, 'slots'],
      [/\branura\b/gi, 'slot'],
    ])
  }
  if (/\bclaim(?:s|ed|ing|ants?|ers?)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\breclamantes\b/gi, 'solicitantes'],
      [/\breclamante\b/gi, 'solicitante'],
      [/\breclamaciones\b/gi, 'solicitudes'],
      [/\breclamación\b/gi, 'solicitud'],
      [/\breclamos\b/gi, 'solicitudes'],
      [/\breclamo\b/gi, 'solicitud'],
    ])
  }
  if (/\bstock\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bEmitir\b/g, 'Entregar'],
      [/\bemitir\b/g, 'entregar'],
      [/\bEmita\b/g, 'Entregue'],
      [/\bemita\b/g, 'entregue'],
      [/\bde las acciones del gremio\b/gi, 'del stock del gremio'],
      [/\bemitir acciones\b/gi, 'entregar del stock'],
      [/\bemita equipo de las acciones del gremio\b/gi, 'entregue equipo del stock del gremio'],
      [/\bproblema de acciones\b/gi, 'entrega de stock'],
      [/\bproblema de stock\b/gi, 'entrega de stock'],
      [/\bacciones del gremio\b/gi, 'stock del gremio'],
      [/\blas acciones\b/gi, 'el stock'],
      [/\bacciones\b/gi, 'stock'],
      [/\bexistencias\b/gi, 'stock'],
    ])
  }
  if (/\bbuilds?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bconstrucciones\b/gi, 'builds'],
      [/\bconstrucción\b/gi, 'build'],
      [/\buna build\b/gi, 'un build'],
    ])
  }
  if (/\bloadouts?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\besta carga\b/gi, 'este equipamiento'],
      [/\bcargas de equipo\b/gi, 'equipamientos'],
      [/\bcarga perdida\b/gi, 'equipamiento perdido'],
      [/\bcargas\b/gi, 'equipamientos'],
      [/\bcarga\b/gi, 'equipamiento'],
    ])
  }
  if (/\bcraft(?:ed|ing|er|ers)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bartesanías\b/gi, 'fabricaciones'],
      [/\bartesanía\b/gi, 'fabricación'],
      [/\belaborados\b/gi, 'fabricados'],
      [/\belaborado\b/gi, 'fabricado'],
    ])
  }
  if (/\bapplications?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\baplicaciones\b/gi, 'solicitudes'],
      [/\baplicación\b/gi, 'solicitud'],
    ])
  }
  if (/\bcaps?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bCapas\b/g, 'Límites'],
      [/\bCapa\b/g, 'Límite'],
      [/\bcapas\b/gi, 'límites'],
      [/\bcapa\b/gi, 'límite'],
      [/\bláforo\b/gi, 'límite'],
    ])
  }

  return text
}

function reviewPortuguese(source, translated, locale) {
  let text = translated
  const isBrazil = locale === 'pt-BR'

  if (/\bpart(?:y|ies)\b/i.test(source)) {
    text = replaceAll(text, [
      [/\btodas as festas\b/gi, 'todos os grupos'],
      [/\btoda a festa\b/gi, 'todo o grupo'],
      [/\bda festa\b/gi, 'do grupo'],
      [/\bà festa\b/gi, 'ao grupo'],
      [/\bas festas\b/gi, 'os grupos'],
      [/\buma festa\b/gi, 'um grupo'],
      [/\ba festa\b/gi, 'o grupo'],
      [/\bfestas\b/gi, 'grupos'],
      [/\bfesta\b/gi, 'grupo'],
      [/\bpartidos\b/gi, 'grupos'],
      [/\bpartido\b/gi, 'grupo'],
    ])
  }
  if (/\bslots?\b/i.test(source) && !/\btime slots?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bRanhuras\b/g, 'Slots'],
      [/\bRanhura\b/g, 'Slot'],
      [/\branhuras\b/gi, 'slots'],
      [/\branhura\b/gi, 'slot'],
    ])
  }
  if (/\bclaim(?:s|ed|ing|ants?|ers?)?\b/i.test(source)) {
    const singular = isBrazil ? 'solicitação' : 'pedido'
    const plural = isBrazil ? 'solicitações' : 'pedidos'
    const claimant = isBrazil ? 'solicitante' : 'requerente'
    text = replaceAll(text, [
      [/\breivindicantes\b/gi, `${claimant}s`],
      [/\breivindicante\b/gi, claimant],
      [/\breclamantes\b/gi, `${claimant}s`],
      [/\breclamante\b/gi, claimant],
      [/\breivindicações\b/gi, plural],
      [/\breivindicação\b/gi, singular],
      [/\breclamações\b/gi, plural],
      [/\breclamação\b/gi, singular],
      [/\bsinistros\b/gi, plural],
      [/\bsinistro\b/gi, singular],
      [/\bReivindicar\b/g, isBrazil ? 'Solicitar' : 'Pedir'],
      [/\breivindicar\b/gi, isBrazil ? 'solicitar' : 'pedir'],
    ])
  }
  if (/\bstock\b/i.test(source)) {
    const stock = isBrazil ? 'estoque' : 'stock'
    text = replaceAll(text, [
      [/\bEmitir estoque\b/g, `Retirar do ${stock}`],
      [/\bemitir estoque\b/g, `retirar do ${stock}`],
      [/\bEmita equipamento do estoque\b/g, `Entregue equipamento do ${stock}`],
      [/\bproblema de estoque\b/gi, `retirada do ${stock}`],
      [/\bemissão de ações\b/gi, `retirada do ${stock}`],
      [/\bações da guilda\b/gi, `${stock} da guilda`],
      [/\bexistências\b/gi, stock],
    ])
  }
  if (/\bbuilds?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bConstruções\b/g, 'Builds'],
      [/\bConstrução\b/g, 'Build'],
      [/\bconstruções\b/gi, 'builds'],
      [/\bconstrução\b/gi, 'build'],
    ])
  }
  if (/\bloadouts?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bcargas de equipamento\b/gi, 'equipamentos'],
      [/\bcarga perdida\b/gi, 'equipamento perdido'],
    ])
  }
  if (/\bcraft(?:ed|ing|er|ers)?\b/i.test(source)) {
    const craft = isBrazil ? 'fabricação' : 'fabrico'
    const crafter = isBrazil ? 'fabricante' : 'responsável pelo fabrico'
    text = replaceAll(text, [
      [/\bartesanatos\b/gi, craft],
      [/\bartesanato\b/gi, craft],
      [/\bartesãos\b/gi, `${crafter}s`],
      [/\bartesão\b/gi, crafter],
    ])
  }
  if (/\bapplications?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\baplicativos\b/gi, 'inscrições'],
      [/\baplicações\b/gi, 'inscrições'],
      [/\baplicativo\b/gi, 'inscrição'],
      [/\baplicação\b/gi, 'inscrição'],
    ])
  }
  if (/\bcaps?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bTampas\b/g, 'Limites'],
      [/\bTampa\b/g, 'Limite'],
      [/\btampas\b/gi, 'limites'],
      [/\btampa\b/gi, 'limite'],
      [/\bcap de (?:solicitação|pedido)\b/gi, isBrazil ? 'limite por solicitação' : 'limite por pedido'],
      [/\buma limite\b/gi, 'um limite'],
    ])
  }

  return text
}

function reviewPolish(source, translated) {
  let text = translated

  if (/\bpart(?:y|ies)\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bimprezami\b/gi, 'grupami'],
      [/\bimprezach\b/gi, 'grupach'],
      [/\bimprez\b/gi, 'grup'],
      [/\bimprezie\b/gi, 'grupie'],
      [/\bimprezą/gi, 'grupą'],
      [/\bimprezę/gi, 'grupę'],
      [/\bimprezy\b/gi, 'grupy'],
      [/\bimpreza\b/gi, 'grupa'],
      [/\bpartii\b/gi, 'grupy'],
      [/\bpartię/gi, 'grupę'],
      [/\bpartia\b/gi, 'grupa'],
    ])
  }
  if (/\bslots?\b/i.test(source) && !/\btime slots?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bGniazda\b/g, 'Sloty'],
      [/\bGniazdo\b/g, 'Slot'],
      [/\bgniazdach\b/gi, 'slotach'],
      [/\bgnieździe\b/gi, 'slocie'],
      [/\bgniazda\b/gi, 'sloty'],
      [/\bgniazdo\b/gi, 'slot'],
      [/\bszczelinę/gi, 'slot'],
      [/\bszczeliny\b/gi, 'sloty'],
      [/\bszczelina\b/gi, 'slot'],
    ])
  }
  if (/\bclaim(?:s|ed|ing|ants?|ers?)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\broszczeniodawcy\b/gi, 'wnioskodawcy'],
      [/\broszczącego\b/gi, 'wnioskodawcy'],
      [/\broszczeń/gi, 'wniosków'],
      [/\broszczeniami\b/gi, 'wnioskami'],
      [/\broszczeniem\b/gi, 'wnioskiem'],
      [/\broszczeniom\b/gi, 'wnioskom'],
      [/\broszczenia\b/gi, 'wnioski'],
      [/\broszczeniu\b/gi, 'wniosku'],
      [/\broszczenie\b/gi, 'wniosek'],
      [/\bpretensji\b/gi, 'wniosku'],
      [/\bpretensja\b/gi, 'wniosek'],
    ])
  }
  if (/\bstock\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bEmisja akcji\b/g, 'Wydanie z magazynu'],
      [/\bemisja akcji\b/gi, 'wydanie z magazynu'],
      [/\bWydaj akcje\b/g, 'Wydaj z magazynu'],
      [/\bakcjach\b/gi, 'zapasach'],
      [/\bakcji\b/gi, 'zapasów'],
      [/\bakcje\b/gi, 'zapasy'],
      [/\bakcja\b/gi, 'zapas'],
    ])
  }
  if (/\bofficers?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bUrzędnicy\b/g, 'Oficerowie'],
      [/\burzędnicy\b/g, 'oficerowie'],
      [/\bfunkcjonariuszach\b/gi, 'oficerach'],
      [/\bfunkcjonariuszami\b/gi, 'oficerami'],
      [/\bfunkcjonariuszom\b/gi, 'oficerom'],
      [/\bfunkcjonariuszy\b/gi, 'oficerów'],
      [/\bfunkcjonariuszem\b/gi, 'oficerem'],
      [/\bfunkcjonariusze\b/gi, 'oficerowie'],
      [/\bfunkcjonariusza\b/gi, 'oficera'],
      [/\bfunkcjonariusz\b/gi, 'oficer'],
      [/\burzędnikach\b/gi, 'oficerach'],
      [/\burzędnikami\b/gi, 'oficerami'],
      [/\burzędnikom\b/gi, 'oficerom'],
      [/\burzędników\b/gi, 'oficerów'],
      [/\burzędnikiem\b/gi, 'oficerem'],
      [/\burzędnika\b/gi, 'oficera'],
      [/\burzędnik\b/gi, 'oficer'],
    ])
  }
  if (/\bbuilds?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bBudowa\b/g, 'Build'],
      [/\bbudowania\b/gi, 'tworzenia buildów'],
      [/\bbudowanie\b/gi, 'build'],
      [/\bbudowę/gi, 'build'],
      [/\bbudowy\b/gi, 'buildu'],
      [/\bbudowa\b/gi, 'build'],
      [/\bkonstrukcje\b/gi, 'buildy'],
      [/\bkonstrukcja\b/gi, 'build'],
    ])
  }
  if (/\bcraft(?:ed|ing|er|ers)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\brzemieślniczej\b/gi, 'craftingowej'],
      [/\brzemieślnicze\b/gi, 'craftingowe'],
      [/\brzemieślnicy\b/gi, 'crafterzy'],
      [/\brzemieślnika\b/gi, 'craftera'],
      [/\brzemieślnik\b/gi, 'crafter'],
      [/\brzemiosła\b/gi, 'craftingu'],
      [/\brzemiosło\b/gi, 'crafting'],
      [/\brękodzieła\b/gi, 'craftingu'],
      [/\brękodzieło\b/gi, 'crafting'],
    ])
  }
  if (/\bapplications?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\baplikacjami\b/gi, 'zgłoszeniami'],
      [/\baplikacje\b/gi, 'zgłoszenia'],
      [/\baplikacji\b/gi, 'zgłoszeń'],
      [/\baplikacja\b/gi, 'zgłoszenie'],
    ])
  }
  if (/\bcaps?\b/i.test(source)) {
    text = replaceAll(text, [
      [/\bŹródło czapki\b/g, 'Źródło limitu'],
      [/\bCzapki na rolę\b/g, 'Limity dla ról'],
      [/\bCzapki\b/g, 'Limity'],
      [/\bCzapka\b/g, 'Limit'],
      [/\bczapek\b/gi, 'limitów'],
      [/\bczapki\b/gi, 'limitu'],
      [/\bczapka\b/gi, 'limit'],
      [/\blimit wnioski\b/gi, 'limit wniosku'],
    ])
  }

  return text
}

function reviewRussian(source, translated) {
  let text = translated

  if (/\bpart(?:y|ies)\b/i.test(source)) {
    text = replaceAll(text, [
      [/Вечеринки/g, 'Группы'],
      [/Вечеринка/g, 'Группа'],
      [/вечеринками/gi, 'группами'],
      [/вечеринках/gi, 'группах'],
      [/вечеринок/gi, 'групп'],
      [/вечеринке/gi, 'группе'],
      [/вечеринку/gi, 'группу'],
      [/вечеринки/gi, 'группы'],
      [/вечеринка/gi, 'группа'],
    ])
  }
  if (/\bclaim(?:s|ed|ing|ants?|ers?)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Претензии/g, 'Заявки'],
      [/Претензия/g, 'Заявка'],
      [/Требования/g, 'Заявки'],
      [/Требование/g, 'Заявка'],
      [/самопретензия/gi, 'собственная заявка'],
      [/претензиями/gi, 'заявками'],
      [/претензиях/gi, 'заявках'],
      [/претензий/gi, 'заявок'],
      [/претензии/gi, 'заявки'],
      [/претензию/gi, 'заявку'],
      [/претензия/gi, 'заявка'],
      [/требований/gi, 'заявок'],
      [/требования/gi, 'заявки'],
      [/требование/gi, 'заявка'],
    ])
  }
  if (/\bstock\b/i.test(source)) {
    text = replaceAll(text, [
      [/Выпуск акций/g, 'Выдача со склада'],
      [/Проблема с акциями/g, 'Выдача со склада'],
      [/выпуск акций/gi, 'выдача со склада'],
      [/проблема с акциями/gi, 'выдача со склада'],
      [/акциями/gi, 'запасами'],
      [/акциях/gi, 'запасах'],
      [/акций/gi, 'запасов'],
      [/акции/gi, 'запасы'],
      [/акция/gi, 'запас'],
    ])
  }
  if (/\bapplications?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Приложения/g, 'Заявки'],
      [/Приложение/g, 'Заявка'],
      [/приложениями/gi, 'заявками'],
      [/приложениях/gi, 'заявках'],
      [/приложений/gi, 'заявок'],
      [/приложения/gi, 'заявки'],
      [/приложение/gi, 'заявка'],
    ])
  }
  if (/\bofficers?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Сотрудники/g, 'Офицеры'],
      [/Сотрудник/g, 'Офицер'],
      [/сотрудниками/gi, 'офицерами'],
      [/сотрудниках/gi, 'офицерах'],
      [/сотрудникам/gi, 'офицерам'],
      [/сотрудников/gi, 'офицеров'],
      [/сотрудником/gi, 'офицером'],
      [/сотрудника/gi, 'офицера'],
      [/сотрудники/gi, 'офицеры'],
      [/сотрудник/gi, 'офицер'],
    ])
  }
  if (/\bbuilds?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Строить, построить/g, 'Билд'],
      [/Построить палитру/g, 'Палитра билдов'],
      [/строится/gi, 'билды'],
      [/строит/gi, 'билд'],
    ])
  }
  if (/\bcraft(?:ed|ing|er|ers)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Ремесленники/g, 'Крафтеры'],
      [/Ремесленник/g, 'Крафтер'],
      [/Ремесленные/g, 'Крафтовые'],
      [/Ремесленный/g, 'Крафтовый'],
      [/Ремесло/g, 'Крафт'],
      [/ремесленниками/gi, 'крафтерами'],
      [/ремесленников/gi, 'крафтеров'],
      [/ремесленникам/gi, 'крафтерам'],
      [/ремесленнике/gi, 'крафтере'],
      [/ремесленники/gi, 'крафтеры'],
      [/ремесленника/gi, 'крафтера'],
      [/ремесленник/gi, 'крафтер'],
      [/ремесленными/gi, 'крафтовыми'],
      [/ремесленных/gi, 'крафтовых'],
      [/ремесленные/gi, 'крафтовые'],
      [/ремесленной/gi, 'крафтовой'],
      [/ремесленная/gi, 'крафтовая'],
      [/ремесленного/gi, 'крафтового'],
      [/ремесленное/gi, 'крафтовое'],
      [/ремесленный/gi, 'крафтовый'],
      [/ремесел/gi, 'крафта'],
      [/ремесла/gi, 'крафта'],
      [/ремесло/gi, 'крафт'],
    ])
  }
  if (/\bcaps?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Крышки/g, 'Лимиты'],
      [/Крышка/g, 'Лимит'],
      [/Шапки/g, 'Лимиты'],
      [/Шапка/g, 'Лимит'],
      [/крышек/gi, 'лимитов'],
      [/крышки/gi, 'лимиты'],
      [/крышка/gi, 'лимит'],
      [/шапок/gi, 'лимитов'],
      [/шапки/gi, 'лимиты'],
      [/шапка/gi, 'лимит'],
    ])
  }

  return text
}

function reviewItalian(source, translated) {
  let text = translated

  if (/\bpart(?:y|ies)\b/i.test(source)) {
    text = replaceAll(text, [
      [/della festa/gi, 'del gruppo'],
      [/delle feste/gi, 'dei gruppi'],
      [/Feste/g, 'Gruppi'],
      [/Festa/g, 'Gruppo'],
      [/feste/gi, 'gruppi'],
      [/festa/gi, 'gruppo'],
    ])
  }
  if (/\bclaim(?:s|ed|ing|ants?|ers?)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/i reclami/gi, 'le richieste'],
      [/Auto-rivendicazione/gi, 'Richiesta personale'],
      [/Rivendicazioni/g, 'Richieste'],
      [/Rivendicazione/g, 'Richiesta'],
      [/Reclami/g, 'Richieste'],
      [/Reclamo/g, 'Richiesta'],
      [/rivendicazioni/gi, 'richieste'],
      [/rivendicazione/gi, 'richiesta'],
      [/rivendicato/gi, 'richiesto'],
      [/rivendicare/gi, 'richiedere'],
      [/reclami/gi, 'richieste'],
      [/reclamo/gi, 'richiesta'],
    ])
  }
  if (/\bstock\b/i.test(source)) {
    text = replaceAll(text, [
      [/Emissione di azioni/g, 'Uscita dal magazzino'],
      [/problema di azioni/gi, 'uscita dal magazzino'],
      [/emissione di azioni/gi, 'uscita dal magazzino'],
      [/azioni della gilda/gi, 'scorte della gilda'],
      [/azioni/gi, 'scorte'],
      [/azione/gi, 'scorta'],
    ])
  }
  if (/\bbuilds?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Costruzioni/g, 'Build'],
      [/Costruzione/g, 'Build'],
      [/costruzioni/gi, 'build'],
      [/costruzione/gi, 'build'],
    ])
  }
  if (/\bslots?\b/i.test(source) && !/\btime slots?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Fessure/g, 'Slot'],
      [/Fessura/g, 'Slot'],
      [/fessure/gi, 'slot'],
      [/fessura/gi, 'slot'],
    ])
  }
  if (/\bcraft(?:ed|ing|er|ers)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Artigiani/g, 'Crafter'],
      [/Artigiano/g, 'Crafter'],
      [/artigiani/gi, 'crafter'],
      [/artigiano/gi, 'crafter'],
      [/artigianali/gi, 'di crafting'],
      [/artigianale/gi, 'di crafting'],
      [/artigianato/gi, 'crafting'],
    ])
  }
  if (/\bofficers?\b/i.test(source)) {
    text = replaceAll(text, [
      [/I funzionari/g, 'Gli ufficiali'],
      [/Funzionari/g, 'Ufficiali'],
      [/Funzionario/g, 'Ufficiale'],
      [/funzionari/gi, 'ufficiali'],
      [/funzionario/gi, 'ufficiale'],
    ])
  }
  if (/\bapplications?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Applicazioni/g, 'Iscrizioni'],
      [/Applicazione/g, 'Iscrizione'],
      [/applicazioni/gi, 'iscrizioni'],
      [/applicazione/gi, 'iscrizione'],
    ])
  }
  if (/\bcaps?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Tappi/g, 'Limiti'],
      [/Tappo/g, 'Limite'],
      [/Cappo/g, 'Limite'],
      [/tappi/gi, 'limiti'],
      [/tappo/gi, 'limite'],
      [/cappo/gi, 'limite'],
    ])
  }

  return text
}

function reviewIndonesian(source, translated) {
  let text = translated

  if (/\bpart(?:y|ies)\b/i.test(source)) {
    text = replaceAll(text, [
      [/Pesta/g, 'Party'],
      [/pesta/gi, 'party'],
    ])
  }
  if (/\bstock\b/i.test(source)) {
    text = replaceAll(text, [
      [/Mengeluarkan saham/gi, 'Keluarkan dari stok'],
      [/saham serikat/gi, 'stok guild'],
      [/saham guild/gi, 'stok guild'],
      [/saham/gi, 'stok'],
    ])
  }
  if (/\bbuilds?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Membangun yang diterapkan/gi, 'Build yang diterapkan'],
      [/Membangun palet/gi, 'Palet build'],
      [/membangun yang diterapkan/gi, 'build yang diterapkan'],
      [/membangun palet/gi, 'palet build'],
    ])
  }
  if (/\bslots?\b/i.test(source) && !/\btime slots?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Celah/g, 'Slot'],
      [/celah/gi, 'slot'],
    ])
  }
  if (/\bcraft(?:ed|ing|er|ers)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Pengrajin/g, 'Crafter'],
      [/pengrajin/gi, 'crafter'],
      [/Kerajinan/g, 'Crafting'],
      [/kerajinan/gi, 'crafting'],
    ])
  }
  if (/\bapplications?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Aplikasi/g, 'Pendaftaran'],
      [/aplikasi/gi, 'pendaftaran'],
    ])
  }
  if (/\bcaps?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Topi/g, 'Batas'],
      [/topi/gi, 'batas'],
    ])
  }

  return text
}

function reviewTurkish(source, translated) {
  let text = translated

  if (/\bstock\b/i.test(source)) {
    text = replaceAll(text, [
      [/hisse senedi sorunu/gi, 'stoktan teslim'],
      [/lonca hissesinden/gi, 'lonca stokundan'],
      [/lonca hissesi/gi, 'lonca stoku'],
      [/hisse senetleri/gi, 'stoklar'],
      [/hisse senedi/gi, 'stok'],
    ])
  }
  if (/\bbuilds?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Uygulamalı yapı/g, 'Uygulanan build'],
      [/Yapılar/g, 'Buildler'],
      [/Yapı/g, 'Build'],
      [/yapıları/gi, 'buildleri'],
      [/yapılar/gi, 'buildler'],
      [/yapısı/gi, 'buildi'],
      [/yapı/gi, 'build'],
    ])
  }
  if (/\bslots?\b/i.test(source) && !/\btime slots?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Yuvalar/g, 'Slotlar'],
      [/Yuva/g, 'Slot'],
      [/yuvaları/gi, 'slotları'],
      [/yuvalar/gi, 'slotlar'],
      [/yuvaya/gi, 'slota'],
      [/yuvada/gi, 'slotta'],
      [/yuva/gi, 'slot'],
    ])
  }
  if (/\bcraft(?:ed|ing|er|ers)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Zanaatçılar/g, 'Crafterlar'],
      [/Zanaatçı/g, 'Crafter'],
      [/zanaatçılar/gi, 'crafterlar'],
      [/zanaatçı/gi, 'crafter'],
      [/Zanaat/g, 'Craft'],
      [/zanaat/gi, 'craft'],
    ])
  }
  if (/\bofficers?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Memurlar/g, 'Yetkililer'],
      [/Memur/g, 'Yetkili'],
      [/memurlar/gi, 'yetkililer'],
      [/memurun/gi, 'yetkilinin'],
      [/memura/gi, 'yetkiliye'],
      [/memurla/gi, 'yetkiliyle'],
      [/memur/gi, 'yetkili'],
    ])
  }
  if (/\bapplications?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Uygulamalar/g, 'Başvurular'],
      [/Uygulama/g, 'Başvuru'],
      [/uygulamaları/gi, 'başvuruları'],
      [/uygulamalar/gi, 'başvurular'],
      [/uygulamayı/gi, 'başvuruyu'],
      [/uygulama/gi, 'başvuru'],
    ])
  }
  if (/\bclaim(?:s|ed|ing|ants?|ers?)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Öz-iddia/gi, 'Kendi talebi'],
      [/İddialar/g, 'Talepler'],
      [/Iddialar/g, 'Talepler'],
      [/İddia/g, 'Talep'],
      [/Iddia/g, 'Talep'],
      [/iddiaları/gi, 'talepleri'],
      [/iddialar/gi, 'talepler'],
      [/iddiayı/gi, 'talebi'],
      [/iddia/gi, 'talep'],
    ])
  }
  if (/\bcaps?\b/i.test(source)) {
    text = replaceAll(text, [
      [/Kapağı/g, 'Limiti'],
      [/Kapakları/g, 'Limitleri'],
      [/Kapaklar/g, 'Limitler'],
      [/Kapak/g, 'Limit'],
      [/Şapkalar/g, 'Limitler'],
      [/Şapka/g, 'Limit'],
      [/kapakları/gi, 'limitleri'],
      [/kapaklar/gi, 'limitler'],
      [/kapağı/gi, 'limiti'],
      [/kapak/gi, 'limit'],
      [/şapkalar/gi, 'limitler'],
      [/şapka/gi, 'limit'],
    ])
  }

  return text
}

function reviewArabic(source, translated) {
  let text = translated

  if (/\bpart(?:y|ies)\b/i.test(source)) {
    text = replaceAll(text, [
      [/الحفلات/g, 'المجموعات'],
      [/حفلات/g, 'مجموعات'],
      [/الحفلة/g, 'المجموعة'],
      [/حفلة/g, 'مجموعة'],
    ])
  }
  if (/\bstock\b/i.test(source)) {
    text = replaceAll(text, [
      [/إصدار الأسهم/g, 'تسليم من المخزون'],
      [/إصدار أسهم/g, 'تسليم من المخزون'],
      [/الأسهم/g, 'المخزون'],
      [/أسهم/g, 'مخزون'],
      [/السهم/g, 'المخزون'],
      [/سهم/g, 'مخزون'],
    ])
  }
  if (/\bbuilds?\b/i.test(source)) {
    text = replaceAll(text, [
      [/البناء التطبيقي/g, 'الـ Build المطبّق'],
      [/ورقة البناء/g, 'ورقة الـ Build'],
      [/قالب البناء/g, 'قالب الـ Build'],
      [/لوحة البناء/g, 'لوحة الـ Build'],
    ])
  }
  if (/\b(?:slots?|slotting)\b/i.test(source) && !/\btime slots?\b/i.test(source)) {
    text = replaceAll(text, [
      [/الفتحات/g, 'الخانات'],
      [/فتحات/g, 'خانات'],
      [/الفتحة/g, 'الخانة'],
      [/فتحة/g, 'خانة'],
    ])
  }
  if (/\bcraft(?:ed|ing|er|ers)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/الحرفيون/g, 'الصانعون'],
      [/الحرفيين/g, 'الصانعين'],
      [/حرفيين/g, 'صانعين'],
      [/الحرفي/g, 'الصانع'],
      [/حرفي/g, 'صانع'],
      [/الحرفية/g, 'التصنيع'],
      [/حرفية/g, 'تصنيع'],
      [/الحرفة/g, 'التصنيع'],
      [/حرفة/g, 'تصنيع'],
    ])
  }
  if (/\bapplications?\b/i.test(source)) {
    text = replaceAll(text, [
      [/التطبيقات/g, 'الطلبات'],
      [/تطبيقات/g, 'طلبات'],
      [/التطبيق/g, 'الطلب'],
      [/تطبيق/g, 'طلب'],
    ])
  }
  if (/\bclaim(?:s|ed|ing|ants?|ers?)?\b/i.test(source)) {
    text = replaceAll(text, [
      [/الادعاءات/g, 'الطلبات'],
      [/ادعاءات/g, 'طلبات'],
      [/ادعاء/g, 'طلب'],
      [/المطالبات/g, 'الطلبات'],
      [/مطالبات/g, 'طلبات'],
      [/المطالبة/g, 'الطلب'],
      [/مطالبة/g, 'طلب'],
    ])
  }
  if (/\bcaps?\b/i.test(source)) {
    text = replaceAll(text, [
      [/أغطية/g, 'حدود'],
      [/الغطاء/g, 'الحد'],
      [/غطاء/g, 'حد'],
    ])
  }

  return text
}

export function applyMessageReviewRules(locale, source, translated) {
  if (locale === 'zh-Hant') return reviewTraditionalChinese(source, translated)
  if (locale === 'es-ES' || locale === 'es-419') return reviewSpanish(source, translated)
  if (locale === 'pt-BR' || locale === 'pt-PT') return reviewPortuguese(source, translated, locale)
  if (locale === 'pl') return reviewPolish(source, translated)
  if (locale === 'ru') return reviewRussian(source, translated)
  if (locale === 'it') return reviewItalian(source, translated)
  if (locale === 'id') return reviewIndonesian(source, translated)
  if (locale === 'tr') return reviewTurkish(source, translated)
  if (locale === 'ar') return reviewArabic(source, translated)
  if (locale === 'fr') return reviewFrench(source, translated)
  if (locale === 'de') return reviewGerman(source, translated)
  return translated
}
