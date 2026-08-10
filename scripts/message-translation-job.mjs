#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyMessageReviewRules } from './message-review-rules.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const MESSAGES_DIR = process.env.AGM_MESSAGES_DIR
  ? resolve(process.env.AGM_MESSAGES_DIR)
  : resolve(ROOT, 'src/messages')
const SOURCE_LOCALE = 'en'
const TARGET_LOCALES = new Set([
  'zh-Hant', 'fr', 'de', 'es-ES', 'es-419', 'pt-BR', 'pt-PT',
  'pl', 'ru', 'it', 'id', 'ar', 'tr',
])

const PRESERVE_PATHS = [
  /^publicGuildProfile\.language_/,
  /^publicGuildDirectory\.languages\./,
  // These labels are Albion build-sheet role identifiers, not UI prose.
  // Existing imports and cross-language build sheets rely on the canonical
  // English names remaining byte-for-byte identical.
  /^slotRole\./,
]

const PROTECTED_PATTERNS = [
  /\b(?:Albion Online|AlbionGuildManager|Albion|Auto[- ]?Regear|Manual Regears?|Crafted Regears?|Death Regears?|Tracked-Death Regears?|Event Regear|Guest Regear|Eligible Regear|Regear Windows?|Battle Mounts?|Black Zones?|Bomb Squads?|Build Sheets?|Callers?|Discord|Fame Farm(?:ing)?|Gear|Ganks?|Ganking|Kill Fame|Killboards?|Small Scale|ZvZ|K\/D|AODP|AGM|regears?|CTA|IP|BZ|PvP|PvE|DPS|AoE|CC|GvG|HCE|shot-?callers?)\b/gi,
  /\{[^{}]+\}/g,
  /<\/?[A-Za-z][^>]*>/g,
  /`[^`]+`/g,
  /https?:\/\/[^\s)\]}]+/g,
  /\/(?:agm|setup)(?:\s+[A-Za-z0-9_-]+)*/gi,
]

const LOCALE_TERM_TRANSLATIONS = {
  en: new Map([
    ['자동 리기어', 'auto regear'],
    ['수동 리기어', 'manual regear'],
    ['제작 리기어', 'crafted regear'],
    ['리기어', 'regear'],
    ['밤스쿼드', 'Bomb Squad'],
    ['블랙존', 'Black Zone'],
    ['빌드표', 'Build Sheet'],
    ['콜러', 'shotcaller'],
    ['킬보드', 'Killboard'],
    ['갱킹', 'Ganking'],
    ['파티', 'party'],
    ['슬롯', 'slot'],
    ['봇', 'bot'],
  ]),
  'zh-Hant': new Map([
    ['battle mount', '戰鬥坐騎'],
    ['battle mounts', '戰鬥坐騎'],
    ['black zone', '黑區'],
    ['black zones', '黑區'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squad'],
    ['build sheet', '配裝表'],
    ['build sheets', '配裝表'],
    ['caller', '指揮'],
    ['callers', '指揮'],
    ['auto-regear', '自動補裝'],
    ['auto regear', '自動補裝'],
    ['manual regear', '手動補裝'],
    ['manual regears', '手動補裝'],
    ['crafted regear', '製作補裝'],
    ['crafted regears', '製作補裝'],
    ['death regear', '死亡補裝'],
    ['death regears', '死亡補裝'],
    ['tracked-death regear', '已追蹤死亡補裝'],
    ['tracked-death regears', '已追蹤死亡補裝'],
    ['event regear', '活動補裝'],
    ['guest regear', '訪客補裝'],
    ['eligible regear', '符合資格的補裝'],
    ['regear window', '補裝時段'],
    ['regear windows', '補裝時段'],
    ['regear', '補裝'],
    ['regears', '補裝'],
    ['fame farm', '刷聲望'],
    ['fame farming', '刷聲望'],
    ['gear', '裝備'],
    ['gank', 'Gank'],
    ['ganks', 'Gank'],
    ['ganking', 'Gank'],
    ['kill fame', '擊殺聲望'],
    ['killboard', '擊殺榜'],
    ['killboards', '擊殺榜'],
    ['small scale', '小型團戰'],
  ]),
  fr: new Map([
    ['bot', 'bot'],
    ['bots', 'bots'],
    ['party', 'groupe'],
    ['parties', 'groupes'],
    ['slot', 'emplacement'],
    ['slots', 'emplacements'],
    ['loadout', 'stuff'],
    ['loadouts', 'stuffs'],
    ['claim', 'demande'],
    ['claims', 'demandes'],
    ['officer', 'officier'],
    ['officers', 'officiers'],
    ['stock', 'stock'],
    ['build', 'build'],
    ['builds', 'builds'],
    ['battle mount', 'monture de combat'],
    ['battle mounts', 'montures de combat'],
    ['black zone', 'zone noire'],
    ['black zones', 'zones noires'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squads'],
    ['build sheet', 'fiche de composition'],
    ['build sheets', 'fiches de composition'],
    ['caller', 'shotcaller'],
    ['callers', 'shotcallers'],
    ['auto-regear', 'regear automatique'],
    ['auto regear', 'regear automatique'],
    ['manual regear', 'regear manuel'],
    ['manual regears', 'regears manuels'],
    ['crafted regear', 'regear crafté'],
    ['crafted regears', 'regears craftés'],
    ['death regear', 'regear après décès'],
    ['death regears', 'regears après décès'],
    ['tracked-death regear', 'regear des morts suivies'],
    ['tracked-death regears', 'regears des morts suivies'],
    ['event regear', 'regear d’événement'],
    ['guest regear', 'regear invité'],
    ['eligible regear', 'regear éligible'],
    ['regear window', 'fenêtre de regear'],
    ['regear windows', 'fenêtres de regear'],
    ['fame farm', 'farm de renommée'],
    ['fame farming', 'farm de renommée'],
    ['gear', 'stuff'],
    ['gank', 'gank'],
    ['ganks', 'ganks'],
    ['ganking', 'ganking'],
    ['kill fame', 'Kill Fame'],
    ['killboard', 'Killboard'],
    ['killboards', 'Killboards'],
    ['small scale', 'Small Scale'],
  ]),
  'es-ES': new Map([
    ['bot', 'bot'],
    ['bots', 'bots'],
    ['party', 'grupo'],
    ['parties', 'grupos'],
    ['slot', 'slot'],
    ['slots', 'slots'],
    ['loadout', 'equipamiento'],
    ['loadouts', 'equipamientos'],
    ['claim', 'solicitud'],
    ['claims', 'solicitudes'],
    ['officer', 'oficial'],
    ['officers', 'oficiales'],
    ['stock', 'stock'],
    ['build', 'build'],
    ['builds', 'builds'],
    ['battle mount', 'montura de combate'],
    ['battle mounts', 'monturas de combate'],
    ['black zone', 'zona negra'],
    ['black zones', 'zonas negras'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squads'],
    ['build sheet', 'hoja de builds'],
    ['build sheets', 'hojas de builds'],
    ['caller', 'shotcaller'],
    ['callers', 'shotcallers'],
    ['auto-regear', 'regear automático'],
    ['auto regear', 'regear automático'],
    ['manual regear', 'regear manual'],
    ['manual regears', 'regears manuales'],
    ['crafted regear', 'regear crafteado'],
    ['crafted regears', 'regears crafteados'],
    ['death regear', 'regear por muerte'],
    ['death regears', 'regears por muerte'],
    ['tracked-death regear', 'regear por muerte registrada'],
    ['tracked-death regears', 'regears por muerte registrada'],
    ['event regear', 'regear de evento'],
    ['guest regear', 'regear de invitado'],
    ['eligible regear', 'regear elegible'],
    ['regear window', 'ventana de regear'],
    ['regear windows', 'ventanas de regear'],
    ['fame farm', 'farmeo de fama'],
    ['fame farming', 'farmeo de fama'],
    ['gear', 'equipo'],
    ['gank', 'gank'],
    ['ganks', 'ganks'],
    ['ganking', 'gankeo'],
    ['kill fame', 'fama de asesinato'],
    ['killboard', 'Killboard'],
    ['killboards', 'Killboards'],
    ['small scale', 'pequeña escala'],
  ]),
  'es-419': new Map([
    ['bot', 'bot'],
    ['bots', 'bots'],
    ['party', 'grupo'],
    ['parties', 'grupos'],
    ['slot', 'slot'],
    ['slots', 'slots'],
    ['loadout', 'equipamiento'],
    ['loadouts', 'equipamientos'],
    ['claim', 'solicitud'],
    ['claims', 'solicitudes'],
    ['officer', 'oficial'],
    ['officers', 'oficiales'],
    ['stock', 'stock'],
    ['build', 'build'],
    ['builds', 'builds'],
    ['battle mount', 'montura de combate'],
    ['battle mounts', 'monturas de combate'],
    ['black zone', 'zona negra'],
    ['black zones', 'zonas negras'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squads'],
    ['build sheet', 'hoja de builds'],
    ['build sheets', 'hojas de builds'],
    ['caller', 'shotcaller'],
    ['callers', 'shotcallers'],
    ['auto-regear', 'regear automático'],
    ['auto regear', 'regear automático'],
    ['manual regear', 'regear manual'],
    ['manual regears', 'regears manuales'],
    ['crafted regear', 'regear crafteado'],
    ['crafted regears', 'regears crafteados'],
    ['death regear', 'regear por muerte'],
    ['death regears', 'regears por muerte'],
    ['tracked-death regear', 'regear por muerte registrada'],
    ['tracked-death regears', 'regears por muerte registrada'],
    ['event regear', 'regear de evento'],
    ['guest regear', 'regear de invitado'],
    ['eligible regear', 'regear elegible'],
    ['regear window', 'ventana de regear'],
    ['regear windows', 'ventanas de regear'],
    ['fame farm', 'farmeo de fama'],
    ['fame farming', 'farmeo de fama'],
    ['gear', 'equipo'],
    ['gank', 'gank'],
    ['ganks', 'ganks'],
    ['ganking', 'gankeo'],
    ['kill fame', 'fama de asesinato'],
    ['killboard', 'Killboard'],
    ['killboards', 'Killboards'],
    ['small scale', 'pequeña escala'],
  ]),
  'pt-BR': new Map([
    ['bot', 'bot'],
    ['bots', 'bots'],
    ['party', 'grupo'],
    ['parties', 'grupos'],
    ['slot', 'slot'],
    ['slots', 'slots'],
    ['loadout', 'equipamento'],
    ['loadouts', 'equipamentos'],
    ['claim', 'solicitação'],
    ['claims', 'solicitações'],
    ['officer', 'oficial'],
    ['officers', 'oficiais'],
    ['stock', 'estoque'],
    ['build', 'build'],
    ['builds', 'builds'],
    ['battle mount', 'montaria de combate'],
    ['battle mounts', 'montarias de combate'],
    ['black zone', 'zona negra'],
    ['black zones', 'zonas negras'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squads'],
    ['build sheet', 'planilha de builds'],
    ['build sheets', 'planilhas de builds'],
    ['caller', 'shotcaller'],
    ['callers', 'shotcallers'],
    ['auto-regear', 'regear automático'],
    ['auto regear', 'regear automático'],
    ['manual regear', 'regear manual'],
    ['manual regears', 'regears manuais'],
    ['crafted regear', 'regear de craft'],
    ['crafted regears', 'regears de craft'],
    ['death regear', 'regear por morte'],
    ['death regears', 'regears por morte'],
    ['tracked-death regear', 'regear por morte registrada'],
    ['tracked-death regears', 'regears por morte registrada'],
    ['event regear', 'regear de evento'],
    ['guest regear', 'regear de convidado'],
    ['eligible regear', 'regear elegível'],
    ['regear window', 'janela de regear'],
    ['regear windows', 'janelas de regear'],
    ['fame farm', 'farm de fama'],
    ['fame farming', 'farm de fama'],
    ['gear', 'equipamento'],
    ['gank', 'gank'],
    ['ganks', 'ganks'],
    ['ganking', 'gank'],
    ['kill fame', 'fama de abate'],
    ['killboard', 'Killboard'],
    ['killboards', 'Killboards'],
    ['small scale', 'pequena escala'],
  ]),
  'pt-PT': new Map([
    ['bot', 'bot'],
    ['bots', 'bots'],
    ['party', 'grupo'],
    ['parties', 'grupos'],
    ['slot', 'slot'],
    ['slots', 'slots'],
    ['loadout', 'equipamento'],
    ['loadouts', 'equipamentos'],
    ['claim', 'pedido'],
    ['claims', 'pedidos'],
    ['officer', 'oficial'],
    ['officers', 'oficiais'],
    ['stock', 'stock'],
    ['build', 'build'],
    ['builds', 'builds'],
    ['battle mount', 'montada de combate'],
    ['battle mounts', 'montadas de combate'],
    ['black zone', 'zona negra'],
    ['black zones', 'zonas negras'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squads'],
    ['build sheet', 'folha de builds'],
    ['build sheets', 'folhas de builds'],
    ['caller', 'shotcaller'],
    ['callers', 'shotcallers'],
    ['auto-regear', 'regear automático'],
    ['auto regear', 'regear automático'],
    ['manual regear', 'regear manual'],
    ['manual regears', 'regears manuais'],
    ['crafted regear', 'regear de craft'],
    ['crafted regears', 'regears de craft'],
    ['death regear', 'regear por morte'],
    ['death regears', 'regears por morte'],
    ['tracked-death regear', 'regear por morte registada'],
    ['tracked-death regears', 'regears por morte registada'],
    ['event regear', 'regear de evento'],
    ['guest regear', 'regear de convidado'],
    ['eligible regear', 'regear elegível'],
    ['regear window', 'janela de regear'],
    ['regear windows', 'janelas de regear'],
    ['fame farm', 'farm de fama'],
    ['fame farming', 'farm de fama'],
    ['gear', 'equipamento'],
    ['gank', 'gank'],
    ['ganks', 'ganks'],
    ['ganking', 'gank'],
    ['kill fame', 'fama de abate'],
    ['killboard', 'Killboard'],
    ['killboards', 'Killboards'],
    ['small scale', 'pequena escala'],
  ]),
  pl: new Map([
    ['bot', 'bot'],
    ['bots', 'boty'],
    ['party', 'grupa'],
    ['parties', 'grupy'],
    ['slot', 'slot'],
    ['slots', 'sloty'],
    ['loadout', 'zestaw wyposażenia'],
    ['loadouts', 'zestawy wyposażenia'],
    ['claim', 'wniosek'],
    ['claims', 'wnioski'],
    ['officer', 'oficer'],
    ['officers', 'oficerowie'],
    ['stock', 'zapasy'],
    ['build', 'build'],
    ['builds', 'buildy'],
    ['battle mount', 'wierzchowiec bojowy'],
    ['battle mounts', 'wierzchowce bojowe'],
    ['black zone', 'czarna strefa'],
    ['black zones', 'czarne strefy'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squads'],
    ['build sheet', 'arkusz buildów'],
    ['build sheets', 'arkusze buildów'],
    ['caller', 'caller'],
    ['callers', 'callerzy'],
    ['auto-regear', 'automatyczny regear'],
    ['auto regear', 'automatyczny regear'],
    ['manual regear', 'ręczny regear'],
    ['manual regears', 'ręczne regeary'],
    ['crafted regear', 'regear z craftingu'],
    ['crafted regears', 'regeary z craftingu'],
    ['death regear', 'regear za śmierć'],
    ['death regears', 'regeary za śmierć'],
    ['tracked-death regear', 'regear za zarejestrowaną śmierć'],
    ['tracked-death regears', 'regeary za zarejestrowaną śmierć'],
    ['event regear', 'regear z wydarzenia'],
    ['guest regear', 'regear gościa'],
    ['eligible regear', 'kwalifikujący się regear'],
    ['regear window', 'okno regear'],
    ['regear windows', 'okna regear'],
    ['fame farm', 'fame farm'],
    ['fame farming', 'fame farm'],
    ['gear', 'ekwipunek'],
    ['gank', 'gank'],
    ['ganks', 'ganki'],
    ['ganking', 'gankowanie'],
    ['kill fame', 'sława za zabójstwo'],
    ['killboard', 'Killboard'],
    ['killboards', 'Killboardy'],
    ['small scale', 'Small Scale'],
  ]),
  ru: new Map([
    ['bot', 'бот'],
    ['bots', 'боты'],
    ['party', 'группа'],
    ['parties', 'группы'],
    ['slot', 'слот'],
    ['slots', 'слоты'],
    ['loadout', 'комплект снаряжения'],
    ['loadouts', 'комплекты снаряжения'],
    ['claim', 'заявка'],
    ['claims', 'заявки'],
    ['officer', 'офицер'],
    ['officers', 'офицеры'],
    ['stock', 'запасы'],
    ['build', 'билд'],
    ['builds', 'билды'],
    ['battle mount', 'боевой маунт'],
    ['battle mounts', 'боевые маунты'],
    ['black zone', 'чёрная зона'],
    ['black zones', 'чёрные зоны'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squad'],
    ['build sheet', 'таблица билдов'],
    ['build sheets', 'таблицы билдов'],
    ['caller', 'коллер'],
    ['callers', 'коллеры'],
    ['auto-regear', 'автоматический регир'],
    ['auto regear', 'автоматический регир'],
    ['manual regear', 'ручной регир'],
    ['manual regears', 'ручные региры'],
    ['crafted regear', 'крафтовый регир'],
    ['crafted regears', 'крафтовые региры'],
    ['death regear', 'регир за смерть'],
    ['death regears', 'региры за смерть'],
    ['tracked-death regear', 'регир за отслеженную смерть'],
    ['tracked-death regears', 'региры за отслеженную смерть'],
    ['event regear', 'регир события'],
    ['guest regear', 'регир гостя'],
    ['eligible regear', 'доступный регир'],
    ['regear window', 'окно регира'],
    ['regear windows', 'окна регира'],
    ['fame farm', 'фарм славы'],
    ['fame farming', 'фарм славы'],
    ['gear', 'снаряжение'],
    ['gank', 'ганк'],
    ['ganks', 'ганки'],
    ['ganking', 'ганк'],
    ['kill fame', 'слава за убийство'],
    ['killboard', 'килборд'],
    ['killboards', 'килборды'],
    ['small scale', 'Small Scale'],
  ]),
  it: new Map([
    ['bot', 'bot'],
    ['bots', 'bot'],
    ['party', 'gruppo'],
    ['parties', 'gruppi'],
    ['slot', 'slot'],
    ['slots', 'slot'],
    ['loadout', 'equipaggiamento'],
    ['loadouts', 'equipaggiamenti'],
    ['claim', 'richiesta'],
    ['claims', 'richieste'],
    ['officer', 'ufficiale'],
    ['officers', 'ufficiali'],
    ['stock', 'scorte'],
    ['build', 'build'],
    ['builds', 'build'],
    ['battle mount', 'mount da battaglia'],
    ['battle mounts', 'mount da battaglia'],
    ['black zone', 'zona nera'],
    ['black zones', 'zone nere'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squad'],
    ['build sheet', 'foglio build'],
    ['build sheets', 'fogli build'],
    ['caller', 'shotcaller'],
    ['callers', 'shotcaller'],
    ['auto-regear', 'regear automatico'],
    ['auto regear', 'regear automatico'],
    ['manual regear', 'regear manuale'],
    ['manual regears', 'regear manuali'],
    ['crafted regear', 'regear da crafting'],
    ['crafted regears', 'regear da crafting'],
    ['death regear', 'regear per morte'],
    ['death regears', 'regear per morte'],
    ['tracked-death regear', 'regear per morte tracciata'],
    ['tracked-death regears', 'regear per morti tracciate'],
    ['event regear', 'regear evento'],
    ['guest regear', 'regear ospite'],
    ['eligible regear', 'regear idoneo'],
    ['regear window', 'finestra di regear'],
    ['regear windows', 'finestre di regear'],
    ['fame farm', 'Fame Farm'],
    ['fame farming', 'Fame Farm'],
    ['gear', 'equipaggiamento'],
    ['gank', 'gank'],
    ['ganks', 'gank'],
    ['ganking', 'ganking'],
    ['kill fame', 'fama da uccisione'],
    ['killboard', 'Killboard'],
    ['killboards', 'Killboard'],
    ['small scale', 'Small Scale'],
  ]),
  id: new Map([
    ['bot', 'bot'],
    ['bots', 'bot'],
    ['party', 'party'],
    ['parties', 'party'],
    ['slot', 'slot'],
    ['slots', 'slot'],
    ['loadout', 'loadout'],
    ['loadouts', 'loadout'],
    ['claim', 'klaim'],
    ['claims', 'klaim'],
    ['officer', 'officer'],
    ['officers', 'officer'],
    ['stock', 'stok'],
    ['build', 'build'],
    ['builds', 'build'],
    ['battle mount', 'mount tempur'],
    ['battle mounts', 'mount tempur'],
    ['black zone', 'Black Zone'],
    ['black zones', 'Black Zone'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squad'],
    ['build sheet', 'lembar build'],
    ['build sheets', 'lembar build'],
    ['caller', 'shotcaller'],
    ['callers', 'shotcaller'],
    ['auto-regear', 'regear otomatis'],
    ['auto regear', 'regear otomatis'],
    ['manual regear', 'regear manual'],
    ['manual regears', 'regear manual'],
    ['crafted regear', 'regear hasil crafting'],
    ['crafted regears', 'regear hasil crafting'],
    ['death regear', 'regear kematian'],
    ['death regears', 'regear kematian'],
    ['tracked-death regear', 'regear kematian terlacak'],
    ['tracked-death regears', 'regear kematian terlacak'],
    ['event regear', 'regear event'],
    ['guest regear', 'regear tamu'],
    ['eligible regear', 'regear yang memenuhi syarat'],
    ['regear window', 'periode regear'],
    ['regear windows', 'periode regear'],
    ['fame farm', 'Fame Farm'],
    ['fame farming', 'Fame Farm'],
    ['gear', 'gear'],
    ['gank', 'gank'],
    ['ganks', 'gank'],
    ['ganking', 'ganking'],
    ['kill fame', 'Kill Fame'],
    ['killboard', 'Killboard'],
    ['killboards', 'Killboard'],
    ['small scale', 'Small Scale'],
  ]),
  ar: new Map([
    ['bot', 'بوت'],
    ['bots', 'بوتات'],
    ['party', 'مجموعة'],
    ['parties', 'مجموعات'],
    ['slot', 'خانة'],
    ['slots', 'خانات'],
    ['loadout', 'تجهيز'],
    ['loadouts', 'تجهيزات'],
    ['claim', 'طلب'],
    ['claims', 'طلبات'],
    ['officer', 'ضابط'],
    ['officers', 'ضباط'],
    ['stock', 'المخزون'],
    ['build', 'Build'],
    ['builds', 'Builds'],
    ['battle mount', 'مطيّة قتالية'],
    ['battle mounts', 'مطايا قتالية'],
    ['black zone', 'المنطقة السوداء'],
    ['black zones', 'المناطق السوداء'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squad'],
    ['build sheet', 'جدول Builds'],
    ['build sheets', 'جداول Builds'],
    ['caller', 'Shotcaller'],
    ['callers', 'Shotcallers'],
    ['auto-regear', 'regear تلقائي'],
    ['auto regear', 'regear تلقائي'],
    ['manual regear', 'regear يدوي'],
    ['manual regears', 'regear يدوي'],
    ['crafted regear', 'regear مصنّع'],
    ['crafted regears', 'regear مصنّع'],
    ['death regear', 'regear بعد الموت'],
    ['death regears', 'regear بعد الموت'],
    ['tracked-death regear', 'regear للوفاة المتعقبة'],
    ['tracked-death regears', 'regear للوفيات المتعقبة'],
    ['event regear', 'regear للفعالية'],
    ['guest regear', 'regear للضيف'],
    ['eligible regear', 'regear مؤهل'],
    ['regear window', 'فترة regear'],
    ['regear windows', 'فترات regear'],
    ['fame farm', 'Fame Farm'],
    ['fame farming', 'Fame Farm'],
    ['gear', 'Gear'],
    ['gank', 'Gank'],
    ['ganks', 'Ganks'],
    ['ganking', 'Ganking'],
    ['kill fame', 'Kill Fame'],
    ['killboard', 'Killboard'],
    ['killboards', 'Killboards'],
    ['small scale', 'Small Scale'],
  ]),
  tr: new Map([
    ['bot', 'bot'],
    ['bots', 'botlar'],
    ['party', 'parti'],
    ['parties', 'partiler'],
    ['slot', 'slot'],
    ['slots', 'slotlar'],
    ['loadout', 'ekipman seti'],
    ['loadouts', 'ekipman setleri'],
    ['claim', 'talep'],
    ['claims', 'talepler'],
    ['officer', 'yetkili'],
    ['officers', 'yetkililer'],
    ['stock', 'stok'],
    ['build', 'build'],
    ['builds', 'buildler'],
    ['battle mount', 'savaş bineği'],
    ['battle mounts', 'savaş binekleri'],
    ['black zone', 'Black Zone'],
    ['black zones', 'Black Zone'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squad'],
    ['build sheet', 'build tablosu'],
    ['build sheets', 'build tabloları'],
    ['caller', 'shotcaller'],
    ['callers', 'shotcallerlar'],
    ['auto-regear', 'otomatik regear'],
    ['auto regear', 'otomatik regear'],
    ['manual regear', 'manuel regear'],
    ['manual regears', 'manuel regearlar'],
    ['crafted regear', 'craft regear'],
    ['crafted regears', 'craft regearlar'],
    ['death regear', 'ölüm regearı'],
    ['death regears', 'ölüm regearları'],
    ['tracked-death regear', 'takip edilen ölüm regearı'],
    ['tracked-death regears', 'takip edilen ölüm regearları'],
    ['event regear', 'etkinlik regearı'],
    ['guest regear', 'misafir regearı'],
    ['eligible regear', 'uygun regear'],
    ['regear window', 'regear aralığı'],
    ['regear windows', 'regear aralıkları'],
    ['fame farm', 'Fame Farm'],
    ['fame farming', 'Fame Farm'],
    ['gear', 'ekipman'],
    ['gank', 'gank'],
    ['ganks', 'gankler'],
    ['ganking', 'gank'],
    ['kill fame', 'öldürme şöhreti'],
    ['killboard', 'Killboard'],
    ['killboards', 'Killboard'],
    ['small scale', 'Small Scale'],
  ]),
  de: new Map([
    ['battle mount', 'Battlemount'],
    ['battle mounts', 'Battlemounts'],
    ['black zone', 'Blackzone'],
    ['black zones', 'Blackzones'],
    ['bomb squad', 'Bomb Squad'],
    ['bomb squads', 'Bomb Squads'],
    ['build sheet', 'Build-Sheet'],
    ['build sheets', 'Build-Sheets'],
    ['caller', 'Caller'],
    ['callers', 'Caller'],
    ['auto-regear', 'Auto-Regear'],
    ['auto regear', 'Auto-Regear'],
    ['manual regear', 'manuelles Regear'],
    ['manual regears', 'manuelle Regears'],
    ['crafted regear', 'Crafting-Regear'],
    ['crafted regears', 'Crafting-Regears'],
    ['death regear', 'Todes-Regear'],
    ['death regears', 'Todes-Regears'],
    ['tracked-death regear', 'Regear für erfasste Tode'],
    ['tracked-death regears', 'Regears für erfasste Tode'],
    ['event regear', 'Event-Regear'],
    ['guest regear', 'Gäste-Regear'],
    ['eligible regear', 'zulässiges Regear'],
    ['regear window', 'Regear-Fenster'],
    ['regear windows', 'Regear-Fenster'],
    ['fame farm', 'Fame-Farm'],
    ['fame farming', 'Fame-Farming'],
    ['gear', 'Gear'],
    ['gank', 'Gank'],
    ['ganks', 'Ganks'],
    ['ganking', 'Ganking'],
    ['kill fame', 'Kill Fame'],
    ['killboard', 'Killboard'],
    ['killboards', 'Killboards'],
    ['small scale', 'Small Scale'],
  ]),
}

export function localizeProtectedValue(value, locale) {
  return LOCALE_TERM_TRANSLATIONS[locale]?.get(value.toLowerCase()) ?? value
}

export function normalizeProtectedTokens(translated) {
  return translated
    .replace(
      /_{1,2}(?:AGM|RUPS)_(?:TOKEN(?:[_\s]+[\p{L}]+)?|[\p{L}]+)_(\d{3,4})_{1,2}/giu,
      (_match, digits) => `__AGM_TOKEN_${String(Number(digits)).padStart(4, '0')}__`,
    )
    .replace(
      /_{1,2}TOKEN_AGM_(\d{3,4})_{1,2}/giu,
      (_match, digits) => `__AGM_TOKEN_${String(Number(digits)).padStart(4, '0')}__`,
    )
}

function usage() {
  console.error('Usage: node scripts/message-translation-job.mjs <prepare|apply|audit> <locale>')
  process.exit(2)
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function readReviewedOverrides(locale) {
  const path = resolve(MESSAGES_DIR, 'reviewed-overrides', `${locale}.json`)
  try {
    return await readJson(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

function flattenStrings(value, prefix = '', output = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenStrings(child, path, output)
    } else if (typeof child === 'string') {
      output.set(path, child)
    }
  }
  return output
}

function setStringAtPath(document, path, value) {
  const segments = path.split('.')
  let cursor = document
  for (const segment of segments.slice(0, -1)) cursor = cursor[segment]
  cursor[segments.at(-1)] = value
}

function protectText(source) {
  const tokenValues = []
  let text = source
  for (const pattern of PROTECTED_PATTERNS) {
    text = text.replace(pattern, (match) => {
      const index = tokenValues.push(match) - 1
      return `__AGM_TOKEN_${String(index).padStart(4, '0')}__`
    })
  }
  return { text, tokenValues }
}

function restoreText(translated, tokenValues, key, locale) {
  let text = normalizeProtectedTokens(translated)
  const nestedTokenIndexes = new Set()
  for (const value of tokenValues) {
    for (const match of value.matchAll(/__AGM_TOKEN_(\d{4})__/g)) {
      nestedTokenIndexes.add(Number(match[1]))
    }
  }
  // Protection passes can intentionally nest tokens (for example `regear`
  // inside an ICU placeholder or `agm` inside a slash command). Restore the
  // outermost, most recently-created token first so its inner token becomes
  // visible before that earlier token is validated and restored.
  for (let index = tokenValues.length - 1; index >= 0; index -= 1) {
    const token = `__AGM_TOKEN_${String(index).padStart(4, '0')}__`
    const occurrences = text.split(token).length - 1
    if (occurrences !== 1) {
      throw new Error(`${key}: protected token ${token} occurred ${occurrences} times`)
    }
    const value = nestedTokenIndexes.has(index)
      ? tokenValues[index]
      : localizeProtectedValue(tokenValues[index], locale)
    text = text.replace(token, value)
  }
  if (/__AGM_TOKEN_\d{4}__/.test(text)) {
    throw new Error(`${key}: unexpected protected token remained`)
  }
  return text
}

function isTranslatable(text, protectedText, path) {
  if (PRESERVE_PATHS.some((pattern) => pattern.test(path))) return false
  if (!text.trim()) return false
  const withoutTokens = protectedText.replace(/__AGM_TOKEN_\d{4}__/g, '')
  return /\p{L}/u.test(withoutTokens)
}

function pathsFor(locale) {
  const tempDirectory = process.env.AGM_TRANSLATION_TMP_DIR || '/tmp'
  const stem = resolve(tempDirectory, `agm-message-translation-${locale}`)
  return {
    source: resolve(MESSAGES_DIR, `${SOURCE_LOCALE}.json`),
    target: resolve(MESSAGES_DIR, `${locale}.json`),
    job: `${stem}-job.json`,
    result: `${stem}-result.json`,
    error: `${stem}-error.txt`,
  }
}

function digestJob(locale, items) {
  return createHash('sha256')
    .update(JSON.stringify({ locale, items }))
    .digest('hex')
}

async function prepare(locale) {
  const paths = pathsFor(locale)
  const [sourceDocument, targetDocument] = await Promise.all([
    readJson(paths.source),
    readJson(paths.target),
  ])
  const source = flattenStrings(sourceDocument)
  const target = flattenStrings(targetDocument)
  const items = []

  for (const [key, sourceText] of source) {
    if (!target.has(key)) throw new Error(`${locale}: missing target key ${key}`)
    const { text, tokenValues } = protectText(sourceText)
    if (!isTranslatable(sourceText, text, key)) continue
    items.push({ id: String(items.length), key, text, tokenValues })
  }

  const jobDigest = digestJob(locale, items)
  await writeFile(paths.job, `${JSON.stringify({ locale, jobDigest, items }, null, 2)}\n`)
  console.log(JSON.stringify({ locale, strings: source.size, jobs: items.length, jobDigest, ...paths }))
}

async function apply(locale) {
  const paths = pathsFor(locale)
  const [sourceDocument, targetDocument, job, result, reviewedOverrides] = await Promise.all([
    readJson(paths.source),
    readJson(paths.target),
    readJson(paths.job),
    readJson(paths.result),
    readReviewedOverrides(locale),
  ])
  const source = flattenStrings(sourceDocument)
  const expectedDigest = digestJob(job.locale, job.items)
  if (job.locale !== locale || job.jobDigest !== expectedDigest) {
    throw new Error(`${locale}: translation job digest is missing or invalid; prepare and translate again`)
  }
  if (result.locale !== locale || result.jobDigest !== job.jobDigest) {
    throw new Error(`${locale}: translation result does not match the prepared job; translate again`)
  }
  if (result.items.length !== job.items.length) {
    throw new Error(`${locale}: expected ${job.items.length} results, received ${result.items.length}`)
  }
  const resultById = new Map(result.items.map((item) => [item.id, item.text]))
  const translatedKeys = new Set(job.items.map((item) => item.key))
  if (resultById.size !== result.items.length) {
    throw new Error(`${locale}: translation result contains duplicate ids`)
  }

  for (const [key, reviewedText] of Object.entries(reviewedOverrides)) {
    if (!source.has(key)) throw new Error(`${locale}: reviewed override references unknown key ${key}`)
    if (typeof reviewedText !== 'string' || !reviewedText.trim()) {
      throw new Error(`${locale}: reviewed override must be a non-empty string for ${key}`)
    }
  }

  for (const item of job.items) {
    if (Object.hasOwn(reviewedOverrides, item.key)) {
      setStringAtPath(targetDocument, item.key, reviewedOverrides[item.key])
      continue
    }
    const translated = resultById.get(item.id)
    if (typeof translated !== 'string' || !translated.trim()) {
      throw new Error(`${locale}: missing translation result for ${item.key}`)
    }
    setStringAtPath(
      targetDocument,
      item.key,
      applyMessageReviewRules(
        locale,
        source.get(item.key),
        restoreText(translated.trim(), item.tokenValues, item.key, locale),
      ),
    )
  }

  for (const [key, sourceText] of source) {
    if (PRESERVE_PATHS.some((pattern) => pattern.test(key))) {
      setStringAtPath(targetDocument, key, sourceText)
      continue
    }
    if (!translatedKeys.has(key)) {
      const { text: protectedText, tokenValues } = protectText(sourceText)
      const localizedText = tokenValues.length > 0
        ? applyMessageReviewRules(
            locale,
            sourceText,
            restoreText(protectedText, tokenValues, key, locale),
          )
        : sourceText
      setStringAtPath(targetDocument, key, localizedText)
    }
  }
  for (const [key, reviewedText] of Object.entries(reviewedOverrides)) {
    setStringAtPath(targetDocument, key, reviewedText)
  }

  await writeFile(paths.target, `${JSON.stringify(targetDocument, null, 2)}\n`)
  console.log(JSON.stringify({
    locale,
    applied: job.items.length,
    reviewedOverrides: Object.keys(reviewedOverrides).length,
    target: paths.target,
  }))
}

async function audit(locale) {
  const paths = pathsFor(locale)
  const [sourceDocument, targetDocument] = await Promise.all([
    readJson(paths.source),
    readJson(paths.target),
  ])
  const source = flattenStrings(sourceDocument)
  const target = flattenStrings(targetDocument)
  let identical = 0
  let placeholderMismatch = 0
  const examples = []

  for (const [key, sourceText] of source) {
    const targetText = target.get(key)
    if (targetText === sourceText && !PRESERVE_PATHS.some((pattern) => pattern.test(key))) {
      identical += 1
      if (examples.length < 20) examples.push(key)
    }
    const sourceTokens = sourceText.match(/\{[^{}]+\}/g) ?? []
    const targetTokens = targetText?.match(/\{[^{}]+\}/g) ?? []
    if (JSON.stringify(sourceTokens.sort()) !== JSON.stringify(targetTokens.sort())) {
      placeholderMismatch += 1
    }
  }

  console.log(JSON.stringify({
    locale,
    strings: source.size,
    identical,
    identicalPercent: Number((identical / source.size * 100).toFixed(2)),
    placeholderMismatch,
    examples,
  }, null, 2))
  if (placeholderMismatch > 0) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, locale] = process.argv.slice(2)
  if (!['prepare', 'apply', 'audit'].includes(command) || !TARGET_LOCALES.has(locale)) usage()

  if (command === 'prepare') await prepare(locale)
  if (command === 'apply') await apply(locale)
  if (command === 'audit') await audit(locale)
}
