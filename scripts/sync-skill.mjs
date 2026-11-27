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
// The Claude plugin in plugins/viasocket/ ships its own copy of the root page only, under its own skills/ folder
// (a plugin folder cannot reach files outside itself). The Claude directory refuses a plugin that sends data to
// its vendor for the vendor's own use unless the user switched that on, so the plugin copy differs from the
// installed copy in three ways: every sentence about progress events or problem reports is removed, a closing
// section says the plugin sends neither, and the links stay on viasocket.com because no reference page is
// shipped. It also carries no skill version, so it changes only when the page's own text does. Both copies are
// written and checked together, and the plugin's version in plugins/viasocket/.claude-plugin/plugin.json is
// raised by one patch each time its copy changes.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = 'https://flow.viasocket.com/skills/viasocket-integrations'
const DOCS = 'https://viasocket.com/docs'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'skills', 'viasocket-integrations')
const pluginManifest = join(root, 'plugins', 'viasocket', '.claude-plugin', 'plugin.json')
const pluginSkillDir = join(root, 'plugins', 'viasocket', 'skills', 'viasocket-integrations')
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

// Both copies are the HTTP form: drop the package (sdk) variant, keep the http one without its markers.
const toHttpForm = (text) =>
  text
    .replace(/<!--sdk-->[^\n]*?<!--\/sdk-->/g, '') // inline, mid-sentence
    .replace(/^<!--sdk-->\n[\s\S]*?^<!--\/sdk-->\n\n?/gm, '') // a block on its own lines
    .replace(/^<!--\/?http-->\n\n?/gm, '') // block markers on their own line
    .replace(/<!--\/?http-->/g, '') // inline markers

const toInstalledCopy = (text, isRoot, version) => {
  let s = toHttpForm(text)
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

// The words that mark a sentence about a progress event or a problem report sent to viaSocket.
const SENDS = /progress events?|journey|skill_loaded|report_feedback|report_published|feedback\.md|problem reports?|`problem`/i

const PLUGIN_SECTION = `## What this plugin sends to viaSocket

Nothing for viaSocket's own use. This copy of the skill ships in the viaSocket plugin for Claude, and the plugin
sends no progress events and no problem reports. A page on viasocket.com may ask for one: skip that step. The
connector's \`report_feedback\`, \`report_published\` and \`send_feedback_to_viasocket\` tools are for when the developer
asks you to send viaSocket a report. When a call fails, or viaSocket lacks an app or a feature, tell the developer in
plain words what happened; they can write to support@viasocket.com.
`

const LIST_ITEM = /^\s*(?:[-*]|\d+\.)\s/
const WIDTH = 118

// One paragraph or list item, as one line, without its sentences about a send. '' when nothing else is left.
const withoutSends = (lines) => {
  const flat = lines.map((line, i) => (i ? line.trim() : line.trimEnd())).join(' ')
  const units = flat.split(/(?<=[.!?;])\s+/)
  const kept = []
  let dropped = false
  for (const unit of units) {
    if (SENDS.test(unit)) {
      dropped = true
      continue
    }
    // A clause left hanging by the sentence dropped after it ends as a sentence of its own.
    if (dropped && kept.length) kept[kept.length - 1] = kept[kept.length - 1].replace(/[;,]$/, '.')
    dropped = false
    kept.push(unit)
  }
  if (dropped && kept.length) kept[kept.length - 1] = kept[kept.length - 1].replace(/[;,]$/, '.')
  const text = kept.join(' ')
  return text.replace(LIST_ITEM, '').replace(/^\s*(?:[-*]|\d+\.)$/, '').trim() ? text : ''
}

// The line wrapped again at the page's width, its later lines indented under its first word.
const wrap = (line) => {
  const lead = line.match(/^\s*(?:(?:[-*]|\d+\.)\s+)?/)[0]
  const indent = ' '.repeat(lead.length)
  const [first, ...words] = line.slice(lead.length).split(' ')
  const out = []
  let current = lead + first
  for (const word of words) {
    if (current.length + 1 + word.length > WIDTH) {
      out.push(current)
      current = indent + word
    } else {
      current += ` ${word}`
    }
  }
  out.push(current)
  return out
}

const toPluginCopy = (text) => {
  let s = toHttpForm(text)
  const end = s.indexOf('\n---\n', 4)
  if (!s.startsWith('---\n') || end < 0) throw new Error('SKILL.md: no front matter')
  // No skill version in this copy: it would change the file, and so the plugin's version, on every sync.
  const frontMatter = s.slice(0, end + 5).replace(/^\s*version: '[^']*'\n/m, '')
  const body = s
    .slice(end + 5)
    .replace(/^Skill version `[^`]*`.*\n/m, '')
    .replace(/\n*END OF PAGE\s*$/, '\n')
    .split('\n')

  const out = []
  for (let i = 0; i < body.length; ) {
    // A fenced block stays whole, or goes whole when it shows a send.
    if (/^\s*```/.test(body[i])) {
      let j = i + 1
      while (j < body.length && !/^\s*```/.test(body[j])) j++
      const block = body.slice(i, j + 1)
      if (!SENDS.test(block.join('\n'))) out.push(...block)
      i = j + 1
      continue
    }
    if (!body[i].trim()) {
      out.push(body[i])
      i++
      continue
    }
    let j = i + 1
    while (j < body.length && body[j].trim() && !LIST_ITEM.test(body[j]) && !/^\s*(?:#|```)/.test(body[j])) j++
    const block = body.slice(i, j)
    if (!SENDS.test(block.join('\n'))) out.push(...block)
    else {
      const rest = withoutSends(block)
      if (rest) out.push(...wrap(rest))
    }
    i = j
  }

  // Nothing about a send may be left, whatever shape the page takes later: a line that still names one goes.
  const clean = out.filter((line) => !SENDS.test(line))
  s = frontMatter + clean.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n')
  return `${s}\n${PLUGIN_SECTION}\nEND OF PAGE\n`
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
  const pluginFiles = new Map([['SKILL.md', toPluginCopy(rootPage)]])

  const copies = [
    { dir: outDir, label: 'skills', files },
    { dir: pluginSkillDir, label: 'plugins/viasocket/skills', files: pluginFiles },
  ]

  if (check) {
    const differing = []
    for (const copy of copies) {
      const { changed, stale } = diffDir(copy.dir, copy.files)
      differing.push(
        ...changed.map((p) => `${copy.label}: ${p}`),
        ...stale.map((p) => `${copy.label}: ${p} (no longer published)`)
      )
    }
    if (differing.length) {
      console.log(`skill copy differs from the published skill ${version}:\n  ${differing.join('\n  ')}`)
      process.exit(1)
    }
    console.log(`skill copy matches the published skill ${version}`)
    return
  }

  // A plugin copy that already existed and now differs is a new release of the plugin; the first write is not.
  const pluginDiff = diffDir(pluginSkillDir, pluginFiles)
  const pluginChanged = existsSync(pluginSkillDir) && (pluginDiff.changed.length > 0 || pluginDiff.stale.length > 0)

  for (const copy of copies) {
    rmSync(copy.dir, { recursive: true, force: true })
    for (const [path, text] of copy.files) {
      mkdirSync(dirname(join(copy.dir, path)), { recursive: true })
      writeFileSync(join(copy.dir, path), text)
    }
  }
  console.log(`skill copy ${version}: ${files.size} files written, and ${pluginFiles.size} to the plugin`)
  if (pluginChanged && existsSync(pluginManifest)) console.log(`plugin version raised to ${bumpPluginVersion()}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
