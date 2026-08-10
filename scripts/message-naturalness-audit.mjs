#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const locale = process.argv[2]

const SUSPICIOUS_PATTERNS = {
  'zh-Hant': [
    /regear/i,
    /索賠|股票|工藝|虹吸(?:管|器)/,
    /許可權|訪問|單擊|渠道|全域性/,
    /家庭公會|站點|分類賬|賬戶|招聘/,
    /设置|用户|服务器|数据|视频|战斗|装备|击杀|公会|申请|审核|登录|链接|页面|统计|导入|编辑|删除|奖励|成员|语言|活动|选择|确认|发送|错误|状态|时间|显示|创建|管理权限|消息|搜索|保存|关闭|开启|请求|银币/,
  ],
  'es-ES': [
    /\bfiestas?\b/i,
    /\breclam(?:ación|aciones|ante|antes)\b/i,
    /\b(?:emitir|problema de) acciones\b/i,
    /\bconstrucciones?\b/i,
    /\bcargas? de equipo\b/i,
    /\bartesanías?\b/i,
    /\b(?:capa|láforo) por (?:solicitud|reclamación)\b/i,
  ],
  'es-419': [
    /\bfiestas?\b/i,
    /\breclam(?:ación|aciones|ante|antes)\b/i,
    /\b(?:emitir|problema de) acciones\b/i,
    /\bconstrucciones?\b/i,
    /\bcargas? de equipo\b/i,
    /\bartesanías?\b/i,
    /\b(?:capa|láforo) por (?:solicitud|reclamación)\b/i,
  ],
  'pt-BR': [
    /\bfestas?\b/i,
    /\b(?:reivindica(?:ção|ções|nte|ntes)|reclama(?:ção|ções|nte|ntes)|sinistros?)\b/i,
    /\bconstruções?\b/i,
    /\bcargas? de equipamento\b/i,
    /\bartesanatos?\b/i,
    /\btampas?\b/i,
  ],
  'pt-PT': [
    /\bfestas?\b/i,
    /\b(?:reivindica(?:ção|ções|nte|ntes)|reclama(?:ção|ções|nte|ntes)|sinistros?)\b/i,
    /\bconstruções?\b/i,
    /\bcargas? de equipamento\b/i,
    /\bartesanatos?\b/i,
    /\btampas?\b/i,
  ],
  pl: [
    /\bimprez(?:a|y|ę|ą|ie|ami|ach)?\b/i,
    /\b(?:roszczeni\p{L}*|pretensj\p{L}*)\b/iu,
    /\b(?:emisja|wydaj) akcj\p{L}*\b/iu,
    /\b(?:urzędnik|funkcjonariusz)\p{L}*\b/iu,
    /\b(?:konstrukcja|rzemiosło|rękodzieło|czapka)\p{L}*\b/iu,
  ],
  ru: [
    /вечерин(?:ка|ки|ку|ке|ок|ками|ках)/i,
    /претензи(?:я|и|ю|й|ями|ях)/i,
    /\b(?:выпуск|проблема с) акци/i,
    /\bакци(?:я|и|й|ями|ях)\b/i,
    /\bприложени(?:е|я|й|ями|ях)\b/i,
    /\bсотрудник(?:и|а|ов|у|ам|ом|ами|ах)?\b/i,
    /\b(?:ремесло|ремесла|ремесел|ремесленник\p{L}*)\b/iu,
    /\b(?:крышка|крышки|крышек|шапка|шапки|шапок)\b/i,
  ],
  it: [
    /\bfest(?:a|e)\b/i,
    /\b(?:rivendicazion\p{L}*|reclam(?:o|i))\b/iu,
    /\b(?:emissione|problema) di azioni\b/i,
    /\bcostruzion(?:e|i)\b/i,
    /\bfessur(?:a|e)\b/i,
    /\b(?:artigianato|artigian[oi]\p{L}*)\b/iu,
    /\bfunzionar(?:io|i)\b/i,
    /\b(?:tappo|tappi|cappo)\b/i,
  ],
  id: [
    /\bpesta\b/i,
    /\b(?:mengeluarkan saham|saham (?:serikat|guild))\b/i,
    /\b(?:membangun yang diterapkan|membangun palet)\b/i,
    /\bkerajinan\b/i,
    /\bpengrajin\b/i,
    /\btopi\b/i,
  ],
  tr: [
    /\bhisse sened\p{L}*\b/iu,
    /\b(?:uygulamalı yapı|yapılar?)\b/iu,
    /\byuva(?:lar|ları|ya|da)?\b/iu,
    /\b(?:zanaat|zanaatçı\p{L}*)\b/iu,
    /\bmemur\p{L}*\b/iu,
    /\biddia\p{L}*\b/iu,
    /\b(?:kapak|şapka)\p{L}*\b/iu,
  ],
  ar: [
    /(?:حفلة|حفلات)/,
    /إصدار (?:ال)?أسهم/,
    /(?:البناء التطبيقي|ورقة البناء|قالب البناء|لوحة البناء)/,
    /(?:فتحة|فتحات)/,
    /(?:^|[^\u0600-\u06FF])(?:حرفة|الحرفي|الحرفية)(?=$|[^\u0600-\u06FF])/,
    /(?:المطالبات|مطالبات|ادعاءات)/,
    /غطاء/,
  ],
  fr: [
    /\bfêtes?\b/i,
    /\brobots?\b/i,
    /point de rempl/i,
    /machines? à sous/i,
    /\b(?:casquette|bouchon)s?\b/i,
    /émission d['’]actions?/i,
    /Discord (?:connexion|installation|messages?|rôles?)/i,
    /Killboard (?:décès|informations|vérification)/i,
    /\b(?:regear demandes?|demandes? regear|regear paramètres|regear opérations|regear politiques|regear histoire)\b/i,
  ],
  de: [
    /Alarmpräferen/i,
    /Anrufer/i,
    /\bAnatomie\b/i,
    /\bAnwendungen\b/i,
    /\bAktien(?:ausgabe)?\b/i,
    /\bBastel/i,
    /Beamter/i,
    /Berühmtheitspunkte töten/i,
    /Famfarm/i,
    /Handbuch regear/i,
    /Kampfre(?:t|ier)/i,
    /Krawatte/i,
    /\bParteien?\b/i,
    /Rohfutter/i,
    /Ruhm(?:farm|farming|landwirtschaft| töten)/i,
    /Sterberegister/i,
    /Töten von Ruhm/i,
    /\bTötet\b/i,
    /tötet Ruhm/i,
    /\bVerladungen?\b/i,
    /\bVerschlossen\b/i,
    /Auszahlungssynchronisation/i,
    /\b(?:ab|zurück|aus)gezogene Mitglieder\b/i,
    /Verlobung/i,
  ],
}

if (!Object.hasOwn(SUSPICIOUS_PATTERNS, locale)) {
  console.error(`Usage: node scripts/message-naturalness-audit.mjs <${Object.keys(SUSPICIOUS_PATTERNS).join('|')}>`)
  process.exit(2)
}

function flattenStrings(value, prefix = '', output = []) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenStrings(child, path, output)
    } else if (typeof child === 'string') {
      output.push([path, child])
    }
  }
  return output
}

const document = JSON.parse(
  await readFile(resolve(ROOT, 'src/messages', `${locale}.json`), 'utf8'),
)
const issues = []
for (const [key, text] of flattenStrings(document)) {
  const auditedText = text
    .replace(/`[^`]+`/g, '')
    .replace(/\{[^{}]+\}/g, '')
  for (const pattern of SUSPICIOUS_PATTERNS[locale]) {
    if (pattern.test(auditedText)) {
      issues.push({ key, pattern: pattern.source, text })
      break
    }
  }
}

console.log(JSON.stringify({ locale, issues: issues.length, examples: issues.slice(0, 50) }, null, 2))
if (issues.length > 0) process.exitCode = 1
