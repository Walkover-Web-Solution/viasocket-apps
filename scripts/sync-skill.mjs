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
//
// The Claude plugin in plugins/viasocket/ ships the same pages under its own skills/ folder, because a plugin
// folder cannot reach files outside itself. Both copies are written and checked together, and the plugin's
// version in plugins/viasocket/.claude-plugin/plugin.json is raised by one patch each time its copy changes.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = 'https://flow.viasocket.com/skills/viasocket-integrations'
const DOCS = 'https://viasocket.com/docs'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'skills', 'viasocket-integrations')
const pluginManifest = join(root, 'plugins', 'viasocket', '.claude-plugin', 'plugin.json')
const pluginSkillDir = join(root, 'plugins', 'viasocket', 'skills', 'viasocket-integrations')
const outDirs = [outDir, pluginSkillDir]
const check = process.argv.includes('--check')

// What differs between a folder on disk and the pages just built: changed or missing pages, and stale ones.
const diffDir = (dir, files) => {
  const current = new Map()
  const walk = (at, prefix) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(at, entry.name), `${prefix}${entry.name}/`)
      else current.set(`${prefix}${entry.name}`, readFileSync(join(at, entry.name), 'utf8').replace(/\r\n/g, '\n'))
    }
  }
  if (existsSync(dir)) walk(dir, '')
  const changed = [...files].filter(([path, text]) => current.get(path) !== text).map(([path]) => path)
  const stale = [...current.keys()].filter((path) => !files.has(path))
  return { changed, stale }
}

// The directory lists a plugin by its version, so a changed skill copy is a new patch release of the plugin.
const bumpPluginVersion = () => {
  const manifest = JSON.parse(readFileSync(pluginManifest, 'utf8'))
  const parts = String(manifest.version).split('.').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`plugin.json: version "${manifest.version}" is not major.minor.patch`)
  }
  manifest.version = `${parts[0]}.${parts[1]}.${parts[2] + 1}`
  writeFileSync(pluginManifest, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest.version
}

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
    const differing = []
    for (const dir of outDirs) {
      const { changed, stale } = diffDir(dir, files)
      const label = dir === outDir ? 'skills' : 'plugins/viasocket/skills'
      differing.push(...changed.map((p) => `${label}: ${p}`), ...stale.map((p) => `${label}: ${p} (no longer published)`))
    }
    if (differing.length) {
      console.log(`skill copy differs from the published skill ${version}:\n  ${differing.join('\n  ')}`)
      process.exit(1)
    }
    console.log(`skill copy matches the published skill ${version}`)
    return
  }

  // A plugin copy that already existed and now differs is a new release of the plugin; the first write is not.
  const pluginDiff = diffDir(pluginSkillDir, files)
  const pluginChanged = existsSync(pluginSkillDir) && (pluginDiff.changed.length > 0 || pluginDiff.stale.length > 0)

  for (const dir of outDirs) {
    rmSync(dir, { recursive: true, force: true })
    for (const [path, text] of files) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
  }
  console.log(`skill copy ${version}: ${files.size} files written to ${outDirs.length} folders`)
  if (pluginChanged && existsSync(pluginManifest)) console.log(`plugin version raised to ${bumpPluginVersion()}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
