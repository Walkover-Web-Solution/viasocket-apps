// Rebuilds skills/viasocket-integrations/ from the skill's source files as viaSocket publishes them, so the
// installed copy (what `npx skills add Walkover-Web-Solution/viasocket-apps` and skills.sh install) never drifts.
//
//   node scripts/sync-skill.mjs            rewrite the folder; exit 0
//   node scripts/sync-skill.mjs --check    exit 1 when the folder differs from the published skill
//
// The source of each page is served as a static file, with its front matter and its `<!--sdk-->` / `<!--http-->`
// variants (https://viasocket.com/docs/skill.md is the same page filled and in one form). The copy is the
// HTTP form: the sdk variant dropped, the markers removed, links to the skill's other pages made relative,
// and the "installed copy" footer added to the root page. Nothing in the folder is edited by hand.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = 'https://flow.viasocket.com/skills/viasocket-integrations'
const DOCS = 'https://viasocket.com/docs'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'skills', 'viasocket-integrations')
const check = process.argv.includes('--check')

const fetchSource = async (path) => {
  const res = await fetch(`${SOURCE}/${path}`, { headers: { 'User-Agent': 'viasocket-apps sync-skill' } })
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return (await res.text()).replace(/\r\n/g, '\n')
}

const REF = /https:\/\/viasocket\.com\/docs\/skill\/([a-z0-9-]+)\.md/g
const refsIn = (text) => [...new Set([...text.matchAll(REF)].map((m) => m[1]))]

const toInstalledCopy = (text, isRoot, version) => {
  let s = text
  // The copy is the HTTP form: drop the package (sdk) variant, keep the http one without its markers.
  s = s.replace(/<!--sdk-->[^\n]*?<!--\/sdk-->/g, '') // inline, mid-sentence
  s = s.replace(/^<!--sdk-->\n[\s\S]*?^<!--\/sdk-->\n\n?/gm, '') // a block on its own lines
  s = s.replace(/^<!--\/?http-->\n\n?/gm, '') // block markers on their own line
  s = s.replace(/<!--\/?http-->/g, '') // inline markers
  // Links to the skill's other pages become relative. A URL inside backticks is a literal the reader may
  // fetch, so it stays; built-in-actions is generated from the live catalog, so the copy keeps its live URL.
  s = s.replace(/(`?)https:\/\/viasocket\.com\/docs\/skill\/([a-z0-9-]+)\.md/g, (m, tick, name) =>
    tick || name === 'built-in-actions' ? m : isRoot ? `references/${name}.md` : `${name}.md`
  )
  s = s.replace(/\n+$/, '\n')
  if (isRoot) {
    s += `\nSkill version \`${version}\`, an installed copy. The skill is served live at ${DOCS}/skill.md (Node.js backend: ${DOCS}/skill.md?format=sdk): fetch it once per session, and when its version line is newer than this one, follow it instead of this copy. Quote the version you followed in every problem report and progress event.\n`
  }
  if (!/END OF PAGE\s*$/.test(s)) s += '\nEND OF PAGE\n'
  return s
}

const main = async () => {
  const rootPage = await fetchSource('SKILL.md')
  const version = rootPage.match(/^\s*version: '([^']+)'/m)?.[1]
  if (!version) throw new Error('SKILL.md: no version line in its front matter')

  // Every reference the root links, and every reference those link, one level deep.
  const names = new Set(refsIn(rootPage))
  const pages = new Map()
  for (const name of [...names]) pages.set(name, await fetchSource(`references/${name}.md`))
  for (const text of [...pages.values()]) {
    for (const name of refsIn(text)) {
      if (names.has(name)) continue
      names.add(name)
      pages.set(name, await fetchSource(`references/${name}.md`))
    }
  }

  const files = new Map()
  files.set('SKILL.md', toInstalledCopy(rootPage, true, version))
  for (const [name, text] of pages) files.set(`references/${name}.md`, toInstalledCopy(text, false, version))

  if (check) {
    const current = new Map()
    const walk = (dir, prefix) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`)
        else current.set(`${prefix}${entry.name}`, readFileSync(join(dir, entry.name), 'utf8').replace(/\r\n/g, '\n'))
      }
    }
    if (existsSync(outDir)) walk(outDir, '')
    const changed = [...files].filter(([path, text]) => current.get(path) !== text).map(([path]) => path)
    const stale = [...current.keys()].filter((path) => !files.has(path))
    if (changed.length || stale.length) {
      console.log(`skill copy differs from the published skill ${version}:\n  ${[...changed, ...stale.map((p) => `${p} (no longer published)`)].join('\n  ')}`)
      process.exit(1)
    }
    console.log(`skill copy matches the published skill ${version}`)
    return
  }

  rmSync(outDir, { recursive: true, force: true })
  for (const [path, text] of files) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true })
    writeFileSync(join(outDir, path), text)
  }
  console.log(`skill copy ${version}: ${files.size} files written`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
